/*
 * Cognigy Demo Studio — universal microphone cleanup.
 *
 * Bundled to apps/studio/service/vendor/cds-audio-clean.js (window.CDSAudio)
 * by `node assets/build-audio-clean.js`. Rerun that after editing this file.
 *
 * WHY THIS EXISTS AS A getUserMedia PATCH, and not as template code:
 *
 * @cognigy/click-to-call-sdk asks for the mic itself, deep inside JsSIP, with
 * a hardcoded `{ audio: true, video: false }` — no echoCancellation, no
 * noiseSuppression, no autoGainControl, and no config hook to change any of
 * it (WebRTCClientConfig is endpointUrl/userId/pcConfig/captureAudio, and
 * captureAudio is about the REMOTE stream). So the only place to improve the
 * outbound audio is between the browser and the SDK.
 *
 * That turns out to be the right layer anyway. usesVoiceWidget() serves a demo
 * two completely different ways depending on its THEME — Cognigy Default gets
 * Cognigy's real widget, every other theme gets the demo's own voice UI out of
 * dist/ — so anything built into a template would have to be rebuilt into each
 * new theme, and a vibe-coded one would silently lose it. A getUserMedia patch
 * sits below all of that. One layer, every theme, including themes that don't
 * exist yet.
 *
 * Chain:  mic → [denoiser: rnnoise|gtcrn|speex|none] → [noise gate] → SDK
 *
 * Everything degrades. If a worklet won't load or a wasm won't compile we drop
 * to gate-only, then to constraints-only, then to the raw stream. A denoiser
 * that fails must never cost an SE a call in front of a customer.
 */
import {
  NoiseGateWorkletNode,
  RnnoiseWorkletNode,
  GtcrnWorkletNode,
  SpeexWorkletNode,
  loadRnnoise,
  loadGtcrn,
  loadSpeex
} from "@sapphi-red/web-noise-suppressor";

const DEFAULTS = {
  base: "/_cds/audio/",
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  engine: "none",           // "none" | "rnnoise" | "gtcrn" | "speex"
  gate: false,
  gateOpenThreshold: -50,
  gateCloseThreshold: -60,
  gateHoldMs: 90,
  panel: true,
  debug: false
};

const ENGINES = ["none", "rnnoise", "gtcrn", "speex"];

function cfg() {
  const raw = (typeof window !== "undefined" && window.__CDS_AUDIO__) || {};
  const out = Object.assign({}, DEFAULTS, raw);
  if (ENGINES.indexOf(out.engine) < 0) out.engine = "none";
  return out;
}

function log(...args) {
  if (cfg().debug) console.log("[cds-audio]", ...args);
}
function warn(...args) {
  console.warn("[cds-audio]", ...args);
}

/* ── worklet + wasm loading, cached across calls ───────────────────────── */

const modules = new Map();   // ctx -> Set of worklet urls already added
const binaries = new Map();  // engine -> Promise<ArrayBuffer>

function url(name) {
  return cfg().base + name;
}

async function addModuleOnce(ctx, file) {
  let done = modules.get(ctx);
  if (!done) { done = new Set(); modules.set(ctx, done); }
  if (done.has(file)) return;
  await ctx.audioWorklet.addModule(url(file));
  done.add(file);
}

function binary(engine) {
  if (binaries.has(engine)) return binaries.get(engine);
  let p;
  if (engine === "rnnoise") {
    p = loadRnnoise({ url: url("rnnoise.wasm"), simdUrl: url("rnnoise_simd.wasm") });
  } else if (engine === "gtcrn") {
    p = loadGtcrn({ url: url("gtcrn.wasm") });
  } else if (engine === "speex") {
    p = loadSpeex({ url: url("speex.wasm") });
  } else {
    p = Promise.resolve(null);
  }
  // A failed fetch must not poison the cache — the SE may fix it and retry.
  p = p.catch((err) => { binaries.delete(engine); throw err; });
  binaries.set(engine, p);
  return p;
}

/* ── the processing chain ──────────────────────────────────────────────── */

const chains = new Set();

/*
 * RNNoise assumes 48kHz (documented in its worklet node). Rather than refusing
 * to denoise on a device that reports something else — Bluetooth headsets drop
 * to 16k in hands-free mode, which is exactly the mic an SE ends up on — ask
 * for a 48k context and let the browser resample. If the browser won't give us
 * one, fall back to the default rate and skip rnnoise specifically.
 */
