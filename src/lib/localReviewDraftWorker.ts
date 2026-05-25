// Web Worker host for the WebLLM engine, so on-device generation never blocks
// the UI thread. Instantiated by localReviewDraft.ts via CreateWebWorkerMLCEngine.
import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm'

const handler = new WebWorkerMLCEngineHandler()

self.onmessage = (event: MessageEvent) => {
  handler.onmessage(event)
}
