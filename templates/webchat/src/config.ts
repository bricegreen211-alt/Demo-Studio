/*
 * Demo Experience config loader.
 * demo.json lives next to the built app and is served fresh by Demo Studio on
 * every load — edit the form in the dashboard and refresh; no rebuild needed.
 */
export interface DemoConfig {
  id: string;
  name: string;
  template: string;
  panelStyle: string;
  agentName: string;
  welcomeMessage: string;
  userId: string;
  cognigy: { chatEndpoint: string; voiceEndpoint: string };
  theme: { primaryColor: string; secondaryColor: string; logo: string };
}

const FALLBACK: DemoConfig = {
  id: "",
  name: "Demo",
  template: "webchat",
  panelStyle: "solid",
  agentName: "AI Assistant",
  welcomeMessage: "",
  userId: "",
  cognigy: { chatEndpoint: "", voiceEndpoint: "" },
  theme: { primaryColor: "#3694fc", secondaryColor: "#f1f5f9", logo: "" },
};

export async function loadConfig(): Promise<DemoConfig> {
  try {
    const res = await fetch("./demo.json", { cache: "no-store" });
    const raw = await res.json();
    return {
      ...FALLBACK,
      ...raw,
      cognigy: { ...FALLBACK.cognigy, ...(raw.cognigy || {}) },
      theme: { ...FALLBACK.theme, ...(raw.theme || {}) },
    };
  } catch {
    return FALLBACK;
  }
}

/** Push theme colors into CSS variables so plain CSS stays brandable. */
export function applyTheme(cfg: DemoConfig) {
  const r = document.documentElement.style;
  r.setProperty("--brand-primary", cfg.theme.primaryColor);
  r.setProperty("--brand-secondary", cfg.theme.secondaryColor);
}

/**
 * Simulated mode. Opt-in ONLY via the literal endpoint value "mock" — a blank
 * or wrong endpoint still fails loudly, so a real customer demo can never
 * quietly serve scripted answers as if they came from a Cognigy agent.
 */
export function isMock(endpoint: string): boolean {
  return String(endpoint || "").trim().toLowerCase() === "mock";
}

/** Fresh random ids per load — sessions never leak between demo runs. */
export function randomId(prefix: string): string {
  return prefix + "-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
