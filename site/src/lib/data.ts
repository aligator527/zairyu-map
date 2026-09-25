// Loading and aggregating the static data produced by build_site_data.py.
//
// Every period file is a gzip-compressed block of columns (see build_site_data.py).
// All filtering happens in a single pass over typed arrays, which takes a few
// milliseconds even for the ~600k-row municipal periods.

export type Level = 'pref' | 'muni';

export interface Label { ja: string; en: string }
export interface Coded extends Label { code: string }
export interface Nat extends Coded { region: string }
export interface Muni extends Coded { pref: string; city: string; cityJa: string; geo: boolean }
export interface StatusGroup extends Label { id: string; codes: number[] }

export interface Meta {
  source: string;
  periods: { pref: string[]; muni: string[]; muniAgeSex: string[] };
  regions: Coded[];
  nat: Nat[];
  status: Coded[];
  statusGroups: StatusGroup[];
  pref: Coded[];
  sex: (Label & { code: number })[];
  age: (Label & { code: number })[];
  muni: Muni[];
  geoMerge: Record<string, string[]>;
  noStats: string[];
  /** total population per period: pref[p][0] = Japan, [1..47] = prefectures; muni[p][i] by muni index */
  population: { source: string; pref: Record<string, (number | null)[]>; muni: Record<string, (number | null)[]> };
}

export interface Block {
  level: Level;
  period: string;
  n: number;
  count: Uint32Array;
  region: Uint8Array | Uint16Array; // prefecture code (1..48) or muni index (1..)
  nat: Uint8Array;
  status: Uint8Array;
  sex: Uint8Array;
  age: Uint8Array;
}

const base = import.meta.env.BASE_URL;

async function gunzip(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const bytes = new Uint8Array(buf);
  // Some hosts transparently decode gzip; only inflate when the magic bytes are there.
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return buf;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

export async function loadMeta(): Promise<Meta> {
  const r = await fetch(`${base}data/meta.json`);
  if (!r.ok) throw new Error(`meta.json: ${r.status}`);
  return r.json();
}

const cache = new Map<string, Promise<Block>>();

export function loadBlock(level: Level, period: string): Promise<Block> {
  const key = `${level}/${period}`;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      const r = await fetch(`${base}data/${key}.bin`);
      if (!r.ok) throw new Error(`${key}: ${r.status}`);
      const buf = await gunzip(await r.arrayBuffer());
      const n = new DataView(buf).getUint32(0, true);
      let off = 4;
      const take = <T>(make: (o: number) => T, width: number): T => { const a = make(off); off += width * n; return a; };
      const u8 = () => take((o) => new Uint8Array(buf, o, n), 1);
      const count = take((o) => new Uint32Array(buf, o, n), 4);
      if (level === 'muni') {
        const region = take((o) => new Uint16Array(buf, o, n), 2);
        const nat = u8(), status = u8(), sex = u8(), age = u8();
        return { level, period, n, count, region, nat, status, sex, age };
      }
      const nat = u8(), status = u8(), region = u8(), sex = u8(), age = u8();
      return { level, period, n, count, region, nat, status, sex, age };
    })();
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

// ---------------------------------------------------------------- filters

export interface Filters {
  nat: Set<number>;     // empty = all
  status: Set<number>;
  sex: Set<number>;
  age: [number, number] | null; // inclusive 5-year group range (1..17), null = all
}

export const emptyFilters = (): Filters => ({ nat: new Set(), status: new Set(), sex: new Set(), age: null });

export function hasAgeSexFilter(f: Filters) {
  return f.sex.size > 0 || f.age !== null;
}

function mask(set: Set<number>, size = 256): Uint8Array | null {
  if (set.size === 0) return null;
  const m = new Uint8Array(size);
  for (const v of set) m[v] = 1;
  return m;
}

export interface Aggregate {
  /** value per region index (pref code or muni index) with all filters applied */
  value: Float64Array;
  /** part of the matching population whose filtered attribute is 秘匿 / not published */
  hidden: Float64Array;
  /** all foreigners per region (no filters) */
  all: Float64Array;
  /** breakdowns for the focused region (or Japan), each ignoring its own filter */
  byNat: Float64Array;
  byStatus: Float64Array;
  bySexAge: Float64Array; // index sex*19 + age
  total: number;       // focused region, all filters
  totalHidden: number;
  totalAll: number;    // focused region, no filters
}

/**
 * One pass over a period block.
 * focus: region index to compute the breakdowns for, or 0 for the whole country
 * (for municipalities, focusPref restricts to one prefecture instead).
 */
export function aggregate(b: Block, f: Filters, regions: number, focus = 0, focusPref = 0,
                          muniPref?: Uint8Array): Aggregate {
  const natM = mask(f.nat), stM = mask(f.status), sexM = mask(f.sex, 4);
  let ageM: Uint8Array | null = null;
  if (f.age) { ageM = new Uint8Array(20); for (let a = f.age[0]; a <= f.age[1]; a++) ageM[a] = 1; }

  const value = new Float64Array(regions), hidden = new Float64Array(regions), all = new Float64Array(regions);
  const byNat = new Float64Array(256), byStatus = new Float64Array(256), bySexAge = new Float64Array(4 * 19);
  let total = 0, totalHidden = 0, totalAll = 0;
  const { n, count, region, nat, status, sex, age } = b;

  for (let i = 0; i < n; i++) {
    const c = count[i], r = region[i];
    all[r] += c;
    const inFocus = focus ? r === focus : focusPref ? (muniPref ? muniPref[r] === focusPref : r === focusPref) : true;
    if (inFocus) totalAll += c;

    const nv = nat[i], sv = status[i], xv = sex[i], av = age[i];
    // 0 = not published: it matches "all", but is unknown under an active filter.
    const nOk = !natM || natM[nv] === 1, nUnk = !!natM && nv === 0;
    const sOk = !stM || stM[sv] === 1, sUnk = !!stM && sv === 0;
    const xOk = !sexM || sexM[xv] === 1, xUnk = !!sexM && xv === 0;
    const aOk = !ageM || ageM[av] === 1, aUnk = !!ageM && av === 0;

    const nP = nOk || nUnk, sP = sOk || sUnk, xP = xOk || xUnk, aP = aOk || aUnk;
    if (nP && sP && xP && aP) {
      if (nOk && sOk && xOk && aOk) {
        value[r] += c;
        if (inFocus) total += c;
      } else {
        hidden[r] += c;
        if (inFocus) totalHidden += c;
      }
    }
    if (!inFocus) continue;
    if (sOk && xOk && aOk) byNat[nv] += c;
    if (nOk && xOk && aOk) byStatus[sv] += c;
    if (nOk && sOk) bySexAge[xv * 19 + av] += c;
  }
  return { value, hidden, all, byNat, byStatus, bySexAge, total, totalHidden, totalAll };
}

/** Total for a region (or Japan) under all filters; used for the time series. */
export function totalFor(b: Block, f: Filters, focus = 0, focusPref = 0, muniPref?: Uint8Array): number {
  return aggregate(b, f, b.level === 'pref' ? 100 : 65536, focus, focusPref, muniPref).total;
}
