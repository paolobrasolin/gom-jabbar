import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/svelte'
import { resetDb } from '../lib/db'
import { prefs } from '../lib/prefs.svelte'
import { addPreset, logPreset } from '../lib/presets'
import App from '../App.svelte'

beforeEach(() => {
  resetDb()
  prefs.lang = 'it'
})

describe('Trends presets', () => {
  it('draws one line per preset with samples in range', async () => {
    const p = await addPreset({ name: 'Schiena', areas: [{ regions: ['lowerback'], intensity: 5 }], symptomIds: ['pain'], tags: [], ongoing: false })
    await logPreset(p, { pain: 4 })
    await logPreset(p, { pain: 6 })
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Andamento' }))
    const card = (await screen.findByText('Per preset')).closest('.card')!
    expect(card).toHaveTextContent('Schiena')
    expect(card.querySelectorAll('circle')).toHaveLength(2)
  })
})
