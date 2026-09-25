<script lang="ts" generics="T extends string | number">
  interface Option { value: T; label: string; disabled?: boolean; title?: string }
  let { label, options, value, onchange, multi = false, selected = [] as T[] }: {
    label: string;
    options: Option[];
    value?: T;
    onchange: (v: T) => void;
    multi?: boolean;
    selected?: T[];
  } = $props();

  let root: HTMLDivElement;

  // Radio-group keyboard pattern: arrows move between options.
  function onkeydown(e: KeyboardEvent) {
    if (multi || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    const enabled = options.filter((o) => !o.disabled);
    const i = enabled.findIndex((o) => o.value === value);
    const step = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
    const next = enabled[(i + step + enabled.length) % enabled.length];
    onchange(next.value);
    e.preventDefault();
    queueMicrotask(() => root.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus());
  }
</script>

<div
  class="seg"
  role={multi ? 'group' : 'radiogroup'}
  aria-label={label}
  bind:this={root}
  {onkeydown}
>
  {#each options as o (o.value)}
    {@const on = multi ? selected.includes(o.value) : o.value === value}
    <button
      type="button"
      role={multi ? undefined : 'radio'}
      aria-checked={multi ? undefined : on}
      aria-pressed={multi ? on : undefined}
      tabindex={multi || on ? 0 : -1}
      disabled={o.disabled}
      title={o.title}
      onclick={() => onchange(o.value)}
    >{o.label}</button>
  {/each}
</div>

<style>
  .seg {
    display: inline-flex;
    padding: 3px;
    gap: 2px;
    border-radius: 9px;
    background: var(--surface-2);
    border: 1px solid var(--line);
  }
  button {
    border: 0;
    background: transparent;
    min-height: 30px;
    padding: 0 12px;
    border-radius: 6px;
    font-size: 13.5px;
    color: var(--ink-2);
    white-space: nowrap;
  }
  button:hover:not(:disabled) { color: var(--ink); }
  button[aria-checked='true'],
  button[aria-pressed='true'] {
    background: var(--surface);
    color: var(--ink);
    font-weight: 600;
    box-shadow: 0 0 0 1px var(--line-strong);
  }
  button:disabled { opacity: 0.45; cursor: not-allowed; }
  @media (forced-colors: active) {
    button[aria-checked='true'], button[aria-pressed='true'] { outline: 2px solid CanvasText; }
  }
</style>
