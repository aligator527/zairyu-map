<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { t } from '../lib/i18n';
  import { fmtCompact } from '../lib/scale';
  import type { Group, Item } from '../lib/types';
  import { norm } from '../lib/text';

  let { label, placeholder, items, groups = null, selected, ontoggle, onclear, onsetgroup }: {
    label: string;
    placeholder: string;
    items: Item[];
    groups?: Group[] | null;
    selected: Set<number>;
    ontoggle: (id: number) => void;
    onclear: () => void;
    onsetgroup?: (ids: number[], on: boolean) => void;
  } = $props();

  let open = $state(false);
  let query = $state('');
  let root: HTMLDivElement;
  let input: HTMLInputElement | undefined = $state();
  const uid = $props.id();

  const byId = $derived(new Map(items.map((i) => [i.id, i])));
  const filtered = $derived.by(() => {
    const q = norm(query.trim());
    const list = q ? items.filter((i) => norm(i.label).includes(q) || norm(i.alt).includes(q)) : items;
    return list;
  });

  const summary = $derived.by(() => {
    if (selected.size === 0) return placeholder;
    const names = [...selected].map((id) => byId.get(id)?.label).filter(Boolean) as string[];
    if (names.length <= 2) return names.join(app.lang === 'ja' ? '、' : ', ');
    return `${names.slice(0, 1).join('')} +${names.length - 1}`;
  });

  function toggleOpen() {
    open = !open;
    if (open) queueMicrotask(() => input?.focus());
  }

  function onwindowpointer(e: PointerEvent) {
    if (open && root && !root.contains(e.target as Node)) open = false;
  }
  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) {
      open = false;
      root.querySelector<HTMLButtonElement>('.trigger')?.focus();
      e.stopPropagation();
    }
  }
</script>

<svelte:window onpointerdown={onwindowpointer} />

<div class="ms" bind:this={root} {onkeydown} role="presentation">
  <span class="lbl" id="{uid}-l">{label}</span>
  <button
    type="button"
    class="trigger"
    class:active={selected.size > 0}
    aria-haspopup="dialog"
    aria-expanded={open}
    aria-labelledby="{uid}-l {uid}-v"
    onclick={toggleOpen}
  >
    <span id="{uid}-v" class="val">{summary}</span>
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.5" /></svg>
  </button>

  {#if open}
    <div class="pop" role="dialog" aria-label={label}>
      <div class="head">
        <input
          bind:this={input}
          bind:value={query}
          type="search"
          placeholder={t(app.lang, 'search')}
          aria-label={t(app.lang, 'search') + ' – ' + label}
        />
        {#if selected.size}
          <button type="button" class="linkish" onclick={onclear}>{t(app.lang, 'clear')} ({selected.size})</button>
        {/if}
      </div>
      <div class="list">
        {#if groups && !query}
          {#each groups as g (g.id)}
            {@const gi = g.ids.map((id) => byId.get(id)).filter((x): x is Item => !!x)}
            {@const allOn = gi.length > 0 && gi.every((i) => selected.has(i.id))}
            <fieldset>
              <legend>
                <label class="grp">
                  <input type="checkbox" checked={allOn}
                    indeterminate={!allOn && gi.some((i) => selected.has(i.id))}
                    onchange={() => onsetgroup?.(g.ids, !allOn)} />
                  <span>{g.label}</span>
                </label>
              </legend>
              {#each gi as i (i.id)}
                {@render row(i)}
              {/each}
            </fieldset>
          {/each}
        {:else}
          {#each filtered as i (i.id)}
            {@render row(i)}
          {:else}
            <p class="empty">–</p>
          {/each}
        {/if}
      </div>
    </div>
  {/if}
</div>

{#snippet row(i: Item)}
  <label class="opt" class:zero={i.value === 0}>
    <input type="checkbox" checked={selected.has(i.id)} onchange={() => ontoggle(i.id)} />
    <span class="name">{i.label}<span class="alt">{i.alt}</span></span>
    <span class="num tnum">{i.value ? fmtCompact(app.lang, i.value) : '–'}</span>
  </label>
{/snippet}

<style>
  .ms { position: relative; display: grid; gap: 4px; min-width: 0; }
  .lbl { font-size: 12px; color: var(--muted); font-weight: 500; }
  .trigger {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    min-height: 38px; padding: 0 10px 0 12px; width: 100%;
    border: 1px solid var(--line-strong); border-radius: 8px;
    background: var(--surface); text-align: left; font-size: 14px;
  }
  .trigger:hover { border-color: var(--ink-2); }
  .trigger.active { border-color: var(--ink); box-shadow: inset 0 0 0 1px var(--ink); font-weight: 600; }
  .val { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pop {
    position: absolute; z-index: 40; top: calc(100% + 6px); left: 0;
    width: min(360px, calc(100vw - 32px));
    background: var(--surface); border: 1px solid var(--line-strong);
    border-radius: var(--radius); box-shadow: var(--shadow);
    display: flex; flex-direction: column; max-height: min(460px, 70vh);
  }
  .head { display: flex; gap: 10px; align-items: center; padding: 10px; border-bottom: 1px solid var(--line); }
  .head input {
    flex: 1; min-width: 0; min-height: 36px; padding: 0 10px;
    border: 1px solid var(--line-strong); border-radius: 7px; background: var(--bg);
  }
  .list { overflow: auto; padding: 4px 0 8px; overscroll-behavior: contain; }
  fieldset { border: 0; margin: 0; padding: 4px 0; }
  fieldset + fieldset { border-top: 1px solid var(--line); }
  legend { padding: 6px 12px 2px; font-size: 12px; font-weight: 600; color: var(--muted); }
  .grp { display: flex; gap: 8px; align-items: center; cursor: pointer; }
  .opt {
    display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center;
    padding: 6px 12px; min-height: 36px; cursor: pointer; font-size: 14px;
  }
  .opt:hover { background: var(--surface-2); }
  .opt.zero { color: var(--muted); }
  .name { display: flex; flex-direction: column; line-height: 1.3; min-width: 0; }
  .alt { font-size: 11.5px; color: var(--muted); }
  .num { font-size: 12.5px; color: var(--ink-2); }
  input[type='checkbox'] { width: 16px; height: 16px; accent-color: var(--accent); margin: 0; }
  .empty { padding: 12px; margin: 0; color: var(--muted); }
  @media (max-width: 720px) {
    .pop { position: fixed; left: 16px; right: 16px; top: auto; bottom: 16px; width: auto; max-height: 70vh; }
  }
</style>
