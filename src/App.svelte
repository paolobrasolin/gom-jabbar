<script lang="ts">
  import Log from './screens/Log.svelte'
  import Diary from './screens/Diary.svelte'
  import Trends from './screens/Trends.svelte'
  import Settings from './screens/Settings.svelte'
  import Toast from './components/Toast.svelte'
  import { t } from './i18n/index.svelte'
  import { prefs, type Tab } from './lib/prefs.svelte'
  import { dismissToast } from './lib/toast.svelte'

  let tab = $state<Tab>('log')

  $effect(() => {
    const root = document.documentElement
    if (prefs.theme === 'system') delete root.dataset.theme
    else root.dataset.theme = prefs.theme
    root.lang = prefs.lang
  })

  const tabs: { id: Tab; icon: string }[] = [
    { id: 'log', icon: 'M12 5v14M5 12h14' },
    { id: 'diary', icon: 'M4 5h16v14H4zM8 3v4M16 3v4M4 10h16' },
    { id: 'trends', icon: 'M4 18l5-6 4 3 7-8' },
    { id: 'settings', icon: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM3 12h2M19 12h2M12 3v2M12 19v2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4' },
  ]
</script>

<div class="app">
  {#if tab === 'log'}<Log />{:else if tab === 'diary'}<Diary />{:else if tab === 'trends'}<Trends />{:else}<Settings />{/if}

  <nav class="tabs" aria-label="tabs">
    {#each tabs as it (it.id)}
      <button class="tab" aria-current={tab === it.id ? 'page' : undefined} onclick={() => {
          tab = it.id
          dismissToast()
        }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={it.icon} /></svg>
        <span>{t(`tab.${it.id}`)}</span>
      </button>
    {/each}
  </nav>
</div>

<Toast raised={tab === "log"} />
