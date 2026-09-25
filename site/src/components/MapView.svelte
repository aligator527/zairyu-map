<script lang="ts">
  import { onMount } from 'svelte';
  import { select } from 'd3-selection';
  import 'd3-transition';
  import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
  import type { GeoData, Shape } from '../lib/geo';
  import type { Area } from '../lib/types';
  import { classOf, type Classes, type Metric } from '../lib/scale';
  import { t, type Lang } from '../lib/i18n';
  import Tooltip from './Tooltip.svelte';

  let { geo, level, areas, classes, metric, lang, focusCode, zoomTo, highlight, onselect, showBureaus = false }: {
    geo: GeoData;
    level: 'pref' | 'muni' | 'bureau';
    showBureaus?: boolean;       // jurisdiction borders + office markers
    areas: Map<string, Area>;
    classes: Classes;
    metric: Metric;
    lang: Lang;
    focusCode: string | null;
    zoomTo: string | null;      // prefecture code to frame in the municipal view
    highlight: number | null;   // legend class under the pointer
    onselect: (code: string | null) => void;
  } = $props();

  let svg: SVGSVGElement;
  let wrap: HTMLDivElement | undefined = $state();
  let transform = $state<ZoomTransform>(zoomIdentity);
  // Rendered size of the map, to keep office labels at a constant screen size.
  let boxW = $state(1000), boxH = $state(800);
  const px = $derived(1 / Math.max(1e-6, Math.min(boxW / geo.width, boxH / geo.height)));
  let hover = $state<{ area: Area; x: number; y: number } | null>(null);
  let pinned = $state<Area | null>(null); // touch: tapped area shown as a card
  let zb: ZoomBehavior<SVGSVGElement, unknown>;

  const shapes = $derived.by((): Shape[] => {
    if (level === 'pref') return geo.prefs;
    if (level === 'bureau') return geo.bureaus;
    const list = geo.munis.slice();
    for (const [code, s] of geo.merged) {
      if (areas.has(code)) list.push(s);
    }
    return list;
  });
  // Municipal parts that are drawn merged in this period (e.g. Hamamatsu 2023-12).
  const covered = $derived.by(() => {
    const out = new Set<string>();
    if (level !== 'muni') return out;
    for (const [code, m] of geo.merged) if (areas.has(code)) m.parts.forEach((p) => out.add(p));
    return out;
  });
  const shapeByCode = $derived(new Map(shapes.map((s) => [s.code, s])));
  // In the municipal view a selected prefecture is outlined with its own border.
  const focusShape = $derived(
    focusCode ? (shapeByCode.get(focusCode) ?? geo.prefs.find((p) => p.code === focusCode) ?? null) : null,
  );

  function fill(a: Area | undefined): string {
    if (!a || a.state === 'excluded') return 'url(#pat-excluded)';
    if (a.state === 'hidden') return 'url(#pat-hidden)';
    if (!isFinite(a.value)) return 'url(#pat-hidden)';
    if (a.state === 'zero' && metric !== 'change') return 'var(--land)';
    return classes.colors[classOf(classes, a.value)];
  }
  function dimmed(a: Area | undefined): boolean {
    if (highlight === null) return false;
    if (!a || a.state !== 'ok' || !isFinite(a.value)) return true;
    return classOf(classes, a.value) !== highlight;
  }

  // ------------------------------------------------------------ zoom
  onMount(() => {
    zb = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, level === 'muni' ? 60 : 12])
      .translateExtent([[-geo.width * 0.1, -geo.height * 0.1], [geo.width * 1.1, geo.height * 1.1]])
      // Keep the page scrollable: wheel zooms only with Ctrl/⌘ (trackpad pinch sends ctrlKey),
      // and one finger pans only once the map is zoomed in.
      .filter((e: Event) => {
        if (e.type === 'wheel') return (e as WheelEvent).ctrlKey || (e as WheelEvent).metaKey;
        if (e.type === 'touchstart') return (e as TouchEvent).touches.length > 1 || transform.k > 1.01;
        if (e.type === 'dblclick') return false;
        return !(e as MouseEvent).button;
      })
      .on('zoom', (e) => { transform = e.transform; hover = null; });
    select(svg).call(zb).on('dblclick.zoom', null);
    return () => { select(svg).on('.zoom', null); };
  });

  $effect(() => {
    // Adjust the zoom range when switching level.
    zb?.scaleExtent([1, level === 'muni' ? 60 : 12]);
  });

  function frame(bbox: Shape['bbox'], maxK = 40) {
    const [[x0, y0], [x1, y1]] = bbox;
    const k = Math.min(maxK, 0.85 / Math.max((x1 - x0) / geo.width, (y1 - y0) / geo.height));
    const tx = geo.width / 2 - k * (x0 + x1) / 2;
    const ty = geo.height / 2 - k * (y0 + y1) / 2;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sel = select(svg);
    const target = zoomIdentity.translate(tx, ty).scale(Math.max(1, k));
    if (reduce) sel.call(zb.transform, target);
    else sel.transition().duration(550).call(zb.transform as never, target);
  }

  $effect(() => {
    if (!zb) return;
    if (zoomTo) {
      const b = geo.prefFrame.get(zoomTo);
      if (b) frame(b);
    } else if (level !== 'muni') {
      select(svg).call(zb.transform, zoomIdentity);
    }
  });

  export function zoomBy(f: number) { select(svg).transition().duration(250).call(zb.scaleBy as never, f); }
  export function reset() { select(svg).transition().duration(350).call(zb.transform as never, zoomIdentity); }

  // ------------------------------------------------------------ pointer
  function codeFrom(e: Event): string | null {
    const el = (e.target as Element).closest?.('[data-code]');
    return el ? el.getAttribute('data-code') : null;
  }
  function onpointermove(e: PointerEvent) {
    if (e.pointerType === 'touch') return;
    const code = codeFrom(e);
    const a = code ? areas.get(code) : undefined;
    if (!a) { hover = null; return; }
    if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    hover = { area: a, x: e.clientX - r.left, y: e.clientY - r.top };
  }
  let down: { x: number; y: number } | null = null;
  function onpointerdown(e: PointerEvent) { down = { x: e.clientX, y: e.clientY }; }
  function onclick(e: MouseEvent) {
    // Ignore clicks that ended a drag.
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
    const code = codeFrom(e);
    const touch = (e as PointerEvent).pointerType === 'touch';
    if (!code) { pinned = null; onselect(null); return; }
    const a = areas.get(code);
    if (touch) pinned = a ?? null;
    onselect(code === focusCode && !touch ? null : code);
  }

  // Roving focus over prefectures / bureaus (arrow keys), Enter selects.
  let kbd = $state<string | null>(null);
  function onkeydown(e: KeyboardEvent) {
    if (level === 'muni') return;
    const list = level === 'bureau' ? geo.bureaus : geo.prefs;
    const codes = list.map((s) => s.code);
    const cur = kbd ?? focusCode ?? codes[0];
    let i = codes.indexOf(cur);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') i = Math.min(codes.length - 1, i + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') i = Math.max(0, i - 1);
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = codes.length - 1;
    else if (e.key === 'Enter' || e.key === ' ') { onselect(cur); e.preventDefault(); return; }
    else if (e.key === 'Escape') { onselect(null); kbd = null; return; }
    else return;
    e.preventDefault();
    kbd = codes[i];
    const s = list[i];
    const a = areas.get(s.code);
    if (a) {
      const [cx, cy] = transform.apply(s.centroid);
      const r = svg.getBoundingClientRect(), sc = r.width / geo.width;
      hover = { area: a, x: cx * sc, y: cy * sc };
    }
  }

  const kbdLabel = $derived.by(() => {
    const a = kbd ? areas.get(kbd) : null;
    return a ? a.name : '';
  });
