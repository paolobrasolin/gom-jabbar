<script lang="ts">
  import Dropdown from './Dropdown.svelte'
  import { t } from '../i18n/index.svelte'
  import type { Tab } from '../lib/prefs.svelte'

  /** Log is home (#37): the other screens are a dropdown away, from a button that takes no row of its own. */
  let { onpick }: { onpick: (to: Exclude<Tab, 'log'>) => void } = $props()

  const screens: { id: Exclude<Tab, 'log'>; icon: string }[] = [
    { id: 'diary', icon: 'M4 5h16v14H4zM8 3v4M16 3v4M4 10h16' },
    { id: 'trends', icon: 'M4 18l5-6 4 3 7-8' },
    { id: 'settings', icon: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM3 12h2M19 12h2M12 3v2M12 19v2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4' },
  ]
</script>

<Dropdown label={t('nav.menu')} cls="outline menu-btn">
  {#snippet trigger()}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
  {/snippet}
  {#snippet items(close)}
    {#each screens as it (it.id)}
      <button role="menuitem" class="nav" onclick={() => {
          close()
          onpick(it.id)
        }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={it.icon} /></svg>
        {t(`tab.${it.id}`)}
      </button>
    {/each}
  {/snippet}
</Dropdown>

<style>
  :global(.menu-btn) { width: 40px; padding: 0 !important; justify-content: center; }
  :global(.menu-btn) svg { width: 20px; height: 20px; }
  :global(.menu-btn[aria-expanded='true']) { background: var(--surface-2); }
  .nav { font-weight: 600; }
</style>
