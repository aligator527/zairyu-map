// Loads the pre-projected TopoJSON (scripts/build-geo.mjs) and turns it into SVG
// path strings once. Coordinates are already in a Lambert projection with the
// Okinawa/Ogasawara insets laid out, so only a flip + scale is applied here.

import { geoIdentity, geoPath } from 'd3-geo';
import { feature, merge, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import { BUREAUS, bureauCode, bureauOfPref } from './bureaus';

export const WIDTH = 1000;

export interface Shape {
  code: string;
  name: string;
  d: string;
  bbox: [[number, number], [number, number]];
  centroid: [number, number];
}

export interface GeoData {
  width: number;
  height: number;
  prefs: Shape[];
  munis: Shape[];
  prefBorders: string;   // prefecture boundaries (for the municipal view)
  insets: { x: number; y: number; w: number; h: number; key: string }[];
  merged: Map<string, Shape & { parts: string[] }>;
  /** bbox to frame when zooming to a prefecture (outlying islands left out) */
  prefFrame: Map<string, Shape['bbox']>;
  /** immigration bureau jurisdictions (merged prefectures), code "B1".."B8" */
  bureaus: Shape[];
  bureauBorders: string;   // between bureaus
  branchBorders: string;   // around the prefectures of 支局 (Kanagawa, Hyogo, Okinawa)
  /** outline of a set of prefectures + municipalities (an office's service area) */
  areaPath: (prefs: number[], munis: string[]) => string;
}

type Meta = {
  bounds: { x0: number; y0: number; x1: number; y1: number };
  insets: Record<string, { x0: number; y0: number; x1: number; y1: number }>;
};

export async function loadGeo(mergeSpec: Record<string, string[]>): Promise<GeoData> {
  const r = await fetch(`${import.meta.env.BASE_URL}geo/japan.topo.json`);
  if (!r.ok) throw new Error(`geo: ${r.status}`);
  const topo = (await r.json()) as Topology & { meta: Meta };
  const { bounds, insets } = topo.meta;
  const pad = 8;
  const k = (WIDTH - 2 * pad) / (bounds.x1 - bounds.x0);
  const height = Math.ceil((bounds.y1 - bounds.y0) * k + 2 * pad);
  const proj = geoIdentity().reflectY(true).scale(k).translate([pad - bounds.x0 * k, pad + bounds.y1 * k]);
  const path = geoPath(proj);
  const P = (x: number, y: number) => proj([x, y]) as [number, number];

  const shapes = (obj: GeometryCollection): Shape[] =>
    (feature(topo, obj) as unknown as GeoJSON.FeatureCollection).features.map((f) => ({
      code: String(f.id),
      name: (f.properties as { n: string }).n,
      d: path(f) ?? '',
      bbox: path.bounds(f) as Shape['bbox'],
      centroid: path.centroid(f) as [number, number],
    }));

  const prefObj = topo.objects.pref as GeometryCollection;
  const muniObj = topo.objects.muni as GeometryCollection;
  const merged = new Map<string, Shape & { parts: string[] }>();
  for (const [code, parts] of Object.entries(mergeSpec)) {
    const geoms = muniObj.geometries.filter((g) => parts.includes(String(g.id)));
    const m = merge(topo, geoms as never);
    merged.set(code, { code, name: '', parts, d: path(m) ?? '', bbox: path.bounds(m) as Shape['bbox'],
                       centroid: path.centroid(m) as [number, number] });
  }

  const frame = (key: string) => {
    const b = insets[key];
    const m = 12_000;
    const [x0, y0] = P(b.x0 - m, b.y1 + m);
    const [x1, y1] = P(b.x1 + m, b.y0 - m);
    return { key, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };

  // Tokyo's Izu and Ogasawara islands lie hundreds of km south of the city (and
  // Ogasawara sits in an inset), so framing all of Tokyo would make the wards tiny.
  const outlying = (code: string) => code.startsWith('13') && Number(code) >= 13360;
  const munis = shapes(muniObj);
  const prefFrame = new Map<string, Shape['bbox']>();
  for (const s of munis) {
    if (outlying(s.code)) continue;
    const pc = s.code.slice(0, 2);
    const b = prefFrame.get(pc);
    prefFrame.set(pc, b ? [[Math.min(b[0][0], s.bbox[0][0]), Math.min(b[0][1], s.bbox[0][1])],
                           [Math.max(b[1][0], s.bbox[1][0]), Math.max(b[1][1], s.bbox[1][1])]] : s.bbox);
  }

  // ---- immigration bureaus
  const prefBureau = (g: { id?: string | number }) => bureauOfPref[Number(g.id)];
  const bureaus: Shape[] = BUREAUS.map((b) => {
    const geoms = prefObj.geometries.filter((g) => prefBureau(g) === b.id);
    const m = merge(topo, geoms as never);
    return { code: bureauCode(b.id), name: b.ja, d: path(m) ?? '', bbox: path.bounds(m) as Shape['bbox'],
             centroid: path.centroid(m) as [number, number] };
  });
  const branchPrefs = new Set(BUREAUS.flatMap((b) => b.branches.map((br) => br.pref)));
  const bureauBorders = path(mesh(topo, prefObj as never, (a, b) => prefBureau(a) !== prefBureau(b))) ?? '';
  const branchBorders = path(mesh(topo, prefObj as never, (a, b) =>
    a !== b && prefBureau(a) === prefBureau(b) &&
    (branchPrefs.has(Number(a.id)) || branchPrefs.has(Number(b.id))))) ?? '';
  // Prefecture and municipality layers share arcs, so they can be merged together.
  const areaPath = (prefs: number[], codes: string[]) => {
    const set = new Set(codes);
    const geoms = [
      ...prefObj.geometries.filter((g) => prefs.includes(Number(g.id))),
      ...muniObj.geometries.filter((g) => set.has(String(g.id))),
    ];
    return geoms.length ? path(merge(topo, geoms as never)) ?? '' : '';
  };

  return {
    width: WIDTH,
    height,
    prefs: shapes(prefObj),
    munis,
    prefBorders: path(mesh(topo, prefObj as never, (a, b) => a !== b)) ?? '',
    insets: Object.keys(insets).map(frame),
    merged,
    prefFrame,
    bureaus,
    bureauBorders,
    branchBorders,
    areaPath,
  };
}
