export interface Item { id: number; label: string; alt: string; value: number }
export interface Group { id: string; label: string; ids: number[] }

/** One map area in the current view, with all metrics resolved. */
export interface Area {
  idx: number;          // pref code (1..47) or muni index
  code: string;
  name: string;
  alt: string;          // name in the other language
  parent: string;       // prefecture name for municipalities
  prefIdx: number;
  count: number;
  hidden: number;
  all: number;
  pop: number;          // total population (住民基本台帳), NaN if unknown
  per1000: number;      // matching foreign residents per 1,000 inhabitants
  share: number;        // % of all foreign residents in the area
  change: number;       // % vs previous period (NaN if unknown)
  prevCount: number;
  value: number;        // the active metric
  state: 'ok' | 'zero' | 'hidden' | 'excluded';
}
