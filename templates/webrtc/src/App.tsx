import { DemoConfig } from "./config";
import VoiceView from "./voice/VoiceView";
import { useCognigyVoice } from "./voice/useCognigyVoice";

export default function App({ cfg }: { cfg: DemoConfig }) {
  const voice = useCognigyVoice(cfg);
  return <VoiceView cfg={cfg} voice={voice} />;
}
