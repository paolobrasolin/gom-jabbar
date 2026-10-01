import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

import { db } from './lib/db'
import { t } from './i18n/index.svelte'
import { initInstall } from './lib/install.svelte'
import { googleDrive } from './lib/drive'
import { showStartupError } from './lib/startupError'
import { keepUpdated } from './lib/update'
import { registerSW } from 'virtual:pwa-register'

// Back from Google's consent screen: take the token out of the URL before anything renders or gets shared.
const resumed = googleDrive.resume()

const target = document.getElementById('app')!
const app = mount(App, { target, props: { resumed } })

// Surface a storage failure (private windows on old Safari, disabled IndexedDB) instead of a blank, silent app.
db.open().catch((err) => {
  console.error(err)
  showStartupError(t('app.dbError'))
})

// Install prompt capture, first-standalone-launch bookkeeping and the persistent storage request.
initInstall()

// A new release runs as soon as it is installed, at open or back in the foreground (§4).
keepUpdated(registerSW)

export default app
