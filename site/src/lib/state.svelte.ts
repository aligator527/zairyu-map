// Application state (Svelte 5 runes). Everything a viewer can change lives here
// and is mirrored into the URL hash, so any view can be bookmarked or shared.

import { SvelteSet } from 'svelte/reactivity';
import { dataLevel, type View } from './data';
import { detectLang, type Lang } from './i18n';
import type { Metric } from './scale';

export type Theme = 'system' | 'light' | 'dark';

function readStored<T extends string>(key: string, allowed: readonly T[]): T | null {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : null;
  } catch {
    return null;
  }
}
function store(key: string, v: string) {
  try { localStorage.setItem(key, v); } catch { /* private mode etc. */ }
}

class AppState {
  lang = $state<Lang>(readStored('lang', ['ja', 'en'] as const) ?? detectLang());
  theme = $state<Theme>(readStored('theme', ['system', 'light', 'dark'] as const) ?? 'system');
  systemDark = $state(false);

  level = $state<View>('pref');
  period = $state<string>('');
  metric = $state<Metric>('count');

  nat = new SvelteSet<number>();
  status = new SvelteSet<number>();
  sex = new SvelteSet<number>();
  age = $state<[number, number] | null>(null);

  /** focused prefecture code (1..47) — 0 = all of Japan */
  pref = $state(0);
  /** focused municipality index (meta.muni[i-1]) — 0 = none */
  muni = $state(0);
  /** focused immigration bureau (1..8) in the bureau view — 0 = none */
  bureau = $state(0);
  /** draw immigration bureau jurisdictions over the prefecture / municipal map */
  showBureaus = $state(false);
  /** selected immigration office (meta.offices id) — 0 = none */
  office = $state(0);

  view = $state<'map' | 'table'>('map');

  get dark() {
    return this.theme === 'dark' || (this.theme === 'system' && this.systemDark);
  }

  get filterCount() {
    return this.nat.size + this.status.size + this.sex.size + (this.age ? 1 : 0);
  }

  clearFilters() {
    this.nat.clear();
    this.status.clear();
    this.sex.clear();
    this.age = null;
  }

  setLang(l: Lang) { this.lang = l; store('lang', l); }
  setTheme(t: Theme) { this.theme = t; store('theme', t); }

  toggle(set: SvelteSet<number>, v: number) {
    if (set.has(v)) set.delete(v); else set.add(v);
  }

  // ------------------------------------------------------------ URL <-> state
  toHash(): string {
    const p = new URLSearchParams();
    if (this.period) p.set('p', this.period);
    if (this.level !== 'pref') p.set('g', this.level);
    if (this.metric !== 'count') p.set('m', this.metric);
    const list = (s: Set<number>) => [...s].sort((a, b) => a - b).join('.');
    if (this.nat.size) p.set('n', list(this.nat));
    if (this.status.size) p.set('s', list(this.status));
    if (this.sex.size) p.set('x', list(this.sex));
    if (this.age) p.set('a', `${this.age[0]}-${this.age[1]}`);
    if (this.pref) p.set('r', String(this.pref));
    if (this.muni) p.set('c', String(this.muni));
    if (this.bureau) p.set('b', String(this.bureau));
    if (this.showBureaus) p.set('o', '1');
    if (this.office) p.set('f', String(this.office));
    if (this.view !== 'map') p.set('v', this.view);
    return p.toString();
  }

  fromHash(hash: string, periods: { pref: string[]; muni: string[] }) {
    const p = new URLSearchParams(hash.replace(/^#/, ''));
    const nums = (k: string) => (p.get(k) ?? '').split('.').map(Number).filter((v) => Number.isInteger(v) && v > 0);
    const g = p.get('g');
    const level: View = g === 'muni' || g === 'bureau' ? g : 'pref';
    const list = periods[dataLevel(level)];
    this.level = level;
    this.period = list.includes(p.get('p') ?? '') ? p.get('p')! : list[list.length - 1];
    const m = p.get('m');
    this.metric = m === 'share' || m === 'change' || m === 'per1000' ? m : 'count';
    this.nat.clear(); nums('n').forEach((v) => this.nat.add(v));
    this.status.clear(); nums('s').forEach((v) => this.status.add(v));
    this.sex.clear(); nums('x').filter((v) => v <= 3).forEach((v) => this.sex.add(v));
    const a = (p.get('a') ?? '').split('-').map(Number);
    this.age = a.length === 2 && a[0] >= 1 && a[1] <= 17 && a[0] <= a[1] ? [a[0], a[1]] : null;
    this.pref = Math.min(47, Math.max(0, Number(p.get('r')) || 0));
    this.muni = Math.max(0, Number(p.get('c')) || 0);
    this.bureau = Math.min(8, Math.max(0, Number(p.get('b')) || 0));
    this.showBureaus = p.get('o') === '1';
    this.office = Math.max(0, Number(p.get('f')) || 0);
    this.view = p.get('v') === 'table' ? 'table' : 'map';
  }
}

export const app = new AppState();
