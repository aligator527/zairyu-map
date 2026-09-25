<script lang="ts">
  import { fmtCompact, fmtInt } from '../lib/scale';
  import { periodLabel, t, type Lang } from '../lib/i18n';

  let { series, period, lang, onselect, label }: {
    series: { period: string; value: number | null }[];
    period: string;
    lang: Lang;
    onselect: (p: string) => void;
    label: string;
  } = $props();

  let width = $state(600);
  const height = 150;
  const m = { top: 14, right: 16, bottom: 24, left: 44 };

  const time = (p: string) => { const [y, mo] = p.split('-').map(Number); return y + (mo - 0.5) / 12; };
  const pts = $derived(series.filter((s) => s.value !== null) as { period: string; value: number }[]);
  const x0 = $derived(series.length ? time(series[0].period) : 0);
  const x1 = $derived(series.length ? time(series[series.length - 1].period) : 1);
  const maxV = $derived(Math.max(1, ...pts.map((p) => p.value)));

  function niceMax(v: number) {
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const s of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (s * p >= v) return s * p;
    return 10 * p;
  }
  const yMax = $derived(niceMax(maxV));
  const ticks = $derived([0, yMax / 2, yMax]);

  const sx = (p: string) => m.left + ((time(p) - x0) / Math.max(1e-9, x1 - x0)) * (width - m.left - m.right);
  const sy = (v: number) => m.top + (1 - v / yMax) * (height - m.top - m.bottom);

  const line = $derived(pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.period).toFixed(1)},${sy(p.value).toFixed(1)}`).join(''));
  const area = $derived(pts.length ? `${line}L${sx(pts[pts.length - 1].period)},${sy(0)}L${sx(pts[0].period)},${sy(0)}Z` : '');
  const years = $derived([...new Set(series.map((s) => s.period.slice(0, 4)))]);

  let hoverP = $state<string | null>(null);
  function nearest(clientX: number, el: SVGSVGElement) {
    const r = el.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * width;
    let best = series[0]?.period ?? null, d = Infinity;
    for (const s of series) { const dd = Math.abs(sx(s.period) - px); if (dd < d) { d = dd; best = s.period; } }
    return best;
  }
  function onkeydown(e: KeyboardEvent) {
    const i = series.findIndex((s) => s.period === period);
    let j = i;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') j = Math.max(0, i - 1);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') j = Math.min(series.length - 1, i + 1);
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = series.length - 1;
    else return;
    e.preventDefault();
    if (j !== i) onselect(series[j].period);
  }

  const readout = $derived(series.find((s) => s.period === (hoverP ?? period)));
</script>

<div class="trend" bind:clientWidth={width}>
  <div class="head">
    <p class="eyebrow">{label}</p>
    {#if readout}
      <p class="read tnum" aria-live="polite">
        <span>{periodLabel(lang, readout.period)}</span>
        <strong>{readout.value === null ? '…' : fmtInt(lang, readout.value)}</strong>
      </p>
    {/if}
  </div>
  <svg
    viewBox="0 0 {width} {height}"
    width={width}
    {height}
    role="slider"
    tabindex="0"
    aria-label={t(lang, 'period')}
    aria-valuemin={0}
    aria-valuemax={series.length - 1}
    aria-valuenow={series.findIndex((s) => s.period === period)}
    aria-valuetext={periodLabel(lang, period)}
    onpointermove={(e) => (hoverP = nearest(e.clientX, e.currentTarget))}
    onpointerleave={() => (hoverP = null)}
    onclick={(e) => { const p = nearest(e.clientX, e.currentTarget); if (p) onselect(p); }}
    {onkeydown}
  >
    {#each ticks as tv (tv)}
      <line class="grid" x1={m.left} x2={width - m.right} y1={sy(tv)} y2={sy(tv)} />
      <text class="ytick tnum" x={m.left - 8} y={sy(tv)} dy="0.32em" text-anchor="end">{fmtCompact(lang, tv)}</text>
    {/each}
    {#each years as y (y)}
      {@const px = sx(`${y}-12`)}
      <text class="xtick tnum" x={Math.min(px, width - m.right)} y={height - 6} text-anchor="middle">{y}</text>
    {/each}

    <path class="area" d={area} />
    <path class="line" d={line} />

    {#if hoverP}
      <line class="cross" x1={sx(hoverP)} x2={sx(hoverP)} y1={m.top} y2={height - m.bottom} />
    {/if}

    {#each pts as p (p.period)}
      <circle
        class="dot"
        class:sel={p.period === period}
        cx={sx(p.period)}
        cy={sy(p.value)}
        r={p.period === period ? 5.5 : 3.5}
      />
    {/each}
  </svg>
</div>

<style>
  .trend { width: 100%; }
  .head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  .head .eyebrow { margin: 0; }
  .read { margin: 0; display: flex; gap: 10px; align-items: baseline; font-size: 13px; color: var(--ink-2); }
  .read strong { font-size: 15px; color: var(--ink); font-weight: 600; }
  svg { display: block; overflow: visible; cursor: pointer; margin-top: 6px; touch-action: pan-y; }
  svg:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; border-radius: 6px; }
  .grid { stroke: var(--line); stroke-width: 1; }
  .ytick, .xtick { fill: var(--muted); font-size: 11px; }
  .area { fill: var(--bar); opacity: 0.1; }
  .line { fill: none; stroke: var(--bar); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
  .cross { stroke: var(--ink-2); stroke-width: 1; }
  .dot { fill: var(--bar); stroke: var(--surface); stroke-width: 2; transition: r 0.15s; }
  .dot.sel { fill: var(--accent); }
</style>
