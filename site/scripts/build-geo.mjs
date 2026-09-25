// Builds public/geo/japan.topo.json from the MLIT 国土数値情報 N03 administrative boundaries.
//
//   node scripts/build-geo.mjs [path/to/N03-YYYYMMDD.shp]
//
// Output: one TopoJSON with two layers sharing arcs
//   muni  – municipalities / designated-city wards, id = 5-digit 全国地方公共団体コード
//   pref  – prefectures dissolved from muni, id = 2-digit code
// Coordinates are already projected (Lambert conformal conic) and laid out:
// Okinawa and the Ogasawara islands are moved into insets, so the browser only
// needs an identity projection.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, process.argv[2] ?? '../data/geo/N03-20250101.shp');
const tmp = resolve(root, '../data/geo/tmp');
const out = resolve(root, 'public/geo/japan.topo.json');
mkdirSync(tmp, { recursive: true });
mkdirSync(dirname(out), { recursive: true });

const mapshaper = (args) =>
  execFileSync(resolve(root, 'node_modules/.bin/mapshaper-xl'), args, { stdio: 'inherit' });

const PROJ = '+proj=lcc +lat_1=33 +lat_2=41 +lat_0=37 +lon_0=136.5 +ellps=GRS80 +units=m';
const OGASAWARA = '13421';

// 1) dissolve polygons to one feature per municipality code, simplify, project.
mapshaper([
  '-i', src, 'encoding=utf8',
  '-rename-fields', 'pref_name=N03_001,city_name=N03_004,ward_name=N03_005,code=N03_007',
  '-dissolve', 'code', 'copy-fields=pref_name,city_name,ward_name',
  // remote reefs of Ogasawara village (Okinotorishima, Minamitorishima) would blow up the inset
  '-filter-islands', 'min-area=1.2km2', 'remove-empty',
  '-simplify', 'dp', 'interval=180', 'keep-shapes',
  '-proj', PROJ,
  '-each', `pref=code.slice(0,2)`,
  '-o', `${tmp}/muni.json`, 'format=geojson', 'force',
]);

// 2) layout: move Okinawa + Ogasawara into insets (planar shift in metres).
const gj = JSON.parse(readFileSync(`${tmp}/muni.json`, 'utf8'));
const shift = (geom, dx, dy) => {
  const f = (c) => (typeof c[0] === 'number' ? [c[0] + dx, c[1] + dy] : c.map(f));
  geom.coordinates = f(geom.coordinates);
};
const bbox = (feats) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const walk = (c) => {
    if (typeof c[0] === 'number') {
      x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]);
      y0 = Math.min(y0, c[1]); y1 = Math.max(y1, c[1]);
    } else c.forEach(walk);
  };
  feats.forEach((f) => walk(f.geometry.coordinates));
  return { x0, y0, x1, y1 };
};
const isOkinawa = (f) => f.properties.pref === '47';
const isOgasawara = (f) => f.properties.code === OGASAWARA;

