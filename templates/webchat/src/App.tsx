import { DemoConfig } from "./config";
import ChatView from "./chat/ChatView";
import Shell from "./shell/Shell";
import { useCognigyChat } from "./chat/useCognigyChat";

export default function App({ cfg }: { cfg: DemoConfig }) {
  const chat = useCognigyChat(cfg);
  const view = <ChatView cfg={cfg} chat={chat} />;

  // "overlay" panel style: this demo draws its own launcher and panel card
  // (see src/shell/) instead of the browser extension providing them.
  return cfg.panelStyle === "overlay" ? <Shell cfg={cfg}>{view}</Shell> : view;
}
