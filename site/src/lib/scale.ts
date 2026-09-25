// Classed colour scales for the choropleth.
// Sequential: one hue — 紅 (crimson, around the 日の丸 red #bc002d), light -> dark,
// generated in OKLCH with monotone lightness; in dark mode the anchor flips so
// "more" is always further from the surface.
// Diverging (change): 藍 indigo (decrease) <- neutral gray -> 紅 crimson (increase).

import type { Lang } from './i18n';

export type Metric = 'count' | 'per1000' | 'share' | 'change';

export const SEQ = {
  light: ['#ffd6d4', '#feb5b1', '#f98e8b', '#eb6264', '#d42e3d', '#a91228', '#790c1b'],
  dark: ['#682224', '#8d242a', '#b32130', '#d73d47', '#e97170', '#f4a19e', '#facecc'],
};
export const DIV = {
  light: ['#2e5297', '#6d92d6', '#bfd2f3', '#ece9e2', '#feb5b1', '#eb6264', '#a91228'],
  dark: ['#a5bfec', '#587fc8', '#28467d', '#383835', '#8d242a', '#d73d47', '#f4a19e'],
};

export interface Classes {
  breaks: number[]; // upper bounds of classes 0..k-2 (last class is open)
  colors: string[];
  diverging: boolean;
}

function nice(v: number): number {
  if (v === 0 || !isFinite(v)) return v;
  const sign = Math.sign(v), a = Math.abs(v);
  const p = Math.pow(10, Math.floor(Math.log10(a)) - 1);
  return sign * Math.round(a / p) * p;
}

function quantiles(sorted: number[], k: number): number[] {
  const out: number[] = [];
  for (let i = 1; i < k; i++) {
    const q = sorted[Math.min(sorted.length - 1, Math.floor((i / k) * sorted.length))];
    out.push(q);
  }
  return out;
}

/** Roughly equal-count classes with rounded, strictly increasing breaks. */
export function makeClasses(values: number[], metric: Metric, dark: boolean): Classes {
  const mode = dark ? 'dark' : 'light';
  if (metric === 'change') {
    const abs = values.filter((v) => isFinite(v)).map(Math.abs).sort((a, b) => a - b);
    let [t1, t2, t3] = abs.length ? quantiles(abs, 4) : [1, 5, 10];
    t1 = Math.max(nice(t1), 0.5); t2 = Math.max(nice(t2), t1 * 1.5); t3 = Math.max(nice(t3), t2 * 1.5);
    return { breaks: [-t3, -t2, -t1, t1, t2, t3], colors: DIV[mode], diverging: true };
  }
  const pos = values.filter((v) => v > 0 && isFinite(v)).sort((a, b) => a - b);
  const colors = SEQ[mode];
  if (pos.length === 0) return { breaks: [], colors: colors.slice(0, 1), diverging: false };
  const raw = quantiles(pos, colors.length).map(nice);
  const breaks: number[] = [];
  for (const b of raw) if (b > (breaks.at(-1) ?? 0)) breaks.push(b);
  return { breaks, colors: colors.slice(colors.length - breaks.length - 1), diverging: false };
}

export function classOf(c: Classes, v: number): number {
  let i = 0;
  while (i < c.breaks.length && v >= c.breaks[i]) i++;
  return i;
}

// ---------------------------------------------------------------- number formatting

const nf = new Map<string, Intl.NumberFormat>();
function fmt(lang: Lang, opts: Intl.NumberFormatOptions) {
  const key = lang + JSON.stringify(opts);
  let f = nf.get(key);
  if (!f) nf.set(key, (f = new Intl.NumberFormat(lang === 'ja' ? 'ja-JP' : 'en-US', opts)));
  return f;
}

export const fmtInt = (lang: Lang, v: number) => fmt(lang, { maximumFractionDigits: 0 }).format(v);
export const fmtCompact = (lang: Lang, v: number) =>
  fmt(lang, { notation: 'compact', maximumSignificantDigits: 3 }).format(v);
export const fmtPct = (lang: Lang, v: number, digits = 1) =>
  fmt(lang, { maximumFractionDigits: digits, minimumFractionDigits: v !== 0 && Math.abs(v) < 10 ? digits : 0 }).format(v) + '%';
export const fmtSignedPct = (lang: Lang, v: number) =>
  (v > 0 ? '+' : v < 0 ? '−' : '±') + fmtPct(lang, Math.abs(v));

export function fmtMetric(lang: Lang, metric: Metric, v: number): string {
  if (!isFinite(v)) return '–';
  if (metric === 'share') return fmtPct(lang, v);
  if (metric === 'change') return fmtSignedPct(lang, v);
  if (metric === 'per1000') return fmtRate(lang, v);
  return fmtInt(lang, v);
}

/** Foreign residents per 1,000 inhabitants. */
export const fmtRate = (lang: Lang, v: number) =>
  v > 0 && v < 1
    ? fmt(lang, { maximumSignificantDigits: 2 }).format(v)
    : fmt(lang, { maximumFractionDigits: v < 10 ? 1 : 0, minimumFractionDigits: v < 10 ? 1 : 0 }).format(v);

export function fmtBreak(lang: Lang, metric: Metric, v: number): string {
  if (metric === 'count') return fmtCompact(lang, v);
  if (metric === 'per1000') return fmtRate(lang, v);
  if (metric === 'change') return (v > 0 ? '+' : v < 0 ? '−' : '') + fmtPct(lang, Math.abs(v), 1);
  return fmtPct(lang, v);
}
