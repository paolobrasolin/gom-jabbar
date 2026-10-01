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
  import { reads } from './lib/live.svelte'
  import { googleDrive } from './lib/drive'
  import type { CloudProvider, Resumed } from './lib/cloud'

  /** `resumed`: the tap that left for Google's consent screen, back at startup (main.ts); it is finished in Settings. */
  /** `reload`: what Cancella tutto ends with; tests pass a stub, jsdom cannot reload. */
  let { cloud = googleDrive, resumed = null, reload = () => location.reload() }: { cloud?: CloudProvider; resumed?: Resumed; reload?: () => void } = $props()

  // Read once: the tap comes back only at startup.
  let resume = $state.raw(untrack(() => resumed))
  let tab = $state<Tab>('log')
  /** The Diary's search (§6.2): null while closed. It sits one history entry above the Diary, so back closes it first. */
  let query = $state<string | null>(null)
  let field = $state<HTMLInputElement>()

  /** Log is home (#37): every other screen sits one history entry above it, so the arrow and Android's back gesture both return. */
  function go(to: Tab) {
    history.pushState({ screen: to }, '')
    tab = to
    query = null
    dismissToast()
  }
  function onPop(e: PopStateEvent) {
    const state = e.state as { screen?: Tab; search?: boolean } | null
    const to = state?.screen ?? 'log'
    // A sheet's step is not a screen change: the toast its Salva just showed stays.
    if (to !== tab) dismissToast()
    tab = to
    query = state?.search ? (query ?? '') : null
  }
  function openSearch() {
    history.pushState({ screen: 'diary', search: true }, '')
    query = ''
  }
  $effect(() => {
    if (query === '') field?.focus()
  })
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
  {#if reads.failed}
    <div class="unread" role="alert">
      <span>{t('app.readError')}</span>
      <button class="btn small" onclick={reload}>{t('app.reload')}</button>
    </div>
  {/if}
  {#if tab !== 'log'}
    <header class="bar">
      <button class="back" aria-label={t('nav.back')} onclick={() => history.back()}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
      </button>
      {#if tab === 'diary' && query !== null}
        <input class="search" type="search" enterkeyhint="search" autocomplete="off" placeholder={t('diary.search')} aria-label={t('diary.search')} bind:value={query} bind:this={field} onkeydown={(e) => e.key === 'Enter' && field?.blur()} />
        <!-- Hidden rather than gone while the field is empty, so the field keeps its width. -->
        <button class="icon" style:visibility={query ? 'visible' : 'hidden'} aria-label={t('diary.clear')} onclick={() => ((query = ''), field?.focus())}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      {:else}
        <h1>{t(`tab.${tab}`)}</h1>
        {#if tab === 'diary'}
          <button class="icon" aria-label={t('diary.find')} onclick={openSearch}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></svg>
          </button>
        {/if}
      {/if}
    </header>
  {/if}
  {#if tab === 'log'}<Log {cloud} navigate={go} />{:else if tab === 'diary'}<Diary query={query ?? ''} />{:else if tab === 'trends'}<Trends />{:else}<Settings {cloud} {resume} onresumed={() => (resume = null)} {reload} />{/if}
</div>

<Toast />

<style>
  /* A failed read (§4.1): first in the column, above the header, until a reload; the arrow and the menu stay reachable. */
  .unread {
    flex: none;
    margin: calc(8px + env(safe-area-inset-top)) 12px 4px;
    display: flex; align-items: center; gap: 12px;
    padding: 10px 10px 10px 16px; border-radius: var(--radius);
    background: #d33f3f; color: #fff;
  }
  .unread span { flex: 1; }
  .unread .btn { background: #fff; color: #b3261e; font-weight: 600; }
</style>
