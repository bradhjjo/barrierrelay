import type { AiPipeline, CaptureIntake, Redact } from './contracts';
import { createAiPipeline } from './ai/pipeline';
import { captureIntake } from './capture/intake';
import { redact } from './privacy/redact';
import { createFakePipeline } from './dev/fakePipeline';
import { ticketStore } from './store/tickets';
import { app } from './firebase';
import { defaultConfig, loadConfig } from './config';
export { ticketStore };
export interface Services { pipeline: AiPipeline; intake: CaptureIntake; redact: Redact; demo: boolean }
export async function createServices(): Promise<Services> {
  const demo = new URLSearchParams(location.search).get('demo') === '1';
  let config = { ...defaultConfig };
  void loadConfig().then(value => { config = value; });
  return { pipeline: demo ? createFakePipeline() : createAiPipeline({ app, getConfig: () => config }), intake: captureIntake, redact, demo };
}
