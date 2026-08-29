import { DemoConfig } from "./config";
import ChatView from "./chat/ChatView";
import { useCognigyChat } from "./chat/useCognigyChat";

export default function App({ cfg }: { cfg: DemoConfig }) {
  const chat = useCognigyChat(cfg);
  return <ChatView cfg={cfg} chat={chat} />;
}
