// Regional immigration bureaus (地方出入国在留管理局) and their jurisdiction by
// prefecture, as published by the Immigration Services Agency
// (https://www.moj.go.jp/isa/about/region/index.html). Three district offices
// (支局) have their own prefecture: Yokohama (Kanagawa), Kobe (Hyogo) and
// Naha (Okinawa). Airport district offices have no residence jurisdiction.
// `office` is the municipality of the office address, used to place the marker.

export interface Branch { ja: string; en: string; pref: number; office: string }
export interface Bureau {
  id: number;
  ja: string;
  en: string;
  shortJa: string;
  shortEn: string;
  prefs: number[];
  office: string;
  branches: Branch[];
}

export const BUREAUS: Bureau[] = [
  { id: 1, ja: '札幌出入国在留管理局', en: 'Sapporo Regional Immigration Services Bureau', shortJa: '札幌', shortEn: 'Sapporo',
    prefs: [1], office: '01101', branches: [] },
  { id: 2, ja: '仙台出入国在留管理局', en: 'Sendai Regional Immigration Services Bureau', shortJa: '仙台', shortEn: 'Sendai',
    prefs: [2, 3, 4, 5, 6, 7], office: '04102', branches: [] },
  { id: 3, ja: '東京出入国在留管理局', en: 'Tokyo Regional Immigration Services Bureau', shortJa: '東京', shortEn: 'Tokyo',
    prefs: [8, 9, 10, 11, 12, 13, 14, 15, 19, 20], office: '13103',
    branches: [{ ja: '横浜支局', en: 'Yokohama District Office', pref: 14, office: '14108' }] },
  { id: 4, ja: '名古屋出入国在留管理局', en: 'Nagoya Regional Immigration Services Bureau', shortJa: '名古屋', shortEn: 'Nagoya',
    prefs: [16, 17, 18, 21, 22, 23, 24], office: '23111', branches: [] },
  { id: 5, ja: '大阪出入国在留管理局', en: 'Osaka Regional Immigration Services Bureau', shortJa: '大阪', shortEn: 'Osaka',
    prefs: [25, 26, 27, 28, 29, 30], office: '27125',
    branches: [{ ja: '神戸支局', en: 'Kobe District Office', pref: 28, office: '28110' }] },
  { id: 6, ja: '広島出入国在留管理局', en: 'Hiroshima Regional Immigration Services Bureau', shortJa: '広島', shortEn: 'Hiroshima',
    prefs: [31, 32, 33, 34, 35], office: '34101', branches: [] },
  { id: 7, ja: '高松出入国在留管理局', en: 'Takamatsu Regional Immigration Services Bureau', shortJa: '高松', shortEn: 'Takamatsu',
    prefs: [36, 37, 38, 39], office: '37201', branches: [] },
  { id: 8, ja: '福岡出入国在留管理局', en: 'Fukuoka Regional Immigration Services Bureau', shortJa: '福岡', shortEn: 'Fukuoka',
    prefs: [40, 41, 42, 43, 44, 45, 46, 47], office: '40133',
    branches: [{ ja: '那覇支局', en: 'Naha District Office', pref: 47, office: '47201' }] },
];

/** prefecture code (1..47) -> bureau id (1..8) */
export const bureauOfPref: Uint8Array = (() => {
  const a = new Uint8Array(100);
  for (const b of BUREAUS) for (const p of b.prefs) a[p] = b.id;
  return a;
})();

export function branchOfPref(pref: number): Branch | null {
  for (const b of BUREAUS) for (const br of b.branches) if (br.pref === pref) return br;
  return null;
}

export const bureauCode = (id: number) => `B${id}`;
