import { createRoot } from "react-dom/client";
import App from "./App";
import { applyTheme, loadConfig } from "./config";
import "./styles.css";

loadConfig().then((cfg) => {
  document.title = cfg.name || "Demo Experience";
  applyTheme(cfg);
  createRoot(document.getElementById("root")!).render(<App cfg={cfg} />);
});