// Ogasawara village also owns Okinotorishima (~700 km west) and Minamitorishima
// (~1,200 km east); keep only the Bonin / Volcano island chain around Chichijima.
for (const f of gj.features.filter(isOgasawara)) {
  const g = f.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const cx = (poly) => poly[0].reduce((s, c) => s + c[0], 0) / poly[0].length;
  const xs = polys.map(cx).sort((a, b) => a - b);
  const mid = xs[Math.floor(xs.length / 2)];
  const kept = polys.filter((p) => Math.abs(cx(p) - mid) < 60_000);
  // Only the inhabited Bonin group (Chichijima / Hahajima); the Volcano Islands
  // further south have no civilian residents and would stretch the inset.
  const cy = (poly) => poly[0].reduce((s, c) => s + c[1], 0) / poly[0].length;
  const top = Math.max(...kept.map(cy));
  f.geometry = { type: 'MultiPolygon', coordinates: kept.filter((p) => top - cy(p) < 160_000) };
}
// Insets are drawn larger than the mainland so the small islands stay readable
// (the frame makes the change of scale explicit). The Daito islands are pulled
// ~250 km west so the Okinawa frame doesn't span mostly open ocean.
const DAITO = new Set(['47357', '47358']);
const SAKISHIMA = new Set(['47207', '47214', '47375', '47381', '47382']);
const scaleAbout = (feats, k) => {
  const b = bbox(feats), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const f = (c) => (typeof c[0] === 'number' ? [cx + (c[0] - cx) * k, cy + (c[1] - cy) * k] : c.map(f));
  for (const ft of feats) ft.geometry.coordinates = f(ft.geometry.coordinates);
};
for (const f of gj.features) {
  if (DAITO.has(f.properties.code)) shift(f.geometry, -250_000, 0);
  if (SAKISHIMA.has(f.properties.code)) shift(f.geometry, 170_000, 60_000);
}
scaleAbout(gj.features.filter(isOkinawa), 1.7);
scaleAbout(gj.features.filter(isOgasawara), 3);

const main = gj.features.filter((f) => !isOkinawa(f) && !isOgasawara(f));
const m = bbox(main);
const oki = bbox(gj.features.filter(isOkinawa));
const oga = bbox(gj.features.filter(isOgasawara));
const pad = 40_000;

// Okinawa: top-left corner of the frame (the Sea of Japan / Korea strait area is empty).
const okiDx = m.x0 + pad - oki.x0;
const okiDy = m.y1 - pad - oki.y1;
// Ogasawara: bottom-right corner, below Kanto in the Pacific.
const ogaDx = m.x1 - pad - oga.x1 - 120_000;
const ogaDy = m.y0 + pad - oga.y0 + 60_000;
for (const f of gj.features) {
  if (isOkinawa(f)) shift(f.geometry, okiDx, okiDy);
  if (isOgasawara(f)) shift(f.geometry, ogaDx, ogaDy);
}
const insets = {
  okinawa: bbox(gj.features.filter(isOkinawa)),
  ogasawara: bbox(gj.features.filter(isOgasawara)),
};
writeFileSync(`${tmp}/muni-laid.json`, JSON.stringify(gj));

// 3) topology with both layers sharing arcs.
mapshaper([
  '-i', `${tmp}/muni-laid.json`, 'name=muni',
  '-proj', 'init=' + PROJ, // re-declare CRS (coordinates are already projected)
  '-dissolve', 'pref', 'copy-fields=pref_name', '+', 'name=pref',
  '-o', `${tmp}/japan.topo.json`, 'format=topojson', 'target=muni,pref', 'quantization=40000', 'force',
]);

// 4) slim the properties, flip y (SVG grows downward) via a transform on the client,
//    and add the inset frames + bbox as metadata.
const topo = JSON.parse(readFileSync(`${tmp}/japan.topo.json`, 'utf8'));
// 所属未定地 (xx000, unassigned land such as lakes) stays in the prefecture outline only.
topo.objects.muni.geometries = topo.objects.muni.geometries.filter((g) => !g.properties.code.endsWith('000'));
for (const g of topo.objects.muni.geometries) {
  const p = g.properties;
  g.id = p.code;
  g.properties = { n: p.ward_name ? `${p.city_name}${p.ward_name}` : p.city_name };
}
for (const g of topo.objects.pref.geometries) {
  g.id = g.properties.pref;
  g.properties = { n: g.properties.pref_name };
}
topo.meta = { proj: PROJ, bounds: bbox(gj.features), insets, source: 'MLIT 国土数値情報 N03 (2025-01-01)' };
delete topo.crs;
writeFileSync(out, JSON.stringify(topo));
console.log(`wrote ${out}: ${(statSync(out).size / 1024).toFixed(0)} KB,`,
  topo.objects.muni.geometries.length, 'municipalities,', topo.objects.pref.geometries.length, 'prefectures');
