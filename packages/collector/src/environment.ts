import type { CaptureFacts } from '../../shared/src/schema';

/** Coarse, synchronous hints only; never request high-entropy UA data. */
export function collectEnvironment(): NonNullable<CaptureFacts['environment']> {
  const nav = navigator as Navigator & { userAgentData?: { brands: { brand: string; version: string }[]; platform: string } };
  const ua = nav.userAgent;
  const brands = nav.userAgentData?.brands.filter(b => !/not.*brand/i.test(b.brand)) ?? [];
  const brand = brands.find(b => b.brand !== 'Chromium') ?? brands[0];
  const fallback = ua.match(/(Edg|OPR|Firefox|CriOS|FxiOS)\/(\d+)/) ?? ua.match(/(Chrome|Version)\/(\d+)/);
  const names: Record<string, string> = { Edg: 'Edge', OPR: 'Opera', Version: 'Safari', CriOS: 'Chrome', FxiOS: 'Firefox' };
  const version = Number.parseInt(brand?.version ?? fallback?.[2] ?? '', 10);
  const matches = (query: string) => typeof matchMedia === 'function' && matchMedia(query).matches;
  return {
    browser: { name: (brand?.brand ?? (fallback ? names[fallback[1]] ?? fallback[1] : 'Unknown')).slice(0, 40), major: Number.isInteger(version) && version >= 0 && version <= 999 ? version : null },
    os: { name: (nav.userAgentData?.platform || (/Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : 'Unknown')).slice(0, 40) },
    settings: { forcedColors: matches('(forced-colors: active)'), prefersContrast: matches('(prefers-contrast: more)') ? 'more' : matches('(prefers-contrast: less)') ? 'less' : matches('(prefers-contrast: custom)') ? 'custom' : 'no-preference', reducedMotion: matches('(prefers-reduced-motion: reduce)'), colorScheme: matches('(prefers-color-scheme: dark)') ? 'dark' : 'light', devicePixelRatio: Math.min(10, Math.max(0, window.devicePixelRatio || 1)) },
  };
}

export function environmentWords(e: NonNullable<CaptureFacts['environment']>): string[] {
  return [`Browser: ${e.browser.name}${e.browser.major === null ? '' : ` ${e.browser.major}`}`, `OS: ${e.os.name} (version not collected)`, `Forced colors: ${e.settings.forcedColors ? 'active' : 'inactive'}`, `Contrast preference: ${e.settings.prefersContrast}`, `Reduced motion: ${e.settings.reducedMotion ? 'requested' : 'not requested'}`, `Color scheme: ${e.settings.colorScheme}`, `Device pixel ratio: ${e.settings.devicePixelRatio}`];
}
