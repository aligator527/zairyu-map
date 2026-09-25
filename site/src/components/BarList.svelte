<script lang="ts">
  import { fmtInt, fmtPct } from '../lib/scale';
  import { t, type Lang } from '../lib/i18n';
  import type { Item } from '../lib/types';

  let { title, items, selected, ontoggle, lang, limit = 8, note = '' }: {
    title: string;
    items: Item[];
    selected: Set<number>;
    ontoggle: (id: number) => void;
    lang: Lang;
    limit?: number;
    note?: string;
  } = $props();

  let expanded = $state(false);
  const nonzero = $derived(items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value));
  const total = $derived(nonzero.reduce((s, i) => s + i.value, 0));
  const max = $derived(nonzero[0]?.value ?? 1);
  // Selected items stay visible even when they are outside the top N.
  const shown = $derived.by(() => {
    if (expanded) return nonzero;
    const top = nonzero.slice(0, limit);
    const extra = nonzero.filter((i) => selected.has(i.id) && !top.includes(i));
    return [...top, ...extra];
  });
</script>

<section class="bars">
  <h3 class="eyebrow">{title}</h3>
  <ul>
    {#each shown as i (i.id)}
      {@const on = selected.has(i.id)}
      <li>
        <button
          type="button"
          class="row"
          class:muted={selected.size > 0 && !on}
          aria-pressed={on}
          title={t(lang, 'clickToFilter')}
          onclick={() => ontoggle(i.id)}
        >
          <span class="label">{i.label}</span>
          <span class="val tnum">{fmtInt(lang, i.value)}<small>{fmtPct(lang, (i.value / total) * 100)}</small></span>
          <span class="track" aria-hidden="true"><span class="fill" style:width="{(i.value / max) * 100}%"></span></span>
        </button>
      </li>
    {:else}
      <li class="empty">–</li>
    {/each}
  </ul>
  {#if nonzero.length > limit}
    <button type="button" class="linkish more" onclick={() => (expanded = !expanded)} aria-expanded={expanded}>
      {expanded ? t(lang, 'showLess') : `${t(lang, 'showAll')} (${nonzero.length})`}
    </button>
  {/if}
  {#if note}<p class="note">{note}</p>{/if}
</section>

<style>
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  .row {
    width: 100%; display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; align-items: baseline;
    padding: 6px 8px; margin: 0 -8px; width: calc(100% + 16px);
    border: 0; background: none; border-radius: 6px; text-align: left; font-size: 13.5px;
  }
  .row:hover { background: var(--surface-2); }
  .row[aria-pressed='true'] { background: var(--accent-soft); }
  .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .val { font-size: 13px; color: var(--ink); display: inline-flex; gap: 8px; align-items: baseline; }
  .val small { color: var(--muted); font-size: 11.5px; min-width: 3.2em; text-align: right; }
  .track { grid-column: 1 / -1; height: 6px; display: block; }
  .fill {
    display: block; height: 100%; background: var(--bar);
    border-radius: 0 3px 3px 0; min-width: 2px; transition: width 0.3s ease;
  }
  .muted .fill { background: var(--bar-muted); }
  .muted .label, .muted .val { color: var(--muted); }
  .row[aria-pressed='true'] .fill { background: var(--accent); }
  .more { margin-top: 8px; }
  .empty { color: var(--muted); }
  .note { font-size: 12px; color: var(--muted); margin: 8px 0 0; }
</style>
