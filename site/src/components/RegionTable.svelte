<script lang="ts">
  import type { Area } from '../lib/types';
  import { fmtInt, fmtPct, fmtRate, fmtSignedPct, type Metric } from '../lib/scale';
  import { t, type Lang } from '../lib/i18n';
  import { norm } from '../lib/text';

  let { areas, lang, level, metric, focusCode, onselect }: {
    areas: Area[];
    lang: Lang;
    level: 'pref' | 'muni';
    metric: Metric;
    focusCode: string | null;
    onselect: (code: string) => void;
  } = $props();

  type Key = 'name' | 'count' | 'per1000' | 'share' | 'change';
  let sortKey = $state<Key>('count');
  let desc = $state(true);
  let limit = $state(100);
  let query = $state('');

  $effect(() => { sortKey = metric === 'count' ? 'count' : metric; desc = true; });

  const rows = $derived.by(() => {
    const q = norm(query.trim());
    const list = areas.filter((a) => a.state !== 'excluded' && (!q || norm(a.name).includes(q) || norm(a.alt).includes(q)));
    const val = (a: Area): number | string =>
      sortKey === 'name' ? a.code : sortKey === 'count' ? a.count : sortKey === 'per1000' ? a.per1000 : sortKey === 'share' ? a.share : a.change;
    return list.sort((a, b) => {
      const va = val(a), vb = val(b);
      if (typeof va === 'string') return (desc ? -1 : 1) * va.localeCompare(vb as string);
      const na = isFinite(va) ? va : -Infinity, nb = isFinite(vb as number) ? (vb as number) : -Infinity;
      return desc ? nb - na : na - nb;
    });
  });

  function sortBy(k: Key) {
    if (sortKey === k) desc = !desc;
    else { sortKey = k; desc = k !== 'name'; }
  }
  const aria = (k: Key) => (sortKey === k ? (desc ? 'descending' : 'ascending') : 'none');
  const people = (v: number) => fmtInt(lang, v);
</script>

<div class="wrap">
  <input class="q" type="search" bind:value={query} placeholder={t(lang, 'searchPlace')} aria-label={t(lang, 'searchPlace')} />
  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th scope="col" class="num">#</th>
          <th scope="col" aria-sort={aria('name')}><button type="button" onclick={() => sortBy('name')}>{t(lang, 'area')}</button></th>
          <th scope="col" class="num" aria-sort={aria('count')}><button type="button" onclick={() => sortBy('count')}>{t(lang, 'residents')}</button></th>
          <th scope="col" class="num" aria-sort={aria('per1000')}><button type="button" onclick={() => sortBy('per1000')}>{t(lang, 'per1000')}</button></th>
          <th scope="col" class="num" aria-sort={aria('share')}><button type="button" onclick={() => sortBy('share')}>{t(lang, 'share')}</button></th>
          <th scope="col" class="num" aria-sort={aria('change')}><button type="button" onclick={() => sortBy('change')}>{t(lang, 'change')}</button></th>
        </tr>
      </thead>
      <tbody>
        {#each rows.slice(0, limit) as a, i (a.code)}
          <tr class:focus={a.code === focusCode}>
            <td class="num tnum muted">{i + 1}</td>
            <th scope="row">
              <button type="button" class="place" onclick={() => onselect(a.code)}>
                {a.name}{#if level === 'muni' && a.parent}<span class="muted"> · {a.parent}</span>{/if}
              </button>
            </th>
            {#if a.state === 'hidden'}
              <td class="num muted" colspan="4">{t(lang, 'notPublished')}</td>
            {:else}
              <td class="num tnum">{people(a.count)}{#if a.hidden > 0}<span class="muted">*</span>{/if}</td>
              <td class="num tnum">{isFinite(a.per1000) ? fmtRate(lang, a.per1000) : '–'}</td>
              <td class="num tnum">{isFinite(a.share) ? fmtPct(lang, a.share) : '–'}</td>
              <td class="num tnum">{isFinite(a.change) ? fmtSignedPct(lang, a.change) : '–'}</td>
            {/if}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if rows.length > limit}
    <button type="button" class="linkish" onclick={() => (limit += 200)}>{t(lang, 'showAll')} ({rows.length})</button>
  {/if}
</div>

<style>
  .wrap { display: grid; gap: 10px; }
  .q {
    min-height: 38px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: 8px;
    background: var(--surface); max-width: 360px;
  }
  .scroll { overflow: auto; max-height: min(70vh, 720px); border-top: 1px solid var(--line); }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  thead th { position: sticky; top: 0; background: var(--bg); z-index: 1; }
  th, td { padding: 7px 10px; border-bottom: 1px solid var(--line); text-align: left; font-weight: 400; }
  thead th { font-size: 12px; color: var(--muted); font-weight: 600; }
  thead button { border: 0; background: none; padding: 0; font: inherit; color: inherit; }
  th[aria-sort='ascending'] button::after { content: ' ↑'; }
  th[aria-sort='descending'] button::after { content: ' ↓'; }
  .num { text-align: right; white-space: nowrap; }
  .muted { color: var(--muted); }
  .place { border: 0; background: none; padding: 0; text-align: left; font: inherit; color: var(--ink); }
  .place:hover { text-decoration: underline; text-underline-offset: 3px; }
  tr.focus { background: var(--accent-soft); }
</style>
