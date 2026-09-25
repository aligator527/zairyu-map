export type Lang = 'ja' | 'en';

const strings = {
  title: { ja: '在留外国人マップ', en: 'Foreign Residents in Japan' },
  subtitle: {
    ja: '都道府県・市区町村別、国籍・在留資格・年齢・性別で見る在留外国人統計',
    en: 'Registered foreign residents by prefecture and municipality, nationality, residence status, age and sex',
  },
  period: { ja: '時点', en: 'Period' },
  level: { ja: '地域の単位', en: 'Geography' },
  levelPref: { ja: '都道府県', en: 'Prefectures' },
  levelMuni: { ja: '市区町村', en: 'Municipalities' },
  muniSince: { ja: '2023年12月以降', en: 'from Dec 2023' },
  metric: { ja: '表示する値', en: 'Show' },
  metricCount: { ja: '人数', en: 'Residents' },
  metricShare: { ja: '構成比', en: 'Share' },
  metricPer1000: { ja: '人口千人あたり', en: 'Per 1,000' },
  metricPer1000Hint: {
    ja: '総人口（日本人＋外国人、住民基本台帳）千人あたりの、条件に該当する在留外国人数',
    en: 'Matching foreign residents per 1,000 inhabitants (Japanese + foreign, Basic Resident Register)',
  },
  per1000Long: { ja: '人口千人あたり', en: 'per 1,000 inhabitants' },
  per1000: { ja: '千人あたり', en: 'Per 1,000' },
  population: { ja: '総人口', en: 'Population' },
  popNote: {
    ja: '人口千人あたりの値は、総務省「住民基本台帳に基づく人口」（各年1月1日、日本人＋外国人）を分母として算出。6月末は前後の1月1日の平均。',
    en: 'Per-1,000 figures use the Basic Resident Register population (1 January, Japanese + foreign) as the denominator; June periods use the mean of the surrounding 1 January figures.',
  },
  metricChange: { ja: '増減率', en: 'Change' },
  metricShareHint: {
    ja: '地域の在留外国人全体に占める、選択条件に該当する人の割合',
    en: 'Share of all foreign residents in the area who match the filters',
  },
  metricChangeHint: { ja: '前の時点からの増減率', en: 'Change since the previous period' },
  nationality: { ja: '国籍・地域', en: 'Nationality' },
  status: { ja: '在留資格', en: 'Residence status' },
  sex: { ja: '性別', en: 'Sex' },
  age: { ja: '年齢', en: 'Age' },
  all: { ja: 'すべて', en: 'All' },
  allAges: { ja: '全年齢', en: 'All ages' },
  search: { ja: '検索', en: 'Search' },
  searchNat: { ja: '国籍・地域を検索', en: 'Search nationalities' },
  searchStatus: { ja: '在留資格を検索', en: 'Search statuses' },
  searchPlace: { ja: '地域を検索', en: 'Search places' },
  clear: { ja: 'クリア', en: 'Clear' },
  clearAll: { ja: 'すべての条件をクリア', en: 'Clear all filters' },
  selected: { ja: '件選択', en: 'selected' },
  filters: { ja: '条件', en: 'Filters' },
  showResults: { ja: '結果を表示', en: 'Show results' },
  japan: { ja: '全国', en: 'All of Japan' },
  backToJapan: { ja: '全国に戻る', en: 'Back to all of Japan' },
  foreignResidents: { ja: '在留外国人', en: 'foreign residents' },
  matching: { ja: '条件に該当', en: 'matching the filters' },
  ofAll: { ja: '在留外国人全体に占める割合', en: 'of all foreign residents' },
  vsPrev: { ja: '前回比', en: 'vs' },
  topNat: { ja: '国籍・地域', en: 'Nationalities' },
  byStatus: { ja: '在留資格', en: 'Residence status' },
  pyramid: { ja: '年齢・性別', en: 'Age and sex' },
  male: { ja: '男性', en: 'Male' },
  female: { ja: '女性', en: 'Female' },
  other: { ja: 'その他', en: 'Other' },
  showAll: { ja: 'すべて表示', en: 'Show all' },
  showLess: { ja: '上位のみ表示', en: 'Show fewer' },
  trend: { ja: '推移', en: 'Over time' },
  map: { ja: '地図', en: 'Map' },
  table: { ja: '表', en: 'Table' },
  rank: { ja: '順位', en: 'Rank' },
  area: { ja: '地域', en: 'Area' },
  residents: { ja: '人数', en: 'Residents' },
  share: { ja: '構成比', en: 'Share' },
  change: { ja: '増減率', en: 'Change' },
  noData: { ja: 'データなし', en: 'No data' },
  notPublished: { ja: '非公表（秘匿）', en: 'Not published' },
  excluded: { ja: '統計の対象外', en: 'Not covered by the statistics' },
  zero: { ja: '該当者なし', en: 'None' },
  partial: { ja: 'うち条件の一部が非公表', en: 'more with undisclosed attributes' },
  legendNote: { ja: '色の区分は各区分がほぼ同数の地域になるよう設定', en: 'Colour classes hold roughly equal numbers of areas' },
  hiddenNoteMuni: {
    ja: '市区町村データでは、在留外国人が5,000人未満の市町村の年齢・性別、10人以下の市町村の国籍・在留資格が秘匿されています。斜線の地域は条件に該当する人数が公表されていません。',
    en: 'In the municipal data, age and sex are withheld for municipalities with fewer than 5,000 foreign residents, and nationality and status for those with 10 or fewer. Hatched areas have no published figure for the current filters.',
  },
  noAgeSexMuni: {
    ja: 'この時点の市区町村データには年齢・性別がありません（2024年12月以降のみ）。',
    en: 'Municipal data for this period has no age or sex breakdown (available from Dec 2024).',
  },
  otherMuniNote: {
    ja: '在留外国人が10人以下の市町村はこの時点では「その他」として一括計上されており、地図には表示されません。',
    en: 'In this period, municipalities with 10 or fewer foreign residents are pooled as "Other" and are not shown on the map.',
  },
  hamamatsuNote: {
    ja: '浜松市は2024年1月に区を再編したため、2023年12月は市全体で表示しています。',
    en: 'Hamamatsu reorganised its wards in January 2024, so Dec 2023 is shown for the whole city.',
  },
  theme: { ja: 'テーマ', en: 'Theme' },
  themeLight: { ja: 'ライト', en: 'Light' },
  themeDark: { ja: 'ダーク', en: 'Dark' },
  themeSystem: { ja: 'システム', en: 'System' },
  language: { ja: '言語', en: 'Language' },
  loading: { ja: '読み込み中…', en: 'Loading…' },
  loadError: { ja: 'データを読み込めませんでした', en: 'Could not load the data' },
  retry: { ja: '再試行', en: 'Retry' },
  source: { ja: '出典', en: 'Source' },
  sourceText: {
    ja: '出入国在留管理庁「在留外国人統計」（e-Stat 政府統計の総合窓口）。人口：総務省「住民基本台帳に基づく人口、人口動態及び世帯数」。境界データ：国土数値情報（行政区域データ, 2025年）',
    en: 'Immigration Services Agency of Japan, “Statistics on Foreign Residents” (e-Stat). Population: MIC, Basic Resident Register. Boundaries: MLIT National Land Numerical Information (administrative areas, 2025)',
  },
  sourceNote: {
    ja: '在留外国人＝中長期在留者と特別永住者。各時点の末日現在。',
    en: 'Foreign residents = mid- to long-term residents and special permanent residents, as of the end of each period.',
  },
  zoomIn: { ja: '拡大', en: 'Zoom in' },
  zoomOut: { ja: '縮小', en: 'Zoom out' },
  zoomReset: { ja: '全体を表示', en: 'Reset view' },
  select: { ja: 'この地域を選択', en: 'Select this area' },
  close: { ja: '閉じる', en: 'Close' },
  people: { ja: '人', en: '' },
  skip: { ja: 'メインコンテンツへ移動', en: 'Skip to content' },
  mapLabel: { ja: '在留外国人数の地図', en: 'Map of foreign residents' },
  clickToFilter: { ja: 'クリックで絞り込み', en: 'Click to filter' },
  prefOf: { ja: '', en: '' },
} satisfies Record<string, Record<Lang, string>>;

export type Key = keyof typeof strings;

export function t(lang: Lang, key: Key): string {
  return strings[key][lang];
}

export function periodLabel(lang: Lang, p: string, short = false): string {
  const [y, m] = p.split('-').map(Number);
  if (lang === 'ja') return short ? `${y}.${m}` : `${y}年${m}月末`;
  const mon = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en', { month: 'short', timeZone: 'UTC' });
  return short ? `${mon} ’${String(y).slice(2)}` : `${mon} ${y}`;
}

export function detectLang(): Lang {
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'en';
  return nav.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}