</script>

<div class="map" bind:this={wrap}>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <svg
    bind:this={svg}
    viewBox="0 0 {geo.width} {geo.height}"
    role="application"
    aria-roledescription="map"
    aria-label={t(lang, 'mapLabel')}
    tabindex="0"
    style:touch-action={transform.k > 1.01 ? 'none' : 'pan-y'}
    {onpointermove}
    onpointerleave={() => (hover = null)}
    {onpointerdown}
    {onclick}
    {onkeydown}
    onblur={() => { kbd = null; hover = null; }}
  >
    <defs>
      <pattern id="pat-hidden" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill="var(--land)" />
        <line x1="0" y1="0" x2="0" y2="6" stroke="var(--hatch)" stroke-width="1.6" />
      </pattern>
      <pattern id="pat-excluded" width="5" height="5" patternUnits="userSpaceOnUse">
        <rect width="5" height="5" fill="var(--bg)" />
        <circle cx="2.5" cy="2.5" r="0.8" fill="var(--hatch)" />
      </pattern>
    </defs>

    <g transform={transform.toString()}>
      {#each geo.insets as f (f.key)}
        <rect class="inset" x={f.x} y={f.y} width={f.w} height={f.h} rx="4" />
      {/each}

      <g class="areas" class:muni={level === 'muni'}>
        {#each shapes as s (s.code)}
          {#if !covered.has(s.code)}
            {@const a = areas.get(s.code)}
            <path
              d={s.d}
              data-code={s.code}
              fill={fill(a)}
              class:dim={dimmed(a)}
            />
          {/if}
        {/each}
      </g>

      {#if level === 'muni'}
        <path class="pref-borders" d={geo.prefBorders} />
      {/if}
      {#if showBureaus || level === 'bureau'}
        <path class="branch-borders" d={geo.branchBorders} />
        {#if level !== 'bureau'}<path class="bureau-borders" d={geo.bureauBorders} />{/if}
      {/if}

      {#if hover && shapeByCode.get(hover.area.code)}
        <path class="hover" d={shapeByCode.get(hover.area.code)!.d} />
      {/if}
      {#if focusShape}
        <path class="focus" d={focusShape.d} />
      {/if}
      {#if kbd && shapeByCode.get(kbd)}
        <path class="kbd" d={shapeByCode.get(kbd)!.d} />
      {/if}
    </g>
  </svg>

  {#if showBureaus || level === 'bureau'}
    <!-- Office markers live outside the zoom group so they keep their size. -->
    <svg class="offices" viewBox="0 0 {geo.width} {geo.height}" aria-hidden="true"
      bind:clientWidth={boxW} bind:clientHeight={boxH}>
      {#each geo.offices as o (o.ja)}
        {@const [x, y] = transform.apply([o.x, o.y])}
        <g transform="translate({x},{y}) scale({px})" class:branch={o.branch}>
          <circle r={o.branch ? 3 : 4.5} />
          <!-- District offices sit next to their bureau (Kobe–Osaka, Yokohama–Tokyo): label them on the left. -->
          <text x={o.branch ? -7 : 8} dy="0.35em" text-anchor={o.branch ? 'end' : 'start'}>{lang === 'ja' ? o.ja : o.en}</text>
        </g>
      {/each}
    </svg>
  {/if}

  <div class="sr-only" aria-live="polite">{kbdLabel}</div>

  {#if hover && !pinned}
    <Tooltip area={hover.area} {metric} {lang} {level} x={hover.x} y={hover.y} bounds={wrap} />
  {/if}

  {#if pinned}
    <div class="card">
      <Tooltip area={pinned} {metric} {lang} {level} pinned />
      <button type="button" class="close" aria-label={t(lang, 'close')} onclick={() => (pinned = null)}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.6" /></svg>
      </button>
    </div>
  {/if}

  <div class="zoom" role="group" aria-label="Zoom">
    <button type="button" class="zbtn" aria-label={t(lang, 'zoomIn')} title={t(lang, 'zoomIn')} onclick={() => zoomBy(1.8)}>
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 2v10M2 7h10" stroke="currentColor" stroke-width="1.6" /></svg>
    </button>
    <button type="button" class="zbtn" aria-label={t(lang, 'zoomOut')} title={t(lang, 'zoomOut')} onclick={() => zoomBy(1 / 1.8)}>
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 7h10" stroke="currentColor" stroke-width="1.6" /></svg>
    </button>
    <button type="button" class="zbtn" aria-label={t(lang, 'zoomReset')} title={t(lang, 'zoomReset')} onclick={reset} disabled={transform.k === 1 && transform.x === 0}>
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 5V2h3M12 5V2H9M2 9v3h3M12 9v3H9" fill="none" stroke="currentColor" stroke-width="1.5" /></svg>
    </button>
  </div>
</div>

<style>
  .map { position: relative; }
  svg {
    display: block;
    width: 100%;
    height: auto;
    max-height: max(440px, calc(100dvh - 290px));
    cursor: default;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }
  svg:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; border-radius: 8px; }
  .inset { fill: none; stroke: var(--line-strong); stroke-width: 1; vector-effect: non-scaling-stroke; }
  .areas path {
    stroke: var(--bg);
    stroke-width: 0.9;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
    transition: fill 0.25s ease, opacity 0.2s ease;
    cursor: pointer;
  }
  .areas.muni path { stroke-width: 0.35; }
  .areas path.dim { opacity: 0.18; }
  .hover {
    fill: none; stroke: var(--ink); stroke-width: 1.5; stroke-linejoin: round;
    vector-effect: non-scaling-stroke; pointer-events: none;
  }
  .pref-borders {
    fill: none; stroke: var(--ink-2); stroke-opacity: 0.55; stroke-width: 0.8;
    vector-effect: non-scaling-stroke; pointer-events: none;
  }
  .bureau-borders {
    fill: none; stroke: var(--ink); stroke-width: 2; stroke-linejoin: round;
    vector-effect: non-scaling-stroke; pointer-events: none;
  }
  .branch-borders {
    fill: none; stroke: var(--ink); stroke-opacity: 0.7; stroke-width: 1;
    vector-effect: non-scaling-stroke; pointer-events: none;
  }
  .offices {
    position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;
    max-height: max(440px, calc(100dvh - 290px));
  }
  .offices circle { fill: var(--ink); stroke: var(--surface); stroke-width: 2; }
  .offices .branch circle { fill: var(--surface); stroke: var(--ink); stroke-width: 1.5; }
  .offices text {
    font-size: 12px; font-weight: 600; fill: var(--ink);
    paint-order: stroke; stroke: var(--surface); stroke-width: 3px; stroke-linejoin: round;
  }
  .offices .branch text { font-weight: 500; font-size: 11px; fill: var(--ink-2); }
  .focus, .kbd {
    fill: none; stroke: var(--accent); stroke-width: 2.5; stroke-linejoin: round;
    vector-effect: non-scaling-stroke; pointer-events: none;
  }
  .kbd { stroke: var(--ink); stroke-dasharray: none; stroke-width: 2; }
  .zoom {
    position: absolute; right: 8px; bottom: 8px;
    display: flex; flex-direction: column; gap: 4px;
  }
  .zbtn {
    width: 36px; height: 36px; display: grid; place-items: center;
    border: 1px solid var(--line-strong); border-radius: 8px;
    background: color-mix(in oklab, var(--surface) 92%, transparent);
    backdrop-filter: blur(6px);
  }
  .zbtn:hover:not(:disabled) { border-color: var(--ink-2); }
  .zbtn:disabled { opacity: 0.4; cursor: default; }
  .card {
    position: absolute; left: 8px; right: 56px; bottom: 8px;
    background: var(--surface); border: 1px solid var(--line-strong);
    border-radius: var(--radius); box-shadow: var(--shadow);
    padding: 12px 40px 12px 14px;
  }
  .close {
    position: absolute; top: 6px; right: 6px; width: 36px; height: 36px;
    border: 0; background: none; border-radius: 8px; display: grid; place-items: center; color: var(--ink-2);
  }
  @media (forced-colors: active) {
    .areas path { stroke: CanvasText; }
    .focus { stroke: Highlight; }
  }
</style>
