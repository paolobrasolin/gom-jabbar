import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte'
import { resetDb } from '../lib/db'
import { prefs } from '../lib/prefs.svelte'
import { go, pickPreset, salva, findToast } from '../test/nav'
import App from '../App.svelte'
import { REGION_BY_ID, shapeOf, shapeCenter, viewBox } from '../lib/regions'
import { addEntry } from '../lib/entries'
import { regionLabel } from '../lib/regionLabel'
import { t } from '../i18n/index.svelte'
import { type Stroke } from '../lib/layers'
import { resetLog, more, strokes } from '../test/log'

let db: ReturnType<typeof resetDb>
beforeEach(() => {
  db = resetLog()
})

describe('Log layer chips', () => {
  it("a new layer's chip scrolls into sight, off to the right of a full row (#115)", async () => {
    // jsdom has no layout: the row is 200px wide and the pressed chip sits at 500–600 in it, off to the right, moving as it scrolls.
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const row = this.closest<HTMLElement>('.areas')
      const [left, right] = this.classList.contains('areas') ? [0, 200] : row && this.getAttribute('aria-pressed') === 'true' ? [500 - row.scrollLeft, 600 - row.scrollLeft] : [0, 0]
      return { left, right, top: 0, bottom: 0, x: left, y: 0, width: right - left, height: 0, toJSON: () => ({}) } as DOMRect
    })
    try {
      render(App)
      await screen.findByRole('slider', { name: 'Dolore' })
      await fireEvent.click(screen.getByRole('button', { name: 'Coscia dx' }))
      await fireEvent.click(screen.getByRole('button', { name: 'Altra zona' }))
      const row = document.querySelector<HTMLElement>('.areas')!
      await waitFor(() => expect(row.scrollLeft).toBe(412))
    } finally {
      rect.mockRestore()
    }
  }, 10_000)
})

describe('Stage rails', () => {
  it('fade where they hide buttons, in the preset form where they scroll (#115)', async () => {
    render(App)
    await screen.findByRole('slider', { name: 'Dolore' })
    await pickPreset('Nuovo preset')
    const form = await screen.findByRole('dialog', { name: 'Nuovo preset' })
    // jsdom has no layout, so nothing overflows: the marks are there, empty, for the fade to follow.
    const rails = form.querySelectorAll('.rail')
    expect(rails).toHaveLength(2)
    for (const r of rails) {
      expect(r).toHaveClass('fade-y')
      expect(r).toHaveAttribute('data-more', '')
    }
  })
})

