<script lang="ts">
  import type { Meta } from '../lib/data';
  import { fmtCompact, fmtInt } from '../lib/scale';
  import { t, type Lang } from '../lib/i18n';

  let { meta, data, lang, sex, age, ontogglesex, onsetage }: {
    meta: Meta;
    data: Float64Array; // sex*19 + age
    lang: Lang;
    sex: Set<number>;
    age: [number, number] | null;
    ontogglesex: (s: number) => void;
    onsetage: (a: [number, number] | null) => void;
  } = $props();

  const groups = $derived(meta.age.filter((a) => a.code <= 17).slice().reverse());
  const v = (s: number, a: number) => data[s * 19 + a];
  const max = $derived(Math.max(1, ...groups.flatMap((g) => [v(1, g.code), v(2, g.code)])));
  const other = $derived(groups.reduce((s, g) => s + v(3, g.code), 0));
  const unknown = $derived.by(() => {
    let s = 0;
    for (let x = 0; x < 4; x++) s += v(x, 0) + v(x, 18);
    for (let a = 1; a <= 17; a++) s += v(0, a);
    return s;
  });
  const inAge = (a: number) => !age || (a >= age[0] && a <= age[1]);
  const sexOn = (s: number) => sex.size === 0 || sex.has(s);

  function clickRow(a: number) {
    if (age && age[0] === a && age[1] === a) onsetage(null);
    else onsetage([a, a]);
  }
</script>

<section class="pyr">
  <h3 class="eyebrow">{t(lang, 'pyramid')}</h3>
  <div class="sides">
    <button type="button" class="side m" aria-pressed={sex.has(1)} class:muted={!sexOn(1)} onclick={() => ontogglesex(1)}>
      <span class="key" aria-hidden="true"></span>{t(lang, 'male')}
    </button>
    <button type="button" class="side f" aria-pressed={sex.has(2)} class:muted={!sexOn(2)} onclick={() => ontogglesex(2)}>
      <span class="key" aria-hidden="true"></span>{t(lang, 'female')}
    </button>
  </div>
  <ol>
    {#each groups as g (g.code)}
      {@const m = v(1, g.code)}
      {@const f = v(2, g.code)}
      <li>
        <button
          type="button"
          class="row"
          class:out={!inAge(g.code)}
          aria-pressed={!!age && age[0] <= g.code && g.code <= age[1]}
          aria-label="{g[lang]}: {t(lang, 'male')} {fmtInt(lang, m)}, {t(lang, 'female')} {fmtInt(lang, f)}"
          title="{g[lang]} — {t(lang, 'male')} {fmtInt(lang, m)} / {t(lang, 'female')} {fmtInt(lang, f)}"
          onclick={() => clickRow(g.code)}
        >
          <span class="half left">
            <span class="num tnum">{m ? fmtCompact(lang, m) : ''}</span>
            <span class="bar m" class:muted={!sexOn(1)} style:width="{(m / max) * 100}%"></span>
          </span>
          <span class="age tnum">{lang === 'ja' ? g.ja.replace('歳', '') : g.en}</span>
          <span class="half right">
            <span class="bar f" class:muted={!sexOn(2)} style:width="{(f / max) * 100}%"></span>
            <span class="num tnum">{f ? fmtCompact(lang, f) : ''}</span>
          </span>
        </button>
      </li>
    {/each}
  </ol>
  {#if other > 0 || unknown > 0}
    <p class="note">
      {#if other > 0}{t(lang, 'other')}: {fmtInt(lang, other)}{/if}
      {#if other > 0 && unknown > 0} · {/if}
      {#if unknown > 0}{t(lang, 'notPublished')}: {fmtInt(lang, unknown)}{/if}
    </p>
  {/if}
</section>

<style>
  .sides { display: flex; justify-content: space-between; margin-bottom: 4px; }
  .side {
    display: inline-flex; align-items: center; gap: 6px; border: 0; background: none;
    font-size: 12.5px; color: var(--ink-2); padding: 4px 6px; border-radius: 6px;
  }
  .side:hover { background: var(--surface-2); }
  .side[aria-pressed='true'] { background: var(--accent-soft); color: var(--ink); font-weight: 600; }
  .side.muted { color: var(--muted); }
  .key { width: 10px; height: 10px; border-radius: 2px; }
  .m .key { background: var(--male); }
  .f .key { background: var(--female); }
  ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 0; }
  .row {
    width: 100%; display: grid; grid-template-columns: 1fr 48px 1fr; align-items: center;
    border: 0; background: none; padding: 1.5px 0; border-radius: 4px; font-size: 11px;
  }
  .row:hover { background: var(--surface-2); }
  .row[aria-pressed='true'] { background: var(--accent-soft); }
  .row.out { opacity: 0.35; }
  .half { display: flex; align-items: center; gap: 4px; height: 12px; }
  .left { justify-content: flex-end; }
  .bar { height: 10px; min-width: 1px; transition: width 0.3s ease; }
  .bar.m { background: var(--male); border-radius: 2px 0 0 2px; }
  .bar.f { background: var(--female); border-radius: 0 2px 2px 0; }
  .bar.muted { opacity: 0.3; }
  .age { text-align: center; color: var(--ink-2); font-size: 11px; }
  .num { color: var(--muted); font-size: 10.5px; min-width: 2.6em; white-space: nowrap; }
  .left .num { text-align: right; }
  .note { font-size: 12px; color: var(--muted); margin: 8px 0 0; }
</style>
