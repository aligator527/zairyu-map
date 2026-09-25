<script lang="ts">
  import type { Area } from '../lib/types';
  import { fmtInt, fmtPct, fmtRate, fmtSignedPct, type Metric } from '../lib/scale';
  import { t, type Lang } from '../lib/i18n';

  let { area, metric, lang, level, x = 0, y = 0, bounds = null, pinned = false }: {
    area: Area;
    metric: Metric;
    lang: Lang;
    level: 'pref' | 'muni';
    x?: number;
    y?: number;
    bounds?: HTMLElement | null;
    pinned?: boolean;
  } = $props();

  let el: HTMLDivElement | undefined = $state();
  let w = $state(220), h = $state(120);

  // Flip to the other side of the pointer near the right/bottom edge.
  const pos = $derived.by(() => {
    const bw = bounds?.clientWidth ?? 1000, bh = bounds?.clientHeight ?? 800;
    const gap = 14;
    const left = x + gap + w > bw ? x - gap - w : x + gap;
    const top = y + gap + h > bh ? Math.max(0, y - gap - h) : y + gap;
    return { left: Math.max(0, left), top };
  });

  const people = (v: number) => (lang === 'ja' ? `${fmtInt(lang, v)}人` : fmtInt(lang, v));
</script>

<div
  class="tip"
  class:pinned
  bind:this={el}
  bind:clientWidth={w}
  bind:clientHeight={h}
  style:left={pinned ? null : pos.left + 'px'}
  style:top={pinned ? null : pos.top + 'px'}
  role={pinned ? 'status' : 'tooltip'}
>
  <p class="name">{area.name}</p>
  <p class="sub">{level === 'muni' && area.parent ? `${area.parent} · ` : ''}{area.alt}</p>

  {#if area.state === 'excluded'}
    <p class="note">{t(lang, 'excluded')}</p>
  {:else if area.state === 'hidden'}
    <p class="big">{t(lang, 'notPublished')}</p>
    <p class="note">{people(area.hidden)} — {t(lang, 'partial')}</p>
  {:else}
    <p class="big tnum">
      {#if metric === 'share'}{isFinite(area.share) ? fmtPct(lang, area.share) : '–'}
      {:else if metric === 'change'}{isFinite(area.change) ? fmtSignedPct(lang, area.change) : '–'}
      {:else if metric === 'per1000'}{isFinite(area.per1000) ? fmtRate(lang, area.per1000) : '–'}<small class="u">{t(lang, 'per1000Long')}</small>
      {:else}{people(area.count)}{/if}
    </p>
    <dl>
      {#if metric !== 'count'}
        <dt>{t(lang, 'residents')}</dt><dd class="tnum">{people(area.count)}</dd>
      {/if}
      {#if metric !== 'per1000' && isFinite(area.per1000)}
        <dt>{t(lang, 'per1000')}</dt><dd class="tnum">{fmtRate(lang, area.per1000)}</dd>
      {/if}
      {#if metric !== 'share' && area.all > 0 && area.count !== area.all}
        <dt>{t(lang, 'share')}</dt><dd class="tnum">{fmtPct(lang, area.share)}</dd>
      {/if}
      {#if metric !== 'change' && isFinite(area.change)}
        <dt>{t(lang, 'change')}</dt><dd class="tnum">{fmtSignedPct(lang, area.change)}</dd>
      {/if}
    </dl>
    {#if area.hidden > 0}
      <p class="note">+{people(area.hidden)} {t(lang, 'partial')}</p>
    {/if}
  {/if}
</div>

<style>
  .tip {
    position: absolute;
    z-index: 30;
    pointer-events: none;
    min-width: 180px;
    max-width: 280px;
    padding: 10px 12px;
    background: var(--surface);
    border: 1px solid var(--line-strong);
    border-radius: 10px;
    box-shadow: var(--shadow);
    font-size: 13px;
    line-height: 1.4;
  }
  .tip.pinned {
    position: static; box-shadow: none; border: 0; padding: 0; max-width: none; pointer-events: auto;
  }
  p { margin: 0; }
  .name { font-weight: 600; font-size: 14.5px; }
  .sub { color: var(--muted); font-size: 12px; margin-bottom: 6px; }
  .big { font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }
  dl { display: grid; grid-template-columns: auto auto; gap: 2px 14px; margin: 6px 0 0; justify-content: start; }
  dt { color: var(--muted); }
  dd { margin: 0; text-align: right; }
  .note { color: var(--muted); font-size: 12px; margin-top: 6px; }
  .u { font-size: 11.5px; font-weight: 400; color: var(--muted); margin-left: 6px; letter-spacing: 0; }
</style>
