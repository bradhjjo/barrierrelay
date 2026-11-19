#!/usr/bin/env node
// Invoked only by ego-browser as its managed Chrome engine.
import { spawn } from 'node:child_process';
const features = 'OptimizationGuideOnDeviceModel:BypassPerfRequirement/true,OptimizationGuideManifestBroker,OptimizationGuideModelExecution,OptimizationGuideModelDownloading,OptimizationHints,AIPromptAPI,AIPromptAPIMultimodalInput,AIPromptAPIStructuredOutput,AIPromptAPILegacyParams,PromptAPIForGeminiNano,PromptAPIForGeminiNanoMultimodalInput';
const child = spawn('/opt/google/chrome/chrome', [...process.argv.slice(2), '--window-size=1920,1080', '--force-device-scale-factor=1', ...(process.env.VIDEO_NANO === '1' ? [`--enable-features=${features}`] : ['--enable-unsafe-extension-debugging'])], { stdio: 'inherit' });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.on('exit', code => process.exit(code ?? 1));
