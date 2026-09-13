import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

const app = mount(App, { target: document.getElementById('app')! })

// Ask the browser not to evict our storage. Best effort.
navigator.storage?.persist?.().catch(() => {})

export default app