function makeContext(engine) {
  if (engine === "rnnoise") {
    try {
      const ctx = new AudioContext({ sampleRate: 48000 });
      if (ctx.sampleRate === 48000) return ctx;
      ctx.close().catch(() => {});
    } catch (e) { /* fall through */ }
  }
  return new AudioContext();
}

async function makeDenoiser(ctx, engine) {
  if (engine === "none") return null;
  if (engine === "rnnoise" && ctx.sampleRate !== 48000) {
    warn("rnnoise needs a 48kHz context, got " + ctx.sampleRate + "Hz — skipping the denoiser");
    return null;
  }
  const file = { rnnoise: "rnnoiseWorklet.js", gtcrn: "gtcrnWorklet.js", speex: "speexWorklet.js" }[engine];
  const [wasmBinary] = await Promise.all([binary(engine), addModuleOnce(ctx, file)]);
  const opts = { wasmBinary, maxChannels: 1 };
  if (engine === "rnnoise") return new RnnoiseWorkletNode(ctx, opts);
  if (engine === "gtcrn") return new GtcrnWorkletNode(ctx, opts);
  return new SpeexWorkletNode(ctx, opts);
}

async function makeGate(ctx, c) {
  await addModuleOnce(ctx, "noiseGateWorklet.js");
  return new NoiseGateWorkletNode(ctx, {
    openThreshold: c.gateOpenThreshold,
    closeThreshold: Math.min(c.gateCloseThreshold, c.gateOpenThreshold),
    holdMs: c.gateHoldMs,
    maxChannels: 1
  });
}

/*
 * How long to let a denoiser initialise before giving up and splicing it in
 * anyway. Measured at 0.67s (rnnoise) to 1.0s (gtcrn, speex) on a fast machine
 * with the wasm already cached, so this is deliberately generous.
 */
var WARMUP_MAX_MS = 2500;

/*
 * A denoiser worklet compiles its wasm ASYNCHRONOUSLY in its own constructor,
 * and until that finishes its process() emits SILENCE rather than passing audio
 * through. Splice one straight into a live call and the first ~1s is simply
 * gone — the SE's opening word, or a second of dead air every time the engine
 * is switched from the gear.
 *
 * So a new denoiser is warmed up OFF the live path: fed from the source with
 * its output going nowhere but a probe, until real audio comes out the far
 * side. Only then is it wired in. The call keeps running on the old graph the
 * whole time, which is what makes switching engines mid-call seamless.
 *
 * The probe can't tell "not ready" from "the room is silent", hence the
 * timeout — worst case the first couple of seconds are unprocessed, which is
 * audible and correct, rather than silent and broken.
 */
