<script lang="ts">
  import { untrack } from 'svelte'
  import Log from './screens/Log.svelte'
  import Diary from './screens/Diary.svelte'
  import Trends from './screens/Trends.svelte'
  import Settings from './screens/Settings.svelte'
  import Toast from './components/Toast.svelte'
  import { t } from './i18n/index.svelte'
  import { prefs, type Tab } from './lib/prefs.svelte'
  import { dismissToast } from './lib/toast.svelte'
  import { googleDrive } from './lib/drive'
  import type { CloudProvider, Resumed } from './lib/cloud'

  /** `resumed`: the tap that left for Google's consent screen, back at startup (main.ts); it is finished in Settings. */
  /** `reload`: what Cancella tutto ends with; tests pass a stub, jsdom cannot reload. */
  let { cloud = googleDrive, resumed = null, reload = () => location.reload() }: { cloud?: CloudProvider; resumed?: Resumed; reload?: () => void } = $props()

  // Read once: the tap comes back only at startup.
  let resume = $state.raw(untrack(() => resumed))
  let tab = $state<Tab>('log')

  /** Log is home (#37): every other screen sits one history entry above it, so the arrow and Android's back gesture both return. */
  function go(to: Tab) {
    history.pushState({ screen: to }, '')
    tab = to
    dismissToast()
  }
  function onPop(e: PopStateEvent) {
    tab = (e.state as { screen?: Tab } | null)?.screen ?? 'log'
    dismissToast()
  }
  // The app always starts on the log: a reload on another screen must not leave that screen's state under it.
  history.replaceState(null, '')
  // Back from Google's consent screen: land on Settings, with the log under it rather than Google.
  if (untrack(() => resumed)) go('settings')

  $effect(() => {
    const root = document.documentElement
    if (prefs.theme === 'system') delete root.dataset.theme
    else root.dataset.theme = prefs.theme
    root.lang = prefs.lang
    const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
    const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && !!mq?.matches)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#111114' : '#f4f3ef')
  })
  // Re-run when the system theme flips while in "system" mode.
  $effect(() => {
    if (typeof matchMedia !== 'function') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const h = () => {
      if (prefs.theme === 'system') document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mq.matches ? '#111114' : '#f4f3ef')
    }
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  })
</script>

<svelte:window onpopstate={onPop} />

<div class="app">
  {#if tab !== 'log'}
    <header class="bar">
      <button class="back" aria-label={t('nav.back')} onclick={() => history.back()}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
      </button>
      <h1>{t(`tab.${tab}`)}</h1>
    </header>
  {/if}
  {#if tab === 'log'}<Log {cloud} navigate={go} />{:else if tab === 'diary'}<Diary />{:else if tab === 'trends'}<Trends />{:else}<Settings {cloud} {resume} onresumed={() => (resume = null)} {reload} />{/if}
</div>

<Toast />
