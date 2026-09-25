<script lang="ts">
  import { fmtBreak, type Classes, type Metric } from '../lib/scale';
  import { t, type Lang } from '../lib/i18n';

  let { classes, metric, lang, level, showHidden, highlight = $bindable(null) }: {
    classes: Classes;
    metric: Metric;
    lang: Lang;
    level: 'pref' | 'muni' | 'bureau';
    showHidden: boolean;
    highlight?: number | null;
  } = $props();

  const title = $derived(
    metric === 'count' ? t(lang, 'metricCount') : metric === 'share' ? t(lang, 'metricShare')
      : metric === 'per1000' ? `${t(lang, 'metricPer1000')}${lang === 'ja' ? '（人）' : ' inhabitants'}` : t(lang, 'metricChange'),
  );

  function range(i: number): string {
    const b = classes.breaks;
    const f = (v: number) => fmtBreak(lang, metric, v);
    if (i === 0) return `< ${f(b[0])}`;
    if (i === b.length) return `≥ ${f(b[b.length - 1])}`;
    return `${f(b[i - 1])} – ${f(b[i])}`;
  }
</script>

<div class="legend">
  <p class="title">{title}</p>
  {#if classes.breaks.length}
    <ol class="steps" aria-label={title} onpointerleave={() => (highlight = null)}>
      {#each classes.colors as c, i (i)}
        <li>
          <button
            type="button"
            class="sw"
            style:background={c}
            aria-label={range(i)}
            title={range(i)}
            aria-pressed={highlight === i}
            onpointerenter={() => (highlight = i)}
            onfocus={() => (highlight = i)}
            onblur={() => (highlight = null)}
            onclick={() => (highlight = highlight === i ? null : i)}
          ></button>
          {#if i < classes.breaks.length}
            <span class="tick tnum">{fmtBreak(lang, metric, classes.breaks[i])}</span>
          {/if}
        </li>
      {/each}
    </ol>
  {/if}
  <ul class="keys">
    {#if metric !== 'change'}
      <li><span class="key land"></span>{t(lang, 'zero')}</li>
    {/if}
    {#if showHidden}
      <li><span class="key hatch"></span>{t(lang, 'notPublished')}</li>
    {/if}
    {#if level === 'muni'}
      <li><span class="key dots"></span>{t(lang, 'excluded')}</li>
    {/if}
  </ul>
</div>

<style>
  .legend { display: grid; gap: 6px; font-size: 12px; color: var(--ink-2); }
  .title { margin: 0; font-weight: 600; color: var(--ink); font-size: 12.5px; }
  .steps {
    list-style: none; margin: 0; padding: 0 0 16px;
    display: grid; grid-auto-flow: column; grid-auto-columns: minmax(28px, 44px); gap: 2px;
  }
  li { position: relative; }
  .sw {
    display: block; width: 100%; height: 12px; border: 0; padding: 0; border-radius: 0;
  }
  li:first-child .sw { border-radius: 3px 0 0 3px; }
  li:last-child .sw { border-radius: 0 3px 3px 0; }
  .sw[aria-pressed='true'] { outline: 2px solid var(--ink); outline-offset: 1px; }
  .tick {
    position: absolute; top: 15px; right: 0; transform: translateX(50%);
    font-size: 11px; color: var(--muted); white-space: nowrap;
  }
  .keys { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 14px; }
  .keys li { display: inline-flex; align-items: center; gap: 6px; }
  .key { width: 14px; height: 10px; border-radius: 2px; display: inline-block; border: 1px solid var(--line-strong); }
  .land { background: var(--land); }
  .hatch { background: repeating-linear-gradient(45deg, var(--land) 0 2px, var(--hatch) 2px 3.5px); }
  .dots { background: radial-gradient(circle, var(--hatch) 0.8px, var(--bg) 1px) 0 0 / 4px 4px; }
</style>
