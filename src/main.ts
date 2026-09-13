import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

import { db } from './lib/db'
import { t } from './i18n/index.svelte'

const target = document.getElementById('app')!
const app = mount(App, { target })

// Surface a storage failure (private windows on old Safari, disabled IndexedDB) instead of a blank, silent app.
db.open().catch((err) => {
  console.error(err)
  const p = document.createElement('p')
  p.textContent = t('app.dbError')
  p.style.cssText = 'position:fixed;inset:auto 12px 80px;padding:12px 16px;border-radius:12px;background:#d33f3f;color:#fff;z-index:99'
  document.body.appendChild(p)
})

// Ask the browser not to evict our storage. Best effort.
navigator.storage?.persist?.().catch(() => {})

export default app
