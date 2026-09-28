import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte'
import { resetDb } from '../lib/db'
import { prefs } from '../lib/prefs.svelte'
import { addPreset } from '../lib/presets'
import { showToast, dismissToast } from '../lib/toast.svelte'
import { go, back, presetButton, episodesButton } from '../test/nav'
import App from '../App.svelte'

beforeEach(() => {
  resetDb()
  prefs.lang = 'it'
  history.replaceState(null, '', '/')
  dismissToast()
})

const menu = () => screen.getByRole('button', { name: 'Menu' })

describe('Navigation (#37)', () => {
  it('has no tab bar: the log opens with a row of dropdowns, the menu first, then the presets', async () => {
    await addPreset({ name: 'Schiena', layers: [{ regions: ['152'], asks: ['pain'] }], kind: 'chronic' })
    render(App)
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Registra' })).not.toBeInTheDocument()
    const presets = presetButton()
    expect(menu().closest('.top')).toBe(presets.closest('.top'))
    expect(menu().compareDocumentPosition(presets) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    for (const b of [menu(), presets]) {
      expect(b).toHaveAttribute('aria-haspopup', 'menu')
      expect(b).toHaveAttribute('aria-expanded', 'false')
    }
    // Nothing going on: no episodes' dropdown.
    expect(episodesButton()).toBeNull()
  })

  it('each menu hangs from its own button: the screens from the left, the presets from the right edge', async () => {
    render(App)
    await fireEvent.click(menu())
    const screens = screen.getByRole('menu')
    expect(screens.parentElement).toBe(menu().parentElement)
    expect(screens).not.toHaveClass('end')
    await fireEvent.pointerDown(presetButton())
    await fireEvent.click(presetButton())
    const presets = screen.getByRole('menu')
    expect(presets.parentElement).toBe(presetButton().parentElement)
    expect(presets).toHaveClass('end')
    // The presets sit last in the row, pushed to its right edge.
    expect(presetButton().parentElement).toBe(presetButton().closest('.top')!.lastElementChild)
    expect(presetButton().parentElement).toHaveClass('end')
  })

  it('a menu a narrow page would cut slides back inside the screen, 12px from the edge', async () => {
    // jsdom lays nothing out: give menus a size and the window a phone's zoomed width.
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const [left, right] = this.getAttribute('role') === 'menu' ? (this.classList.contains('end') ? [-10, 160] : [60, 230]) : [0, 0]
      return { left, right, width: right - left, top: 0, bottom: 0, height: 0, x: left, y: 0, toJSON() {} } as DOMRect
    })
    vi.stubGlobal('innerWidth', 206)
    try {
      render(App)
      await fireEvent.click(menu())
      expect(screen.getByRole('menu').style.translate).toBe('-36px 0')
      await fireEvent.pointerDown(presetButton())
      await fireEvent.click(presetButton())
      expect(screen.getByRole('menu').style.translate).toBe('22px 0')
    } finally {
      rect.mockRestore()
      vi.unstubAllGlobals()
    }
  })

  it('one dropdown open at a time: opening another closes the first', async () => {
    render(App)
    await fireEvent.click(menu())
    await fireEvent.pointerDown(presetButton())
    await fireEvent.click(presetButton())
    expect(screen.getAllByRole('menu')).toHaveLength(1)
    expect(menu()).toHaveAttribute('aria-expanded', 'false')
    expect(presetButton()).toHaveAttribute('aria-expanded', 'true')
  })

  it('drops down the other screens, and closes on Escape or a tap elsewhere', async () => {
    render(App)
    await fireEvent.click(menu())
    expect(menu()).toHaveAttribute('aria-expanded', 'true')
    const list = screen.getByRole('menu')
    expect(within(list).getAllByRole('menuitem').map((b) => b.textContent?.trim())).toEqual(['Diario', 'Andamento', 'Impostazioni'])
    // A tap inside the menu, or another key, leaves it open.
    await fireEvent.pointerDown(within(list).getAllByRole('menuitem')[0])
    await fireEvent.keyDown(list, { key: 'ArrowDown' })
    expect(screen.getByRole('menu')).toBe(list)
    await fireEvent.keyDown(list, { key: 'Escape' })
    expect(menu()).toHaveFocus()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(menu()).toHaveAttribute('aria-expanded', 'false')
    await fireEvent.click(menu())
    await fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    // The menu button toggles it too.
    await fireEvent.click(menu())
    await fireEvent.click(menu())
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('opens a screen with its name and a way back; the arrow returns to the log', async () => {
    render(App)
    await go('Diario')
    expect(screen.getByRole('heading', { level: 1, name: 'Diario' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Menu' })).not.toBeInTheDocument()
    await back()
    expect(screen.getByRole('button', { name: 'Salva' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })

  it("Android's back gesture leaves a screen through history", async () => {
    render(App)
    await go('Andamento')
    expect(screen.getByRole('heading', { level: 1, name: 'Andamento' })).toBeInTheDocument()
    history.back()
    await screen.findByRole('button', { name: 'Menu' })
    await go('Impostazioni')
    expect(screen.getByRole('heading', { level: 1, name: 'Impostazioni' })).toBeInTheDocument()
    history.back()
    await screen.findByRole('button', { name: 'Salva' })
  })

  it('a reload on another screen opens the log, and back from a screen still lands there', async () => {
    history.replaceState({ screen: 'diary' }, '')
    render(App)
    expect(screen.getByRole('button', { name: 'Salva' })).toBeInTheDocument()
    await go('Andamento')
    await back()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })

  it('a toast does not follow to another screen', async () => {
    render(App)
    showToast('ciao')
    expect(await screen.findByText('ciao')).toBeInTheDocument()
    await go('Diario')
    await waitFor(() => expect(screen.queryByText('ciao')).not.toBeInTheDocument())
  })
})
