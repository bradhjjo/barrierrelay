import { fetchAndActivate, getValue } from 'firebase/remote-config';
import type { AppConfig } from './contracts';
import { remoteConfig } from './firebase';
export const defaultConfig: AppConfig = { cloudModel: 'gemini-3.5-flash-lite', groundingEnabled: true, maxCloudCallsPerSession: 5, ruleCardsVersion: '1' };
remoteConfig.defaultConfig = { ...defaultConfig };
remoteConfig.settings.minimumFetchIntervalMillis = import.meta.env.DEV ? 0 : 3600000;
remoteConfig.settings.fetchTimeoutMillis = 10000;
export async function loadConfig(): Promise<AppConfig> {
  try { await fetchAndActivate(remoteConfig); } catch { return { ...defaultConfig }; }
  return { cloudModel: getValue(remoteConfig, 'cloudModel').asString() || defaultConfig.cloudModel, groundingEnabled: getValue(remoteConfig, 'groundingEnabled').asBoolean(), maxCloudCallsPerSession: Math.max(0, getValue(remoteConfig, 'maxCloudCallsPerSession').asNumber()), ruleCardsVersion: getValue(remoteConfig, 'ruleCardsVersion').asString() };
}
