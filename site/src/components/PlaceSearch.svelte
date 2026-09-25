<script lang="ts">
  import { t, type Lang } from '../lib/i18n';
  import { norm } from '../lib/text';

  interface Place { code: string; name: string; alt: string; parent: string; kind: 'pref' | 'muni' }
  let { places, lang, onpick }: { places: Place[]; lang: Lang; onpick: (p: Place) => void } = $props();

  let q = $state('');
  let open = $state(false);
  let active = $state(0);
  const uid = $props.id();

  const results = $derived.by(() => {
    const s = norm(q.trim());
    if (!s) return [];
    const starts: Place[] = [], contains: Place[] = [];
    for (const p of places) {
      const a = norm(p.name), b = norm(p.alt);
      if (a.startsWith(s) || b.startsWith(s)) starts.push(p);
      else if (a.includes(s) || b.includes(s)) contains.push(p);
      if (starts.length > 12) break;
    }
    return [...starts, ...contains].slice(0, 12);
  });

  function pick(p: Place) {
    onpick(p);
    q = '';
    open = false;
  }
  function onkeydown(e: KeyboardEvent) {
    if (!results.length) return;
    if (e.key === 'ArrowDown') { active = (active + 1) % results.length; open = true; e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = (active - 1 + results.length) % results.length; e.preventDefault(); }
    else if (e.key === 'Enter') { pick(results[active]); e.preventDefault(); }
    else if (e.key === 'Escape') { open = false; }
  }
</script>

<div class="search">
  <svg class="icon" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.8" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M10.6 10.6 14 14" stroke="currentColor" stroke-width="1.5" /></svg>
  <input
    type="search"
    role="combobox"
    aria-expanded={open && results.length > 0}
    aria-controls="{uid}-list"
    aria-activedescendant={open && results.length ? `${uid}-${active}` : undefined}
    aria-autocomplete="list"
    aria-label={t(lang, 'searchPlace')}
    placeholder={t(lang, 'searchPlace')}
    bind:value={q}
    oninput={() => { open = true; active = 0; }}
    onfocus={() => (open = true)}
    onblur={() => setTimeout(() => (open = false), 150)}
    {onkeydown}
  />
  {#if open && results.length}
    <ul id="{uid}-list" role="listbox">
      {#each results as p, i (p.kind + p.code)}
        <li
          id="{uid}-{i}"
          role="option"
          aria-selected={i === active}
          onpointerdown={(e) => { e.preventDefault(); pick(p); }}
        >
          <span>{p.name}</span>
          <small>{p.parent ? p.parent + ' · ' : ''}{p.alt}</small>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .search { position: relative; }
  .icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--muted); pointer-events: none; }
  input {
    width: 100%; min-height: 38px; padding: 0 12px 0 32px;
    border: 1px solid var(--line-strong); border-radius: 8px; background: var(--surface);
  }
  ul {
    position: absolute; z-index: 45; top: calc(100% + 4px); left: 0; right: 0;
    list-style: none; margin: 0; padding: 4px 0;
    background: var(--surface); border: 1px solid var(--line-strong); border-radius: 10px; box-shadow: var(--shadow);
    max-height: 320px; overflow: auto;
  }
  li { display: flex; flex-direction: column; padding: 7px 12px; cursor: pointer; line-height: 1.3; }
  li[aria-selected='true'], li:hover { background: var(--surface-2); }
  small { color: var(--muted); font-size: 11.5px; }
</style>