function warmUp(chain, node) {
  var ctx = chain.ctx;
  var probe = ctx.createAnalyser();
  probe.fftSize = 256;
  var buf = new Float32Array(probe.fftSize);
  chain.source.connect(node);
  node.connect(probe);

  var t0 = (performance || Date).now();
  return new Promise(function (resolve) {
    (function poll() {
      probe.getFloatTimeDomainData(buf);
      var sum = 0;
      for (var i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      var flowing = Math.sqrt(sum / buf.length) > 1e-5;
      var elapsed = (performance || Date).now() - t0;
      if (flowing || elapsed > WARMUP_MAX_MS) {
        try { node.disconnect(probe); } catch (e) {}
        try { probe.disconnect(); } catch (e) {}
        log("denoiser warm after " + Math.round(elapsed) + "ms" + (flowing ? "" : " (timed out)"));
        resolve();
      } else {
        setTimeout(poll, 30);
      }
    })();
  });
}

/*
 * Wire source → [denoiser] → [gate] → destination.
 *
 * Called both on setup and on every live config change. The destination node —
 * and therefore the track the SDK handed to RTCPeerConnection.addTrack — is
 * never replaced, so switching engines mid-call needs no replaceTrack and
 * triggers no SDP renegotiation. That is the whole reason the in-widget gear
 * can A/B denoisers while the customer is talking.
 */
async function rewire(chain) {
  const c = cfg();
  const { ctx, source, analyser, dest } = chain;

  /*
   * Phase 1 — build everything the new configuration needs while the CURRENT
   * graph keeps carrying the call. Nothing below this point disconnects
   * anything, so a slow wasm compile costs no audio.
   */
  let nextDenoiser = chain.denoiser;
  if (c.engine !== chain.engine) {
    nextDenoiser = null;
    if (c.engine !== "none") {
      try {
        const node = await makeDenoiser(ctx, c.engine);
        if (node) { await warmUp(chain, node); nextDenoiser = node; }
      } catch (err) {
        warn("denoiser \"" + c.engine + "\" failed to load — continuing without it", err);
        nextDenoiser = null;
      }
    }
  }

  // NoiseGateWorkletNode takes its thresholds in the constructor, so any change
  // means a new node. It is JS-only, initialises synchronously and needs no
  // warm-up — verified: it gates correctly on its very first render quantum.
  let nextGate = null;
  if (c.gate) {
    try {
      nextGate = await makeGate(ctx, c);
    } catch (err) {
      warn("noise gate failed to load — continuing without it", err);
      nextGate = null;
    }
  }

  /* Phase 2 — swap. Synchronous from here, so there is no window with a
   * half-connected graph. */
  try { source.disconnect(); } catch (e) {}
  try { analyser.disconnect(); } catch (e) {}
  if (chain.denoiser) { try { chain.denoiser.disconnect(); } catch (e) {} }
  if (chain.gate) { try { chain.gate.disconnect(); } catch (e) {} }

  if (chain.denoiser && chain.denoiser !== nextDenoiser && chain.denoiser.destroy) {
    try { chain.denoiser.destroy(); } catch (e) {}
  }
  chain.denoiser = nextDenoiser;
  chain.gate = nextGate;
  chain.engine = c.engine;

  // analyser taps the signal pre-gate, which is what the level meter and the
  // gate-open dot both need: post-gate the meter would read silence whenever
  // the gate did its job, which looks broken rather than correct.
  source.connect(analyser);
  let node = source;
  if (chain.denoiser) { node.connect(chain.denoiser); node = chain.denoiser; }
  if (chain.gate) { node.connect(chain.gate); node = chain.gate; }
  node.connect(dest);

  log("wired", { engine: chain.engine, denoiser: !!chain.denoiser, gate: !!chain.gate, rate: ctx.sampleRate });
}

function teardown(chain) {
  if (!chains.has(chain)) return;
  chains.delete(chain);
  try { chain.rawStream.getTracks().forEach((t) => t.stop()); } catch (e) {}
  if (chain.denoiser && chain.denoiser.destroy) { try { chain.denoiser.destroy(); } catch (e) {} }
  modules.delete(chain.ctx);
  try { chain.ctx.close(); } catch (e) {}
  log("torn down");
}

async function build(rawStream) {
  const c = cfg();
  const ctx = makeContext(c.engine);
  if (ctx.state === "suspended") { try { await ctx.resume(); } catch (e) {} }

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.6;

  const chain = {
    ctx,
    rawStream,
    source: ctx.createMediaStreamSource(rawStream),
    analyser,
    dest: ctx.createMediaStreamDestination(),
    denoiser: null,
    gate: null,
    engine: "none"
  };
  /*
   * Wire a working graph immediately and return. Call setup must not block on
   * a wasm compile — JsSIP is waiting on this promise to build its offer — so
   * the denoiser splices itself in a moment later, once warm. Worst case the
   * opening second is unprocessed; it is never silent, and the call is never
   * held up.
   */
  chain.source.connect(chain.analyser);
  chain.source.connect(chain.dest);
  chains.add(chain);
  rewire(chain).catch(function (err) { warn("chain setup failed", err); });

  const out = chain.dest.stream;
  const track = out.getAudioTracks()[0];

  /*
   * The processed track is a Web Audio destination, so stopping it does NOT
   * stop the microphone. Without this the OS mic indicator stays lit after the
   * SE hangs up — in front of the customer.
   */
  if (track) {
    const nativeStop = track.stop.bind(track);
    track.stop = function () { nativeStop(); teardown(chain); };
    chain.outTrack = track;
  }
  // Device unplugged, or permission revoked mid-call.
  rawStream.getAudioTracks().forEach((t) => t.addEventListener("ended", () => teardown(chain)));

  return out;
}

/* ── constraint merging ────────────────────────────────────────────────── */

function mergeConstraints(constraints) {
  const c = cfg();
  const audio = (constraints.audio === true || constraints.audio == null) ? {} : Object.assign({}, constraints.audio);
  // Never clobber a caller-supplied deviceId: Remote Control's mic switcher
  // passes { deviceId: { exact } } and has to keep selecting that device.
  audio.echoCancellation = c.echoCancellation;
  audio.noiseSuppression = c.noiseSuppression;
  audio.autoGainControl = c.autoGainControl;
  return Object.assign({}, constraints, { audio });
}

/* ── the patch ─────────────────────────────────────────────────────────── */

let NATIVE_GUM = null;

function install() {
  const md = navigator.mediaDevices;
  if (!md || !md.getUserMedia) return false;
  if (md.__cdsAudioPatched) return true;

  const native = md.getUserMedia.bind(md);
  NATIVE_GUM = native;
  md.getUserMedia = async function (constraints) {
    if (!constraints || !constraints.audio) return native(constraints);
    // Video capture is somebody else's business; leave it completely alone.
    if (constraints.video) return native(constraints);

    const merged = mergeConstraints(constraints);
    const raw = await native(merged);

    const c = cfg();
    if (c.engine === "none" && !c.gate) return raw;

    try {
      return await build(raw);
    } catch (err) {
      warn("audio chain failed to build — falling back to the raw microphone", err);
      return raw;
    }
  };
  md.__cdsAudioPatched = true;

  // Pull the wasm down now rather than at call time: the warm-up is short
  // enough already without a cold fetch in front of it.
  const engine = cfg().engine;
  if (engine !== "none") binary(engine).catch(function () { /* retried on use */ });

  log("installed");
  return true;
}

/* ── public surface (window.CDSAudio) ──────────────────────────────────── */

/** Push a new config and rewire every live call, with no track replacement. */
async function apply(patch) {
  window.__CDS_AUDIO__ = Object.assign({}, cfg(), patch || {});
  await Promise.all([...chains].map((chain) => rewire(chain).catch((err) => warn("rewire failed", err))));
  return cfg();
}

/** True while at least one processed chain is running. */
function isActive() {
  return chains.size > 0;
}

/**
 * Level in dBFS plus whether the gate would be open, for the meter in the
 * Settings card and in the gear popover. Returns null when nothing is running.
 */
function level() {
  const chain = [...chains][0];
  if (!chain) return null;
  return readLevel(chain.analyser, chain);
}

const buffers = new WeakMap();
function readLevel(analyser, state) {
  let buf = buffers.get(analyser);
  if (!buf || buf.length !== analyser.fftSize) {
    buf = new Float32Array(analyser.fftSize);
    buffers.set(analyser, buf);
  }
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  const rms = Math.sqrt(sum / buf.length);
  const db = rms > 0 ? 20 * Math.log10(rms) : -100;

  // Mirror the gate's own hysteresis so the dot matches what the audio does.
  const c = cfg();
  const open = c.gate
    ? (state.__open ? db > Math.min(c.gateCloseThreshold, c.gateOpenThreshold) : db > c.gateOpenThreshold)
    : true;
  state.__open = open;
  return { db, open };
}

/**
 * Standalone meter for the Settings card, where no call is running. Owns its
 * own mic stream; stop() releases it. Callers MUST stop it when their view
 * closes or the OS mic indicator stays lit while the SE sits in the dashboard.
 */
async function monitor() {
  /*
   * Deliberately bypasses our own patch, using the reference captured at
   * install time: the meter must show the ROOM, not the processed result, or
   * the SE would be setting a gate threshold against audio the gate had
   * already cleaned up.
   */
  const capture = NATIVE_GUM || navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  const stream = await capture({ audio: true });
  const ctx = new AudioContext();
  if (ctx.state === "suspended") { try { await ctx.resume(); } catch (e) {} }
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.6;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const state = {};
  return {
    read: () => readLevel(analyser, state),
    stop: () => {
      try { stream.getTracks().forEach((t) => t.stop()); } catch (e) {}
      try { ctx.close(); } catch (e) {}
    }
  };
}

install();

export { install, apply, isActive, level, monitor, cfg, ENGINES };
