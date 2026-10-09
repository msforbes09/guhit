import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

// The model runs here so token generation never blocks drawing or the UI.
const handler = new WebWorkerMLCEngineHandler();

self.onmessage = (event: MessageEvent) => {
  handler.onmessage(event);
};
