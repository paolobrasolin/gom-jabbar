import { screen, fireEvent, within, waitFor } from '@testing-library/svelte'

/** Log is home (#37): its menu opens the other screens. */
export async function go(name: 'Diario' | 'Andamento' | 'Impostazioni') {
  await fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
  await fireEvent.click(screen.getByRole('menuitem', { name }))
}

/** The header's arrow goes back through history, which lands asynchronously: wait for the log's menu. */
export async function back() {
  await fireEvent.click(screen.getByRole('button', { name: 'Indietro' }))
  await screen.findByRole('button', { name: 'Menu' })
}

/** The menu a dropdown of the log's top row drops, opening it unless it is open already. */
async function menuOf(button: HTMLElement): Promise<HTMLElement> {
  if (button.getAttribute('aria-expanded') !== 'true') await fireEvent.click(button)
  return document.getElementById(button.getAttribute('aria-controls')!)!
}

/** The presets' dropdown: it reads "Preset"; its name is "Preset: <name>" while the form carries one. */
export const presetButton = () => screen.getByRole('button', { name: /^Preset/ })
export async function presetItem(name: string | RegExp) {
  return within(await menuOf(presetButton())).findByRole('menuitem', { name })
}
export async function pickPreset(name: string | RegExp) {
  await fireEvent.click(await presetItem(name))
}

/** The episodes' dropdown, there only while something is going on: "2 in corso". */
export const episodesButton = () => screen.queryByRole('button', { name: /^\d+ in corso$/ })
export async function episodeItems() {
  return within(await menuOf(await screen.findByRole('button', { name: /^\d+ in corso$/ }))).getAllByRole('menuitem')
}
/** Opens the sheet of the `i`th episode going on. */
export async function openEpisode(i = 0) {
  await fireEvent.click((await episodeItems())[i])
  return screen.findByRole('dialog', { name: 'Episodio in corso' })
}

/**
 * Salva on the log, the headline given a level first when it has none: sliders start blank and Salva refuses a form with
 * nothing measured (§6.1 item 7). For tests about something else than the level itself.
 */
export async function salva(level = 5) {
  // The headline arrives with the vocabulary, after the first frame; a form with no symptom on has none at all.
  const head = await waitFor(
    () => {
      const el = [...document.querySelectorAll<HTMLInputElement>('input[type="range"]')].find((i) => !i.closest('[role="dialog"]'))
      if (!el) throw new Error('no headline slider yet')
      return el
    },
    { timeout: 300 },
  ).catch(() => undefined)
  if (head?.getAttribute('aria-valuetext') === 'non indicato') await fireEvent.input(head, { target: { value: String(level) } })
  await fireEvent.click(screen.getByRole('button', { name: 'Salva' }))
}

/** The toast showing, once one is (#94): its live region is always in the page, so look for the toast itself. */
export const findToast = (): Promise<HTMLElement> =>
  waitFor(() => {
    const el = document.querySelector<HTMLElement>('.toast')
    if (!el) throw new Error('no toast')
    return el
  })
