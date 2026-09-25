<script lang="ts">
  import { onMount } from 'svelte';
  import { aggregate, loadBlock, loadMeta, totalFor, type Block, type Filters, type Level, type Meta } from './lib/data';
  import { loadGeo, type GeoData } from './lib/geo';
  import { app, type Theme } from './lib/state.svelte';
  import { periodLabel, t } from './lib/i18n';
  import { fmtInt, fmtPct, fmtRate, fmtSignedPct, makeClasses, type Metric } from './lib/scale';
  import type { Area, Group, Item } from './lib/types';
  import MapView from './components/MapView.svelte';
  import Legend from './components/Legend.svelte';
  import Trend from './components/Trend.svelte';
  import BarList from './components/BarList.svelte';
  import Pyramid from './components/Pyramid.svelte';
  import RegionTable from './components/RegionTable.svelte';
  import PlaceSearch from './components/PlaceSearch.svelte';
  import MultiSelect from './components/MultiSelect.svelte';
  import Segmented from './components/Segmented.svelte';

  let meta = $state.raw<Meta | null>(null);
  let geo = $state.raw<GeoData | null>(null);
  let error = $state<string | null>(null);
  let block = $state.raw<Block | null>(null);
  let prevBlock = $state.raw<Block | null>(null);
  let prefBlock = $state.raw<Block | null>(null);     // same period, prefecture data (complete age/sex)
  let prefPrevBlock = $state.raw<Block | null>(null);
  let loading = $state(false);
  let blocks = $state.raw(new Map<string, Block>()); // for the time series
  let highlight = $state<number | null>(null);
  let sheet: HTMLDialogElement | undefined = $state();

  const L = $derived(app.lang);
  const tt = (k: Parameters<typeof t>[1]) => t(L, k);

  // ------------------------------------------------------------ boot
  async function boot() {
    error = null;
    try {
      const m = await loadMeta();
      const g = await loadGeo(m.geoMerge);
      app.fromHash(location.hash, m.periods);
      meta = m;
      geo = g;
    } catch (e) {
      error = String(e);
    }
  }

  onMount(() => {
    boot();
    const mq = matchMedia('(prefers-color-scheme: dark)');
    app.systemDark = mq.matches;
    const onmq = () => (app.systemDark = mq.matches);
    mq.addEventListener('change', onmq);
    const onhash = () => { if (meta && location.hash.slice(1) !== app.toHash()) app.fromHash(location.hash, meta.periods); };
    addEventListener('hashchange', onhash);
    return () => { mq.removeEventListener('change', onmq); removeEventListener('hashchange', onhash); };
  });

  $effect(() => {
    document.documentElement.lang = app.lang;
    document.title = `${t(app.lang, 'title')} · ${app.lang === 'ja' ? 'Foreign Residents in Japan' : '在留外国人マップ'}`;
  });
  $effect(() => {
    const root = document.documentElement;
    if (app.theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = app.theme;
  });
  $effect(() => {
    if (!meta) return;
    const h = app.toHash();
    if (location.hash.slice(1) !== h) history.replaceState(null, '', h ? `#${h}` : location.pathname + location.search);
  });

  // ------------------------------------------------------------ lookups
  const muniPref = $derived.by(() => {
    const a = new Uint8Array((meta?.muni.length ?? 0) + 1);
    meta?.muni.forEach((m, i) => (a[i + 1] = Number(m.pref)));
    return a;
  });
  const muniIdx = $derived(new Map(meta?.muni.map((m, i) => [m.code, i + 1]) ?? []));
  const prefName = (code: number) => {
    const p = meta?.pref.find((x) => Number(x.code) === code);
    return p ? p[L] : '';
  };
  const periods = $derived(meta ? meta.periods[app.level] : []);
  const prevPeriod = $derived.by(() => {
    const i = periods.indexOf(app.period);
    return i > 0 ? periods[i - 1] : null;
  });

  // ------------------------------------------------------------ loading
  $effect(() => {
    const lv = app.level, p = app.period;
    if (!meta || !p) return;
    let alive = true;
    loading = true;
    loadBlock(lv, p)
      .then((b) => { if (alive) { block = b; loading = false; } })
      .catch((e) => { if (alive) error = String(e); });
    return () => { alive = false; };
  });
  $effect(() => {
    const lv = app.level, p = prevPeriod;
    if (!meta) return;
    if (!p) { prevBlock = null; return; }
    let alive = true;
    loadBlock(lv, p).then((b) => { if (alive) prevBlock = b; }).catch(() => {});
    return () => { alive = false; };
  });
  // The municipal files withhold age/sex for small places; totals for Japan or a
  // prefecture therefore always come from the complete prefecture-level data.
  $effect(() => {
    const p = app.period, pp = meta?.periods.pref[meta.periods.pref.indexOf(p) - 1] ?? null;
    if (!meta || !p || !meta.periods.pref.includes(p)) return;
    let alive = true;
    loadBlock('pref', p).then((b) => { if (alive) prefBlock = b; }).catch(() => {});
    if (pp) loadBlock('pref', pp).then((b) => { if (alive) prefPrevBlock = b; }).catch(() => {});
    else prefPrevBlock = null;
    return () => { alive = false; };
  });

  // Time series: fetch every period in the background, newest first.
  $effect(() => {
    if (!meta) return;
    const wanted: [Level, string][] = [...meta.periods.pref].reverse().map((p) => ['pref', p]);
    if (app.level === 'muni') wanted.unshift(...[...meta.periods.muni].reverse().map((p): [Level, string] => ['muni', p]));
    let alive = true;
    (async () => {
      for (const [lv, p] of wanted) {
        const key = `${lv}/${p}`;
        if (blocks.has(key)) continue;
        try {
          const b = await loadBlock(lv, p);
          if (!alive) return;
          blocks = new Map(blocks).set(key, b);
        } catch { /* shown via the main loader */ }
      }
    })();
    return () => { alive = false; };
  });

  // ------------------------------------------------------------ aggregation
  const filters = $derived<Filters>({
    nat: new Set(app.nat),
    status: new Set(app.status),
    sex: new Set(app.sex),
    age: app.age ? [app.age[0], app.age[1]] : null,
  });

  const focusArgs = $derived.by((): [number, number] => {
    if (app.level === 'muni') return app.muni ? [app.muni, 0] : [0, app.pref];
    return [app.pref, 0];
  });
  const regionCount = $derived(app.level === 'pref' ? 100 : (meta?.muni.length ?? 0) + 2);
  const blockOk = (b: Block | null) => !!b && b.level === app.level;

  const agg = $derived(blockOk(block) ? aggregate(block!, filters, regionCount, ...focusArgs, muniPref) : null);
  const prevAgg = $derived(
    blockOk(prevBlock) && prevBlock!.period === prevPeriod
      ? aggregate(prevBlock!, filters, regionCount, ...focusArgs, muniPref) : null,
  );

  const usePrefPanel = $derived(app.level === 'muni' && !app.muni);
  const panelPrevPeriod = $derived(usePrefPanel ? (meta?.periods.pref[meta.periods.pref.indexOf(app.period) - 1] ?? null) : prevPeriod);
  const panel = $derived.by(() => {
    if (!usePrefPanel) return agg;
    return prefBlock && prefBlock.period === app.period ? aggregate(prefBlock, filters, 100, app.pref, 0) : null;
  });
  const panelPrev = $derived.by(() => {
    if (!usePrefPanel) return prevAgg;
    return prefPrevBlock && prefPrevBlock.period === panelPrevPeriod ? aggregate(prefPrevBlock, filters, 100, app.pref, 0) : null;
  });

  const pooledPeriod = $derived(app.level === 'muni' && (app.period === '2023-12' || app.period === '2024-06'));

  const areas = $derived.by((): Area[] => {
    if (!meta || !agg) return [];
    const out: Area[] = [];
    const popList = app.level === 'pref' ? meta.population.pref[app.period] : meta.population.muni[app.period];
    const mk = (idx: number, code: string, name: string, alt: string, parent: string, prefIdx: number,
                present: boolean): Area => {
      const count = agg.value[idx], hidden = agg.hidden[idx], all = agg.all[idx];
      const pop = (idx && popList?.[idx]) || NaN;
      const per1000 = pop > 0 ? (count / pop) * 1000 : NaN;
      const prev = prevAgg ? prevAgg.value[idx] : NaN;
      const prevHidden = prevAgg ? prevAgg.hidden[idx] : 0;
      const share = all > 0 ? (count / all) * 100 : NaN;
      const change = prev > 0 && prevHidden === 0 && (hidden === 0 || count > 0) ? ((count - prev) / prev) * 100 : NaN;
      let state: Area['state'] = 'ok';
      if (!present) state = pooledPeriod ? 'hidden' : 'zero';
      else if (count === 0 && hidden > 0) state = 'hidden';
      else if (count === 0) state = 'zero';
      const value = app.metric === 'count' ? count : app.metric === 'share' ? share
        : app.metric === 'per1000' ? per1000 : change;
      return { idx, code, name, alt, parent, prefIdx, count, hidden, all, pop, per1000, share, change, prevCount: prev, value, state };
    };
    if (app.level === 'pref') {
      for (const p of meta.pref) {
        const idx = Number(p.code);
        if (idx > 47) continue;
        out.push(mk(idx, p.code, p[L], p[L === 'ja' ? 'en' : 'ja'], '', idx, true));
      }
      return out;
    }
    const seen = new Set<string>();
    meta.muni.forEach((m, i) => {
      if (!m.geo && !meta!.geoMerge[m.code]) return;
      const idx = i + 1;
      const present = agg.all[idx] > 0;
      if (!present && m.code in meta!.geoMerge) return;
      seen.add(m.code);
      out.push(mk(idx, m.code, m[L], m[L === 'ja' ? 'en' : 'ja'], prefName(Number(m.pref)), Number(m.pref), present));
    });
    // Areas on the map without any row in this period.
    for (const s of geo?.munis ?? []) {
      if (seen.has(s.code)) continue;
      const excluded = meta.noStats.includes(s.code);
      const a = mk(0, s.code, s.name, s.name, prefName(Number(s.code.slice(0, 2))), Number(s.code.slice(0, 2)), excluded);
      a.state = excluded ? 'excluded' : pooledPeriod ? 'hidden' : 'zero';
      a.count = 0; a.hidden = 0; a.all = 0; a.per1000 = NaN; a.value = app.metric === 'count' ? 0 : NaN;
      out.push(a);
    }
    return out;
  });
  const areaMap = $derived(new Map(areas.map((a) => [a.code, a])));
  const classes = $derived(
    makeClasses(areas.filter((a) => a.state === 'ok').map((a) => a.value), app.metric, app.dark),
  );

  const series = $derived.by(() => {
    if (!meta) return [];
    const useMuni = app.level === 'muni' && app.muni > 0;
    const list = useMuni ? meta.periods.muni : meta.periods.pref;
    return list.map((p) => {
      const b = blocks.get(`${useMuni ? 'muni' : 'pref'}/${p}`);
      if (!b) return { period: p, value: null };
      return { period: p, value: useMuni ? totalFor(b, filters, app.muni, 0, muniPref) : totalFor(b, filters, app.pref) };
    });
  });

  // ------------------------------------------------------------ breakdown items
  const natItems = $derived<Item[]>(
    meta && panel ? meta.nat.map((n, i) => ({ id: i + 1, label: n[L], alt: n[L === 'ja' ? 'en' : 'ja'], value: panel.byNat[i + 1] })) : [],
  );
  const statusItems = $derived<Item[]>(
    meta && panel ? meta.status.map((s, i) => ({ id: i + 1, label: s[L], alt: s[L === 'ja' ? 'en' : 'ja'], value: panel.byStatus[i + 1] })) : [],
  );
  const statusGroups = $derived<Group[]>(meta ? meta.statusGroups.map((g) => ({ id: g.id, label: g[L], ids: g.codes })) : []);
  const natPicker = $derived([...natItems].sort((a, b) => b.value - a.value));

  // ------------------------------------------------------------ actions
  function setLevel(lv: Level) {
    if (!meta || lv === app.level) return;
    const list = meta.periods[lv];
    if (!list.includes(app.period)) app.period = list[list.length - 1];
    app.level = lv;
    if (lv === 'pref') app.muni = 0;
  }
  function select(code: string | null) {
    if (!code) { app.pref = 0; app.muni = 0; return; }
    if (app.level === 'pref' || code.length === 2) { app.pref = Number(code); app.muni = 0; return; }
    const idx = muniIdx.get(code);
    app.pref = Number(code.slice(0, 2));
    app.muni = idx ?? 0;
  }
  function setGroup(set: typeof app.status, ids: number[], on: boolean) {
    for (const id of ids) on ? set.add(id) : set.delete(id);
  }
  function setAgeFrom(v: number) {
    const to = app.age ? app.age[1] : 17;
    app.age = v === 1 && to === 17 ? null : [v, Math.max(v, to)];
  }
  function setAgeTo(v: number) {
    const from = app.age ? app.age[0] : 1;
    app.age = from === 1 && v === 17 ? null : [Math.min(from, v), v];
  }

  const places = $derived.by(() => {
    if (!meta) return [];
    type Place = { code: string; name: string; alt: string; parent: string; kind: 'pref' | 'muni' };
    const list: Place[] = meta.pref.filter((p) => Number(p.code) <= 47)
      .map((p) => ({ code: p.code, name: p[L], alt: p[L === 'ja' ? 'en' : 'ja'], parent: '', kind: 'pref' }));
    for (const m of meta.muni) {
      if (!m.geo) continue;
      list.push({ code: m.code, name: m[L], alt: m[L === 'ja' ? 'en' : 'ja'], parent: prefName(Number(m.pref)), kind: 'muni' });
    }
    return list;
  });
  function pickPlace(p: { code: string; kind: 'pref' | 'muni' }) {
    if (p.kind === 'muni' && app.level !== 'muni') setLevel('muni');
    select(p.code);
  }

  // ------------------------------------------------------------ readout
  const focusName = $derived.by(() => {
    if (!meta) return '';
    if (app.level === 'muni' && app.muni) return meta.muni[app.muni - 1]?.[L] ?? '';
    return app.pref ? prefName(app.pref) : tt('japan');
  });
  const delta = $derived(
    panel && panelPrev && panelPrev.total > 0 && panelPrev.totalHidden === 0 ? ((panel.total - panelPrev.total) / panelPrev.total) * 100 : NaN,
  );
  const hasFilters = $derived(app.filterCount > 0);
  // Population of the focused area (Japan, prefecture or municipality) for the per-1,000 figure.
  const focusPop = $derived.by(() => {
    if (!meta) return NaN;
    if (app.level === 'muni' && app.muni) return meta.population.muni[app.period]?.[app.muni] ?? NaN;
    return meta.population.pref[app.period]?.[app.pref] ?? NaN;
  });
  const muniAgeSexMissing = $derived(
    app.level === 'muni' && !!meta && !meta.periods.muniAgeSex.includes(app.period) && (app.sex.size > 0 || app.age !== null),
  );

  const metricOptions = $derived([
    { value: 'count' as Metric, label: tt('metricCount') },
    { value: 'per1000' as Metric, label: tt('metricPer1000'), title: tt('metricPer1000Hint') },
    { value: 'share' as Metric, label: tt('metricShare'), title: tt('metricShareHint') },
    { value: 'change' as Metric, label: tt('metricChange'), title: tt('metricChangeHint'), disabled: !prevPeriod },
  ]);
  const ageOpts = $derived(meta ? meta.age.filter((a) => a.code <= 17) : []);
  const themeOptions = $derived([
    { value: 'light' as Theme, label: tt('themeLight') },
    { value: 'dark' as Theme, label: tt('themeDark') },
    { value: 'system' as Theme, label: tt('themeSystem') },
  ]);
</script>

<a class="skip" href="#main">{tt('skip')}</a>

<div class="page">
  <header class="top">
    <div class="brand">
      <h1><span class="mark" aria-hidden="true"></span>{tt('title')}</h1>
      <p class="lede">{tt('subtitle')}</p>
    </div>
    <div class="prefs">
      <Segmented label={tt('language')} options={[{ value: 'ja', label: '日本語' }, { value: 'en', label: 'English' }]}
        value={app.lang} onchange={(v) => app.setLang(v as 'ja' | 'en')} />
      <Segmented label={tt('theme')} options={themeOptions} value={app.theme} onchange={(v) => app.setTheme(v)} />
    </div>
  </header>

  {#if error}
    <div class="state" role="alert">
      <p>{tt('loadError')}</p>
      <p class="muted small">{error}</p>
      <button class="btn" type="button" onclick={boot}>{tt('retry')}</button>
    </div>
  {:else if !meta || !geo}
    <div class="state" aria-busy="true"><p>{tt('loading')}</p></div>
  {:else}
    {#snippet controls()}
      <label class="field">
        <span class="lbl">{tt('period')}</span>
        <select class="sel" bind:value={app.period}>
          {#each [...periods].reverse() as p (p)}
            <option value={p}>{periodLabel(L, p)}</option>
          {/each}
        </select>
      </label>
      <div class="field">
        <span class="lbl">{tt('level')}</span>
        <Segmented label={tt('level')} value={app.level} onchange={setLevel}
          options={[{ value: 'pref' as Level, label: tt('levelPref') }, { value: 'muni' as Level, label: tt('levelMuni'), title: tt('muniSince') }]} />
      </div>
      <div class="field grow">
        <MultiSelect label={tt('nationality')} placeholder={tt('all')} items={natPicker} selected={app.nat}
          ontoggle={(id) => app.toggle(app.nat, id)} onclear={() => app.nat.clear()} />
      </div>
      <div class="field grow">
        <MultiSelect label={tt('status')} placeholder={tt('all')} items={statusItems} groups={statusGroups} selected={app.status}
          ontoggle={(id) => app.toggle(app.status, id)} onclear={() => app.status.clear()}
          onsetgroup={(ids, on) => setGroup(app.status, ids, on)} />
      </div>
      <div class="field">
        <span class="lbl">{tt('sex')}</span>
        <Segmented label={tt('sex')} multi selected={[...app.sex]} onchange={(v) => app.toggle(app.sex, v)}
          options={meta!.sex.map((s) => ({ value: s.code, label: s[L] }))} />
      </div>
      <fieldset class="field age">
        <legend class="lbl">{tt('age')}</legend>
        <div class="agesel">
          <select class="sel" aria-label="{tt('age')} (from)" value={app.age ? app.age[0] : 1} onchange={(e) => setAgeFrom(Number(e.currentTarget.value))}>
            {#each ageOpts as a (a.code)}<option value={a.code}>{(a.code - 1) * 5}</option>{/each}
          </select>
          <span aria-hidden="true">–</span>
          <select class="sel" aria-label="{tt('age')} (to)" value={app.age ? app.age[1] : 17} onchange={(e) => setAgeTo(Number(e.currentTarget.value))}>
            {#each ageOpts as a (a.code)}<option value={a.code}>{a.code === 17 ? '80+' : (a.code - 1) * 5 + 4}</option>{/each}
          </select>
        </div>
      </fieldset>
      {#if hasFilters}
        <button type="button" class="linkish clear" onclick={() => app.clearFilters()}>{tt('clearAll')}</button>
      {/if}
    {/snippet}

    <div class="filterbar desktop" role="search" aria-label={tt('filters')}>
      {@render controls()}
    </div>

    <div class="mobilebar">
      <button type="button" class="btn" onclick={() => sheet?.showModal()}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M4.5 8h7M7 12h2" stroke="currentColor" stroke-width="1.6" /></svg>
        {tt('filters')}{#if hasFilters}<span class="count">{app.filterCount}</span>{/if}
      </button>
      <span class="mperiod">{periodLabel(L, app.period)} · {app.level === 'pref' ? tt('levelPref') : tt('levelMuni')}</span>
    </div>
    <dialog class="sheet" bind:this={sheet} aria-label={tt('filters')} onclick={(e) => { if (e.target === sheet) sheet?.close(); }}>
      <div class="sheet-inner">
        <div class="sheet-head">
          <h2>{tt('filters')}</h2>
          <button type="button" class="btn ghost" onclick={() => sheet?.close()}>{tt('close')}</button>
        </div>
        <div class="sheet-body">{@render controls()}</div>
        <button type="button" class="btn primary" onclick={() => sheet?.close()}>{tt('showResults')}</button>
      </div>
    </dialog>

    <main id="main" class="grid" class:stale={loading}>
      <section class="readout" aria-live="polite">
        {#if app.pref}
          <nav class="crumbs" aria-label="breadcrumb">
            <button type="button" class="linkish" onclick={() => select(null)}>{tt('japan')}</button>
            {#if app.muni}
              <span aria-hidden="true">/</span>
              <button type="button" class="linkish" onclick={() => { app.muni = 0; }}>{prefName(app.pref)}</button>
            {/if}
          </nav>
        {/if}
        <h2 class="place">{focusName}</h2>
        {#if panel}
          <p class="hero tnum">{fmtInt(L, panel.total)}<span class="unit">{L === 'ja' ? '人' : ''}</span></p>
          <p class="facts">
            <span>{hasFilters ? tt('matching') : tt('foreignResidents')} · {periodLabel(L, app.period)}</span>
            {#if hasFilters && panel.totalAll > 0}
              {#if L === 'ja'}
              <span>{tt('ofAll')} <strong class="tnum">{fmtPct(L, (panel.total / panel.totalAll) * 100)}</strong></span>
            {:else}
              <span><strong class="tnum">{fmtPct(L, (panel.total / panel.totalAll) * 100)}</strong> {tt('ofAll')}</span>
            {/if}
            {/if}
            {#if focusPop > 0}
              {#if L === 'ja'}
                <span>{tt('per1000Long')} <strong class="tnum">{fmtRate(L, (panel.total / focusPop) * 1000)}</strong>人</span>
              {:else}
                <span><strong class="tnum">{fmtRate(L, (panel.total / focusPop) * 1000)}</strong> {tt('per1000Long')}</span>
              {/if}
            {/if}
            {#if isFinite(delta) && panelPrevPeriod}
              <span class:up={delta > 0} class:down={delta < 0}>
                {#if L === 'ja'}
                {periodLabel(L, panelPrevPeriod)}比 <strong class="tnum">{fmtSignedPct(L, delta)}</strong>
              {:else}
                <strong class="tnum">{fmtSignedPct(L, delta)}</strong> {tt('vsPrev')} {periodLabel(L, panelPrevPeriod)}
              {/if}
              </span>
            {/if}
            {#if panel.totalHidden > 0}
              <span class="muted">+{fmtInt(L, panel.totalHidden)} {tt('partial')}</span>
            {/if}
          </p>
        {/if}
      </section>

      <section class="mapcol" aria-label={tt('map')}>
        <div class="toolbar">
          <div class="tools">
            <Segmented label={tt('map') + ' / ' + tt('table')} value={app.view} onchange={(v) => (app.view = v)}
              options={[{ value: 'map' as 'map' | 'table', label: tt('map') }, { value: 'table' as 'map' | 'table', label: tt('table') }]} />
            <Segmented label={tt('metric')} value={app.metric} onchange={(v) => (app.metric = v)} options={metricOptions} />
          </div>
          {#if app.view === 'map'}
            <div class="search"><PlaceSearch {places} lang={L} onpick={pickPlace} /></div>
          {/if}
        </div>

        {#if app.view === 'map'}
          <div class="mapwrap">
            <MapView {geo} level={app.level} areas={areaMap} {classes} metric={app.metric} lang={L}
              focusCode={app.level === 'muni' ? (app.muni ? meta.muni[app.muni - 1]?.code ?? null : app.pref ? String(app.pref).padStart(2, '0') : null) : (app.pref ? String(app.pref).padStart(2, '0') : null)}
              zoomTo={app.level === 'muni' && app.pref ? String(app.pref).padStart(2, '0') : null}
              {highlight} onselect={select} />
            <div class="legend-box">
              <Legend {classes} metric={app.metric} lang={L} level={app.level}
                showHidden={app.level === 'muni'} bind:highlight />
              {#if app.metric === 'change' && prevPeriod}
                <p class="small muted">{L === 'ja' ? `${periodLabel(L, prevPeriod)}比` : `${tt('vsPrev')} ${periodLabel(L, prevPeriod)}`}</p>
              {/if}
            </div>
          </div>
        {:else}
          <RegionTable areas={areas.filter((a) => app.level === 'pref' || !app.pref || a.prefIdx === app.pref)}
            lang={L} level={app.level} metric={app.metric}
            focusCode={app.level === 'muni' && app.muni ? meta.muni[app.muni - 1]?.code ?? null : app.pref ? String(app.pref).padStart(2, '0') : null}
            onselect={select} />
        {/if}

        <div class="notes">
          {#if app.level === 'muni' && (hasFilters)}<p>{tt('hiddenNoteMuni')}</p>{/if}
          {#if muniAgeSexMissing}<p>{tt('noAgeSexMuni')}</p>{/if}
          {#if pooledPeriod}<p>{tt('otherMuniNote')}</p>{/if}
          {#if app.level === 'muni' && app.period === '2023-12'}<p>{tt('hamamatsuNote')}</p>{/if}
          {#if app.level === 'pref'}<p>{tt('legendNote')}</p>{/if}
          {#if app.metric === 'per1000'}<p>{tt('popNote')}</p>{/if}
        </div>

        <div class="trendbox">
          <Trend {series} period={app.period} lang={L} label="{tt('trend')} · {focusName}"
            onselect={(p) => { if (periods.includes(p)) app.period = p; else { setLevel('pref'); app.period = p; } }} />
        </div>
      </section>

      <aside class="side">

        {#if panel}
          <BarList title={tt('topNat')} items={natItems} selected={app.nat} lang={L}
            ontoggle={(id) => app.toggle(app.nat, id)}
            note={panel.byNat[0] > 0 ? `${tt('notPublished')}: ${fmtInt(L, panel.byNat[0])}` : ''} />
          <BarList title={tt('byStatus')} items={statusItems} selected={app.status} lang={L}
            ontoggle={(id) => app.toggle(app.status, id)}
            note={panel.byStatus[0] > 0 ? `${tt('notPublished')}: ${fmtInt(L, panel.byStatus[0])}` : ''} />
          <Pyramid {meta} data={panel.bySexAge} lang={L} sex={app.sex} age={app.age}
            ontogglesex={(s) => app.toggle(app.sex, s)} onsetage={(a) => (app.age = a)} />
        {/if}
      </aside>
    </main>

    <footer class="foot">
      <p><strong>{tt('source')}:</strong> {tt('sourceText')}</p>
      <p>{tt('sourceNote')}</p>
      <p>
        <a href="https://www.e-stat.go.jp/stat-search/files?toukei=00250012&tstat=000001018034" rel="noopener" target="_blank">e-Stat</a>
        · <a href="https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2025.html" rel="noopener" target="_blank">国土数値情報</a>
      </p>
    </footer>
  {/if}
</div>

<style>
  .skip {
    position: absolute; left: 12px; top: -48px; z-index: 100;
    background: var(--ink); color: var(--bg); padding: 8px 12px; border-radius: 6px;
  }
  .skip:focus { top: 12px; }

  .page { max-width: 1480px; margin: 0 auto; padding: 28px clamp(16px, 3vw, 40px) 48px; }

  .top { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; flex-wrap: wrap; padding-bottom: 20px; }
  h1 {
    margin: 0; font-size: clamp(28px, 3.6vw, 44px); line-height: 1.1; font-weight: 600; letter-spacing: -0.02em;
  }
  .mark {
    display: inline-block; width: 0.56em; height: 0.56em; border-radius: 50%;
    background: var(--brand); margin-right: 0.32em; vertical-align: 0.08em;
  }
  .lede { margin: 8px 0 0; color: var(--ink-2); max-width: 62ch; font-size: 14.5px; }
  .prefs { display: flex; gap: 8px; flex-wrap: wrap; }

  .filterbar {
    position: sticky; top: 0; z-index: 20;
    display: flex; flex-wrap: wrap; gap: 14px 18px; align-items: flex-end;
    padding: 12px 0 14px; margin-bottom: 20px;
    background: color-mix(in oklab, var(--bg) 94%, transparent);
    backdrop-filter: blur(8px);
    border-top: 1px solid var(--ink);
    border-bottom: 1px solid var(--line);
  }
  .field { display: grid; gap: 4px; min-width: 0; margin: 0; padding: 0; border: 0; }
  .field.grow { flex: 1 1 170px; max-width: 240px; }
  .lbl { font-size: 12px; color: var(--muted); font-weight: 500; padding: 0; }
  .sel {
    min-height: 38px; padding: 0 30px 0 10px; border: 1px solid var(--line-strong); border-radius: 8px;
    background: var(--surface) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12'%3E%3Cpath d='M2.5 4.5 6 8l3.5-3.5' fill='none' stroke='%23888' stroke-width='1.5'/%3E%3C/svg%3E") no-repeat right 10px center;
    appearance: none; font-size: 14px;
  }
  .agesel { display: flex; align-items: center; gap: 6px; }
  .agesel .sel { padding-right: 26px; }
  .clear { align-self: center; margin-top: 16px; }

  .mobilebar, .sheet { display: none; }

  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(300px, 380px);
    grid-template-areas: 'map readout' 'map side';
    grid-template-rows: auto 1fr;
    gap: 8px 40px;
    transition: opacity 0.2s;
  }
  .grid.stale { opacity: 0.6; }
  .readout { grid-area: readout; border-left: 1px solid var(--line); padding: 0 0 20px 28px; }
  .mapcol { grid-area: map; min-width: 0; }
  .side {
    grid-area: side; display: grid; gap: 28px; align-content: start;
    border-left: 1px solid var(--line); padding: 20px 0 0 28px;
  }

  .crumbs { display: flex; gap: 8px; align-items: center; font-size: 13px; color: var(--muted); flex-wrap: wrap; }
  .crumbs button:disabled { text-decoration: none; color: var(--muted); cursor: default; }
  .place { margin: 4px 0 0; font-size: 20px; font-weight: 600; }
  .hero { margin: 2px 0 0; font-size: clamp(40px, 5vw, 60px); font-weight: 600; letter-spacing: -0.03em; line-height: 1.05; font-variant-numeric: normal; }
  .unit { font-size: 0.4em; margin-left: 4px; font-weight: 500; color: var(--ink-2); }
  .facts { display: flex; flex-wrap: wrap; gap: 4px 18px; margin: 8px 0 0; font-size: 13.5px; color: var(--ink-2); }
  .facts strong { color: var(--ink); font-weight: 600; }

  .toolbar { display: flex; gap: 12px; align-items: center; justify-content: space-between; margin: 0 0 8px; flex-wrap: wrap; }
  .tools { display: flex; gap: 8px; flex-wrap: wrap; }
  .toolbar .search { flex: 0 1 300px; min-width: 200px; }
  .mapwrap { position: relative; }
  .legend-box {
    position: absolute; left: 0; bottom: 0; max-width: 360px;
    padding: 10px 12px; background: color-mix(in oklab, var(--bg) 88%, transparent);
    backdrop-filter: blur(6px); border-radius: 8px;
  }
  .notes { display: grid; gap: 4px; margin-top: 10px; }
  .notes p { margin: 0; font-size: 12.5px; color: var(--muted); max-width: 90ch; }
  .trendbox { margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--line); }

  .state { padding: 80px 0; text-align: center; display: grid; gap: 8px; justify-items: center; }
  .muted { color: var(--muted); }
  .small { font-size: 12.5px; margin: 4px 0 0; }

  .foot { margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--line); font-size: 12.5px; color: var(--muted); }
  .foot p { margin: 0 0 6px; max-width: 110ch; }
  .foot a { color: var(--ink-2); }

  @media (max-width: 1080px) {
    .grid { grid-template-columns: 1fr; grid-template-areas: 'readout' 'map' 'side'; grid-template-rows: auto; }
    .readout { border-left: 0; padding: 0 0 16px; }
    .side { border-left: 0; padding-left: 0; border-top: 1px solid var(--line); padding-top: 24px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 28px 40px; }
  }

  @media (max-width: 720px) {
    .page { padding-top: 18px; }
    .top { padding-bottom: 12px; align-items: flex-start; }
    .filterbar.desktop { display: none; }
    .mobilebar {
      display: flex; align-items: center; gap: 12px; position: sticky; top: 0; z-index: 20;
      padding: 10px 0; margin-bottom: 12px; background: var(--bg); border-top: 1px solid var(--ink); border-bottom: 1px solid var(--line);
    }
    .mperiod { font-size: 13px; color: var(--ink-2); }
    .count {
      display: inline-grid; place-items: center; min-width: 20px; height: 20px; padding: 0 6px;
      border-radius: 10px; background: var(--accent); color: var(--accent-ink); font-size: 12px; font-weight: 600;
    }
    .sheet {
      display: block; border: 0; padding: 0; margin: auto 0 0; width: 100%; max-width: 100%;
      max-height: 90dvh; border-radius: 16px 16px 0 0; background: var(--bg); color: var(--ink);
    }
    .sheet:not([open]) { display: none; }
    .sheet::backdrop { background: rgb(0 0 0 / 0.4); }
    .sheet-inner { display: grid; gap: 16px; padding: 16px 16px calc(16px + env(safe-area-inset-bottom)); }
    .sheet-head { display: flex; justify-content: space-between; align-items: center; }
    .sheet-head h2 { margin: 0; font-size: 18px; }
    .sheet-body { display: grid; gap: 16px; }
    .sheet-body .field.grow { max-width: none; }
    .btn.primary { justify-content: center; background: var(--ink); color: var(--bg); border-color: var(--ink); min-height: 44px; }
    .toolbar .search { flex: 1 1 100%; }
    .legend-box { position: static; max-width: none; padding: 10px 0 0; background: none; }
    .hero { font-size: 44px; }
  }
</style>
