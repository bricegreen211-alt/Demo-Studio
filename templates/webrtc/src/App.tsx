import { DemoConfig } from "./config";
import VoiceView from "./voice/VoiceView";
import Shell from "./shell/Shell";
import { useCognigyVoice } from "./voice/useCognigyVoice";

export default function App({ cfg }: { cfg: DemoConfig }) {
  const voice = useCognigyVoice(cfg);
  const view = <VoiceView cfg={cfg} voice={voice} />;

  // "overlay" panel style: this demo draws its own launcher and panel card
  // (see src/shell/) instead of the browser extension providing them.
  return cfg.panelStyle === "overlay" ? <Shell cfg={cfg}>{view}</Shell> : view;
}