describe('Log layer without a place', () => {
  it("refuses Salva while a layer holds a level but no place, and shows that layer's figure (#115)", async () => {
    render(App)
    await screen.findByRole('slider', { name: 'Dolore' })
    await fireEvent.click(screen.getByRole('button', { name: 'Coscia dx' }))
    await fireEvent.input(screen.getByRole('slider', { name: /^Dolore/ }), { target: { value: '5' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Altra zona' }))
    await fireEvent.input(screen.getByRole('slider', { name: /^Dolore/ }), { target: { value: '7' } })
    await salva()
    expect(await findToast()).toHaveTextContent('Dove? Tocca la figura')
    expect(await db.entries.count()).toBe(0)
    // The layer with no place stays current with its level, and a tap gives it a place. (Switching away drops it,
    // the way a layer is deleted, §5.4.)
    expect(document.querySelectorAll<HTMLElement>('.areas .chip')[1]).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.click(screen.getByRole('button', { name: 'Coscia sx' }))
    await salva()
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    const [e] = await db.entries.toArray()
    // Both layers kept, each with its place and its level.
    expect(e.layers.map((l) => l.readings)).toEqual([{ pain: 5 }, { pain: 7 }])
    expect(e.layers.every((l) => l.regions.length > 0)).toBe(true)
  })
})

describe('Deleting a layer (#115)', () => {
  it('a bin before +, while there are two layers or more, drawer open or not, removes the current one, and undo brings it back', async () => {
    render(App)
    await screen.findByRole('slider', { name: 'Dolore' })
    // One layer: nothing to delete.
    await fireEvent.click(screen.getByRole('button', { name: 'Coscia dx' }))
    expect(screen.queryByRole('button', { name: 'Elimina zona' })).not.toBeInTheDocument()
    await fireEvent.input(screen.getByRole('slider', { name: /^Dolore/ }), { target: { value: '5' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Altra zona' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Ginocchio sx' }))
    await fireEvent.input(screen.getByRole('slider', { name: /^Dolore/ }), { target: { value: '7' } })
    // In the row of tabs, beside +, with the figure in sight: no need to open the drawer.
    const bin = screen.getByRole('button', { name: 'Elimina zona' })
    expect(bin.closest('.spine')).not.toBeNull()
    expect(bin.nextElementSibling).toHaveAccessibleName('Altra zona')
    await fireEvent.click(bin)
    expect(document.querySelectorAll('.areas .chip')).toHaveLength(1)
    expect(screen.getByRole('slider', { name: /^Dolore/ })).toHaveValue('5')
    const toast = await findToast()
    expect(toast).toHaveTextContent('Zona eliminata')
    await fireEvent.click(within(toast).getByRole('button', { name: 'Annulla' }))
    await waitFor(() => expect(document.querySelectorAll('.areas .chip')).toHaveLength(2))
    expect(screen.getByRole('slider', { name: /^Dolore/ })).toHaveValue('7')
  })

  it('switching away keeps a layer with a level but no place, and Salva then points at it', async () => {
    render(App)
    await screen.findByRole('slider', { name: 'Dolore' })
    await fireEvent.click(screen.getByRole('button', { name: 'Coscia dx' }))
    await fireEvent.input(screen.getByRole('slider', { name: /^Dolore/ }), { target: { value: '5' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Altra zona' }))
    await fireEvent.input(screen.getByRole('slider', { name: /^Dolore/ }), { target: { value: '7' } })
    await fireEvent.click(document.querySelectorAll<HTMLElement>('.areas .chip')[0])
    expect(document.querySelectorAll('.areas .chip')).toHaveLength(2)
    await salva()
    expect(await findToast()).toHaveTextContent('Dove? Tocca la figura')
    expect(document.querySelectorAll<HTMLElement>('.areas .chip')[1]).toHaveAttribute('aria-pressed', 'true')
    expect(await db.entries.count()).toBe(0)
  })
})

describe('The stage', () => {
  /** Client coordinates of a figure point on the stage (jsdom rects sit at 0,0). */
  function at(svg: Element, x: number, y: number) {
    const k = Number(svg.getAttribute('data-k'))
    return { clientX: Number(svg.getAttribute('data-tx')) + k * x, clientY: Number(svg.getAttribute('data-ty')) + k * y }
  }
  const centre = (id: string) => shapeCenter(shapeOf(prefs.figure, REGION_BY_ID[id]))
  const finger = (id: number, xy: { clientX: number; clientY: number }) => ({ ...xy, pointerId: id, button: 0, buttons: 1, isPrimary: id === 1 })
  async function drag(svg: Element, from: { clientX: number; clientY: number }, to: { clientX: number; clientY: number }) {
    await fireEvent.pointerDown(svg, finger(1, from))
    await fireEvent.pointerMove(svg, finger(1, to))
    await fireEvent.pointerUp(svg, finger(1, to))
  }
  async function paint(svg: Element, from: [number, number], to: [number, number]) {
    await fireEvent.pointerDown(svg, finger(1, at(svg, ...from)))
    const mid: [number, number] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + 0.3]
    await fireEvent.pointerMove(svg, finger(1, at(svg, ...mid)))
    await fireEvent.pointerMove(svg, finger(1, at(svg, ...to)))
    await fireEvent.pointerUp(svg, finger(1, at(svg, ...to)))
  }
  const buttock = () => regionLabel('227', t)

  it('one figure fills the stage, fitted whole; a sideways swipe or the chips turn it, a short or steep drag does not', async () => {
    render(App)
    const front = screen.getByRole('group', { name: 'Davanti' })
    expect(screen.queryByRole('group', { name: 'Dietro' })).not.toBeInTheDocument()
    // Fitted: the view's own content box, clear of the rails, its middle in the middle of the stage (300×320 under jsdom).
    const vb = viewBox(prefs.figure, 'front')
    const k = Number(front.getAttribute('data-k'))
    expect(k).toBeCloseTo(Math.min((300 - 152) / vb.w, (320 - 16) / vb.h), 5)
    expect(Number(front.getAttribute('data-ty')) + k * (vb.y + vb.h / 2)).toBeCloseTo(160, 5)
    expect(Number(front.getAttribute('data-tx')) + k * (vb.x + vb.w / 2)).toBeCloseTo(150, 5)
    // The front's segments are there to tap, the back's are not; the mind is in the corner of either view; the other side is a thumbnail.
    expect(screen.getByRole('button', { name: 'Coscia dx' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: buttock() })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mente' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dietro' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Davanti' })).not.toBeInTheDocument()
    // The rails hold the helpers; the zoom is there in either mode, Adatta and Riduci idle until zoomed, and a new draft fits again.
    expect(screen.getByRole('button', { name: 'Entrambi i lati' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Adatta' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Riduci' })).toBeDisabled()
    await fireEvent.click(screen.getByRole('button', { name: 'Ingrandisci' }))
    expect(Number(front.getAttribute('data-k'))).toBeCloseTo(k * 1.5, 5)
    expect(screen.getByRole('button', { name: 'Adatta' })).toBeEnabled()
    await salva()
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    expect(Number(screen.getByRole('group', { name: 'Davanti' }).getAttribute('data-k'))).toBeCloseTo(k, 5)
    // A swipe across the skin turns it; the click a mouse fires afterwards, on whatever segment is now under it, is swallowed.
    const thigh = screen.getByRole('button', { name: 'Coscia dx' })
    await fireEvent.pointerDown(thigh, finger(1, { clientX: 200, clientY: 150 }))
    await fireEvent.pointerMove(thigh, finger(1, { clientX: 100, clientY: 160 }))
    await fireEvent.pointerUp(thigh, finger(1, { clientX: 100, clientY: 160 }))
    const back = screen.getByRole('group', { name: 'Dietro' })
    expect(screen.queryByRole('group', { name: 'Davanti' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Davanti' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mente' })).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: buttock() }))
    expect(screen.getByRole('button', { name: buttock() })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Nessuna zona: tocca la figura')).toBeInTheDocument()
    // The next click lands.
    await fireEvent.click(screen.getByRole('button', { name: buttock() }))
    expect(screen.getByRole('button', { name: buttock() })).toHaveAttribute('aria-pressed', 'true')
    // Too short, or too steep: a tap, nothing turns; the next click on a segment lands.
    await drag(back, { clientX: 100, clientY: 100 }, { clientX: 130, clientY: 100 })
    await drag(back, { clientX: 100, clientY: 100 }, { clientX: 200, clientY: 200 })
    expect(screen.getByRole('group', { name: 'Dietro' })).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: buttock() }))
    expect(screen.getByRole('button', { name: buttock() })).toHaveAttribute('aria-pressed', 'false')
    // The back is fitted on its own box, which sits off the front's.
    const bb = viewBox(prefs.figure, 'back')
    const kb = Number(back.getAttribute('data-k'))
    expect(kb).toBeCloseTo(Math.min((300 - 152) / bb.w, (320 - 16) / bb.h), 5)
    expect(Number(back.getAttribute('data-tx')) + kb * (bb.x + bb.w / 2)).toBeCloseTo(150, 5)
    // Back the other way: the thumbnail.
    await fireEvent.click(screen.getByRole('button', { name: 'Davanti' }))
    expect(screen.getByRole('group', { name: 'Davanti' })).toBeInTheDocument()
    await drag(screen.getByRole('group', { name: 'Davanti' }), { clientX: 100, clientY: 100 }, { clientX: 250, clientY: 110 })
    expect(screen.getByRole('group', { name: 'Dietro' })).toBeInTheDocument()
  })

  it('a tap just off the skin lands on the nearest segment; one far out does nothing', async () => {
    render(App)
    const front = screen.getByRole('group', { name: 'Davanti' })
    const hand = shapeOf(prefs.figure, REGION_BY_ID['145'])
    const [lx, ly] = hand.points.reduce((a, p) => (p[0] < a[0] ? p : a))
    const tap = async (x: number, y: number) => {
      const p = at(front, x, y)
      await fireEvent.pointerDown(front, finger(1, p))
      await fireEvent.pointerUp(front, finger(1, p))
      await fireEvent.click(front, p)
    }
    await tap(lx - 3, ly)
    // Mirror is on: both hands.
    expect(screen.getByRole('button', { name: regionLabel('145', t) })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: regionLabel('144', t) })).toHaveAttribute('aria-pressed', 'true')
    await tap(lx - 40, ly)
    expect(screen.getByRole('button', { name: regionLabel('145', t) })).toHaveAttribute('aria-pressed', 'true')
  })

  it('Davanti e dietro takes the other view along on a tap, not the trunk, and the thumbnail shows it', async () => {
    render(App)
    expect(screen.getByRole('button', { name: 'Davanti e dietro' })).toHaveAttribute('aria-pressed', 'false')
    await fireEvent.click(screen.getByRole('button', { name: 'Davanti e dietro' }))
    expect(prefs.mirrorViews).toBe(true)
    await fireEvent.click(screen.getByRole('button', { name: 'Coscia dx' }))
    await fireEvent.click(screen.getByRole('button', { name: regionLabel('110', t) }))
    await fireEvent.click(screen.getByRole('button', { name: 'Dietro' }))
    expect(screen.getByRole('button', { name: regionLabel('252', t) })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: regionLabel('253', t) })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: regionLabel('220', t) })).toHaveAttribute('aria-pressed', 'false')
    // Off again: a tap behind stays behind.
    await fireEvent.click(screen.getByRole('button', { name: 'Davanti e dietro' }))
    await fireEvent.click(screen.getByRole('button', { name: regionLabel('252', t) }))
    expect(screen.getByRole('button', { name: regionLabel('252', t) })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: regionLabel('253', t) })).toHaveAttribute('aria-pressed', 'false')
    await fireEvent.click(screen.getByRole('button', { name: 'Davanti' }))
    // Mirror is on: both thighs in front stay, untouched by the tap behind.
    expect(screen.getByRole('button', { name: 'Coscia dx' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Coscia sx' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('the kind is one switch with two halves, on its own row above a time row that keeps its caption', async () => {
    render(App)
    await more()
    const sw = screen.getByRole('group', { name: 'Tipo' })
    expect(within(sw).getByRole('button', { name: 'Cronico' })).toHaveAttribute('aria-pressed', 'true')
    const when = screen.getByRole('group', { name: 'Quando' })
    expect(when).toHaveTextContent(/^Quando/)
    expect(within(when).queryByRole('button', { name: 'Cronico' })).not.toBeInTheDocument()
    await fireEvent.click(within(sw).getByRole('button', { name: 'Episodio' }))
    expect(screen.getByRole('group', { name: 'Inizio' })).toHaveTextContent(/^Inizio/)
    expect(screen.getByRole('group', { name: 'Fine' })).toHaveTextContent(/^Fine/)
    expect(screen.queryByRole('group', { name: 'Quando' })).not.toBeInTheDocument()
  })

  it('the rail has head and torso, and one button per limb side when 2 lati is off', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Testa' }))
    expect(screen.getByRole('button', { name: 'Testa' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: regionLabel('100', t) })).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.click(screen.getByRole('button', { name: 'Testa' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Tronco' }))
    expect(screen.getByRole('button', { name: regionLabel('110', t) })).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.click(screen.getByRole('button', { name: 'Tronco' }))
    expect(screen.queryByRole('button', { name: 'Gamba sx' })).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Entrambi i lati' }))
    expect(screen.queryByRole('button', { name: 'Gambe' })).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Gamba sx' }))
    expect(screen.getByRole('button', { name: 'Gamba sx' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Gamba dx' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Coscia sx' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Coscia dx' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText(/gamba sx/)).toBeInTheDocument()
    prefs.mirror = true
  })

  it('the handle says the time once one is set, or the end, or a picked moment', async () => {
    render(App)
    await more()
    await fireEvent.click(screen.getByRole('button', { name: '1h fa' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Corpo' }))
    expect(screen.getByRole('button', { name: 'Altro · 1h fa' })).toBeInTheDocument()
    // The handle shows only its chevron (#115): the time is written on Salva, the button that records it.
    expect(screen.getByRole('button', { name: 'Altro · 1h fa' })).toHaveTextContent(/^\s*$/)
    expect(screen.getByRole('button', { name: 'Salva' })).toHaveTextContent('Salva · 1h fa')
    await more()
    await fireEvent.click(screen.getByRole('button', { name: 'Adesso' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Corpo' }))
    expect(screen.getByRole('button', { name: 'Altro' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salva' })).toHaveTextContent(/^Salva$/)
    await more()
    await fireEvent.click(screen.getByRole('button', { name: 'Episodio' }))
    await fireEvent.click(within(screen.getByRole('group', { name: 'Fine' })).getByRole('button', { name: '3h fa' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Corpo' }))
    expect(screen.getByRole('button', { name: 'Altro · Fine 3h fa' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salva' })).toHaveTextContent('Salva · Fine 3h fa')
    await more()
    await fireEvent.click(within(screen.getByRole('group', { name: 'Inizio' })).getByRole('button', { name: 'Scegli…' }))
    await fireEvent.change(document.querySelector('input[type="datetime-local"]')!, { target: { value: '2026-09-01T12:30' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Corpo' }))
    expect(screen.getByRole('button', { name: /^Altro · .*12:30$/ })).toBeInTheDocument()
  })

  it('the handle slides with a vertical drag, and a tap after a drag does not toggle it back', async () => {
    render(App)
    const handle = () => screen.getByRole('button', { name: /^(Altro|Corpo)/ })
    await fireEvent.pointerDown(handle(), { clientY: 300 })
    await fireEvent.pointerMove(handle(), { clientY: 290 })
    expect(handle()).toHaveAttribute('aria-expanded', 'false')
    await fireEvent.pointerMove(handle(), { clientY: 250 })
    await fireEvent.pointerUp(handle())
    await fireEvent.click(handle())
    expect(handle()).toHaveAttribute('aria-expanded', 'true')
    await fireEvent.pointerDown(handle(), { clientY: 100 })
    await fireEvent.pointerMove(handle(), { clientY: 160 })
    await fireEvent.pointerCancel(handle())
    await fireEvent.click(handle())
    expect(handle()).toHaveAttribute('aria-expanded', 'false')
    // A move without a press does nothing; a plain tap toggles.
    await fireEvent.pointerMove(handle(), { clientY: 0 })
    await fireEvent.click(handle())
    expect(handle()).toHaveAttribute('aria-expanded', 'true')
  })

  it('opens on the view holding most of the entry being edited', async () => {
    await addEntry({ layers: [{ regions: ['226', '227', '152'], readings: { pain: 6 }, tags: [] }] })
    render(App)
    await go('Diario')
    await fireEvent.click(await screen.findByText('glutei, coscia sx'))
    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getByRole('group', { name: 'Dietro' })).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: buttock() })).toHaveAttribute('aria-pressed', 'true')
  })

  it('while painting, a swipe from the air turns the figure and one on the skin paints, however flat', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Disegna' }))
    const front = screen.getByRole('group', { name: 'Davanti' })
    // No segments to tap while painting, and the mind steps aside; the helpers stay.
    expect(screen.queryByRole('button', { name: 'Coscia dx' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mente' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gambe' })).toBeInTheDocument()
    // The brush's tools appear beside it; the zoom stays.
    expect(screen.getByRole('button', { name: 'Annulla tratto' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancella disegno' })).toBeDisabled()
    const k0 = Number(front.getAttribute('data-k'))
    await fireEvent.click(screen.getByRole('button', { name: 'Ingrandisci' }))
    expect(Number(front.getAttribute('data-k'))).toBeCloseTo(k0 * 1.5, 5)
    await fireEvent.click(screen.getByRole('button', { name: 'Riduci' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Riduci' }))
    expect(Number(front.getAttribute('data-k'))).toBeCloseTo(k0, 5)
    await fireEvent.click(screen.getByRole('button', { name: 'Ingrandisci' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Adatta' }))
    expect(Number(front.getAttribute('data-k'))).toBeCloseTo(k0, 5)
    const [, cy] = centre('152')
    await drag(front, at(front, -10, cy), at(front, -10 + 120 / Number(front.getAttribute('data-k')), cy))
    expect(screen.getByRole('group', { name: 'Dietro' })).toBeInTheDocument()
    expect(strokes()).toHaveLength(0)
    const back = screen.getByRole('group', { name: 'Dietro' })
    await paint(back, centre('252'), centre('253'))
    expect(strokes().length).toBeGreaterThanOrEqual(2)
    expect(screen.getByRole('group', { name: 'Dietro' })).toBeInTheDocument()
  })

  it('Disegna: a finger paints a stroke that pulls in the regions it crosses; a tap is a dot; the paint stays when it is off', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Disegna' }))
    const front = screen.getByRole('group', { name: 'Davanti' })
    expect(screen.getByRole('button', { name: 'Annulla tratto' })).toBeDisabled()

    await paint(front, centre('152'), centre('160'))
    // One gesture, three segments: three pieces, each clipped to its own segment.
    expect(strokes()).toHaveLength(3)
    const clip = strokes()[0]!.parentElement!.getAttribute('clip-path')!
    expect(clip).toMatch(/^url\(#.*-152\)$/)
    const clipPath = document.getElementById(clip.slice(5, -1))!
    expect(clipPath.tagName).toBe('clipPath')
    expect(clipPath.querySelector('path')!.getAttribute('d')).toBe(document.querySelector('.region[data-region="152"]')!.getAttribute('d'))
    expect(screen.getByText('coscia sx, ginocchio sx, stinco sx')).toBeInTheDocument()
    // Mirror is on, but a drawing is one-sided.
    expect(screen.queryByText(/cosce|ginocchia|stinchi/)).not.toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: 'Dietro' }))
    const back = screen.getByRole('group', { name: 'Dietro' })
    const [cx, cy] = centre('261')
    await fireEvent.pointerDown(back, finger(1, at(back, cx, cy)))
    await fireEvent.pointerUp(back, finger(1, at(back, cx, cy)))
    expect(strokes()).toHaveLength(1)
    expect(strokes()[0]!.getAttribute('d')).toMatch(/ l 0.01 0$/)
    expect(screen.getByText('coscia sx, ginocchio sx, stinco sx + 1')).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: 'Annulla tratto' }))
    expect(strokes()).toHaveLength(0)
    // The regions the dot pulled in stay.
    expect(screen.getByText('coscia sx, ginocchio sx, stinco sx + 1')).toBeInTheDocument()

    // Paint off: the segments are back to tap, the brush's tools fold away, the mind is back, the paint itself shows.
    await fireEvent.click(screen.getByRole('button', { name: 'Disegna' }))
    expect(screen.queryByRole('button', { name: 'Annulla tratto' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mente' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: buttock() })).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Davanti' }))
    expect(strokes()).toHaveLength(3)

    await salva()
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    const [e] = await db.entries.toArray()
    const r1 = (n: number) => Math.round(n * 10) / 10
    expect(e.layers).toHaveLength(1)
    expect(e.layers[0].regions).toEqual(['152', '154', '160', '261'])
    const pieces = e.layers[0].strokes!
    expect(pieces.map((p) => p.region)).toEqual(['152', '154', '160'])
    expect(pieces[0]).toMatchObject({ fig: 'female', view: 'front', w: 8 })
    expect(pieces[0].points[0]).toEqual(centre('152').map(r1))
    expect(pieces[2].points[pieces[2].points.length - 1]).toEqual(centre('160').map(r1))
    // A new draft opens with the paint off.
    expect(screen.getByRole('button', { name: 'Disegna' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('Annulla tratto takes back a whole gesture, then one piece at a time on a loaded drawing', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Disegna' }))
    const front = screen.getByRole('group', { name: 'Davanti' })
    await paint(front, centre('110'), centre('112'))
    await paint(front, centre('152'), centre('160'))
    expect(strokes()).toHaveLength(5)
    await fireEvent.click(screen.getByRole('button', { name: 'Annulla tratto' }))
    expect(strokes()).toHaveLength(2)
    await fireEvent.click(screen.getByRole('button', { name: 'Annulla tratto' }))
    expect(strokes()).toHaveLength(0)
  })

  it('a touch the system cancels paints nothing', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Disegna' }))
    const front = screen.getByRole('group', { name: 'Davanti' })
    await fireEvent.pointerDown(front, finger(1, at(front, ...centre('152'))))
    await fireEvent.pointerMove(front, finger(1, at(front, ...centre('160'))))
    await fireEvent.pointerCancel(front, finger(1, at(front, ...centre('160'))))
    expect(strokes()).toHaveLength(0)
    expect(screen.getByText('Nessuna zona: tocca la figura')).toBeInTheDocument()
  })

  it("Annulla tratto takes back the current layer's own last gesture, never another layer's", async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Disegna' }))
    const front = screen.getByRole('group', { name: 'Davanti' })
    await paint(front, centre('110'), centre('112'))
    const onA = strokes().length
    await fireEvent.click(screen.getByRole('button', { name: 'Altra zona' }))
    await paint(screen.getByRole('group', { name: 'Davanti' }), centre('152'), centre('160'))
    const onB = strokes().length - onA
    expect(onB).not.toBe(onA)
    // Back on the first layer: its gesture goes, the second layer's paint stays.
    await fireEvent.click(document.querySelectorAll<HTMLElement>('.chip.area')[0])
    await fireEvent.click(screen.getByRole('button', { name: 'Annulla tratto' }))
    expect(strokes()).toHaveLength(onB)
    await fireEvent.click(document.querySelectorAll<HTMLElement>('.chip.area')[1])
    await fireEvent.click(screen.getByRole('button', { name: 'Annulla tratto' }))
    expect(strokes()).toHaveLength(0)
  })

  it('two fingers pan and pinch without painting, from the fitted figure; a turn fits it again', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Spalla sx' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Disegna' }))
    const svg = screen.getByRole('group', { name: 'Davanti' })
    const k = Number(svg.getAttribute('data-k'))
    const ty = Number(svg.getAttribute('data-ty'))
    // A finger down, then a second one: the first stroke is dropped, the pair pans.
    await fireEvent.pointerDown(svg, finger(1, at(svg, ...centre('110'))))
    await fireEvent.pointerMove(svg, finger(1, { clientX: 105, clientY: 100 }))
    await fireEvent.pointerDown(svg, finger(2, { clientX: 140, clientY: 100 }))
    await fireEvent.pointerMove(svg, finger(1, { clientX: 125, clientY: 130 }))
    await fireEvent.pointerMove(svg, finger(2, { clientX: 160, clientY: 130 }))
    expect(Number(svg.getAttribute('data-k'))).toBeCloseTo(k, 5)
    expect(Number(svg.getAttribute('data-ty'))).toBeCloseTo(ty + 30, 5)
    // Spreading the fingers zooms in around them.
    await fireEvent.pointerMove(svg, finger(2, { clientX: 195, clientY: 130 }))
    expect(Number(svg.getAttribute('data-k'))).toBeCloseTo(k * 2, 5)
    await fireEvent.pointerUp(svg, finger(2, { clientX: 195, clientY: 130 }))
    await fireEvent.pointerMove(svg, finger(1, { clientX: 130, clientY: 140 }))
    await fireEvent.pointerUp(svg, finger(1, { clientX: 130, clientY: 140 }))
    expect(strokes()).toHaveLength(0)
    // Every finger up: painting works again.
    await fireEvent.pointerDown(svg, finger(1, at(svg, ...centre('110'))))
    await fireEvent.pointerUp(svg, finger(1, at(svg, ...centre('110'))))
    expect(strokes()).toHaveLength(1)
    // A turn shows the whole other side, fitted on its own box.
    await fireEvent.click(screen.getByRole('button', { name: 'Dietro' }))
    const back = screen.getByRole('group', { name: 'Dietro' })
    const bb = viewBox(prefs.figure, 'back')
    const kb = Number(back.getAttribute('data-k'))
    expect(kb).toBeCloseTo(Math.min((300 - 152) / bb.w, (320 - 16) / bb.h), 5)
    expect(Number(back.getAttribute('data-ty')) + kb * (bb.y + bb.h / 2)).toBeCloseTo(160, 5)
  })

  it('full body takes strokes without touching the regions, and Cancella disegno is undoable', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Tutto il corpo' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Disegna' }))
    const svg = screen.getByRole('group', { name: 'Davanti' })
    await paint(svg, centre('110'), centre('112'))
    await paint(svg, centre('152'), centre('154'))
    expect(strokes()).toHaveLength(4)
    await fireEvent.click(screen.getByRole('button', { name: 'Cancella disegno' }))
    expect(strokes()).toHaveLength(0)
    expect(await screen.findByText('Disegno cancellato')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Annulla' }))
    expect(strokes()).toHaveLength(4)
    await salva()
    await waitFor(async () => expect(await db.entries.count()).toBe(1))
    const [e] = await db.entries.toArray()
    expect(e.layers[0].regions).toEqual(['*'])
    expect(e.layers[0].strokes).toHaveLength(4)
  })

  it('deselecting a painted segment takes its paint along, with undo; the rest of the drawing stays', async () => {
    render(App)
    await fireEvent.click(screen.getByRole('button', { name: 'Disegna' }))
    const svg = screen.getByRole('group', { name: 'Davanti' })
    await paint(svg, centre('152'), centre('160'))
    await fireEvent.click(screen.getByRole('button', { name: 'Disegna' }))
    expect(screen.getByText('coscia sx, ginocchio sx, stinco sx')).toBeInTheDocument()
    const knee = () => screen.getByRole('button', { name: regionLabel('154', t) })
    await fireEvent.click(knee())
    expect(strokes()).toHaveLength(2)
    expect(knee()).toHaveAttribute('aria-pressed', 'false')
    expect(await screen.findByText('Tratti cancellati')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Annulla' }))
    expect(strokes()).toHaveLength(3)
    expect(knee()).toHaveAttribute('aria-pressed', 'true')
    // Deselecting a segment that was only tapped shows no toast: nothing was lost.
    await fireEvent.click(screen.getByRole('button', { name: regionLabel('110', t) }))
    await fireEvent.click(screen.getByRole('button', { name: regionLabel('110', t) }))
    expect(strokes()).toHaveLength(3)
  })

  it('a stroke drawn on the other figure keeps its regions but is not drawn on this one', async () => {
    const stroke: Stroke = { region: '152', fig: 'male', view: 'front', points: [[100, 300]], w: 8 }
    // A piece tagged with a segment this build does not know is skipped, not fatal.
    const alien: Stroke = { region: '999', fig: 'female', view: 'front', points: [[100, 300]], w: 8 }
    await addEntry({ layers: [{ regions: ['152'], readings: { pain: 6 }, strokes: [stroke, alien] }] })
    render(App)
    await go('Diario')
    await fireEvent.click(await screen.findByText('coscia sx'))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(strokes()).toHaveLength(0)
    prefs.figure = 'male'
    await waitFor(() => expect(strokes()).toHaveLength(1))
    prefs.figure = 'female'
  })
})
