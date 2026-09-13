import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte'
import { resetDb } from '../lib/db'
import { prefs } from '../lib/prefs.svelte'
import App from '../App.svelte'

let db: ReturnType<typeof resetDb>
beforeEach(() => {
  db = resetDb()
  prefs.lang = 'it'
  prefs.mirror = true
})

describe('Log fast path', () => {
  it('tap region, set intensity, save', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'thigh.r' }))
    const slider = screen.getByRole('slider', { name: 'Dolore' })
    await fireEvent.input(slider, { target: { value: '7' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    const [e] = await db.entries.toArray()
    expect(e.areas).toEqual([{ regions: ['thigh.l', 'thigh.r'], intensity: 7 }])
    expect(e.readings.pain).toBe(7)
    expect(e.ongoing).toBe(false)
    expect(await screen.findByText('Salvato')).toBeInTheDocument()
  })

  it('supports two areas with different levels', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Gambe' }))
    await fireEvent.input(screen.getByRole('slider', { name: 'Dolore' }), { target: { value: '8' } })
    await fireEvent.click(screen.getByRole('button', { name: '+ Altra zona' }))
    await fireEvent.click(screen.getByRole('button', { name: 'shoulder.l' }))
    await fireEvent.input(screen.getByRole('slider', { name: 'Dolore' }), { target: { value: '3' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    const [e] = await db.entries.toArray()
    expect(e.areas).toHaveLength(2)
    expect(e.areas[0].intensity).toBe(8)
    expect(e.areas[1]).toEqual({ regions: ['shoulder.l', 'shoulder.r'], intensity: 3 })
    expect(e.readings.pain).toBe(8)
  })

  it('undo removes the saved entry', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    await fireEvent.click(await screen.findByRole('button', { name: 'Annulla' }))
    await waitFor(async () => expect(await db.entries.count()).toBe(0))
  })

  it('ongoing entry shows as active episode and can be ended', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Tutto il corpo' }))
    await fireEvent.click(screen.getByLabelText('In corso'))
    await fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
    const endBtn = await screen.findByRole('button', { name: 'Termina adesso' })
    expect(screen.getByText('tutto il corpo')).toBeInTheDocument()
    await fireEvent.click(endBtn)
    await waitFor(async () => {
      const [e] = await db.entries.toArray()
      expect(e.ongoing).toBe(false)
      expect(e.endedAt).not.toBeNull()
    })
  })
})
