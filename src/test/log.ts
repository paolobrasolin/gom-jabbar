/** What the log's tests share, split across files by subject so they run in parallel. */
import { screen, fireEvent } from '@testing-library/svelte'
import { db, resetDb } from '../lib/db'
import { prefs } from '../lib/prefs.svelte'
import { presetItem } from './nav'
import { intensityColor } from '../lib/color'
import { isHead, isUpdate } from '../lib/entries'

/** A fresh database and the log's settings: Italian, mirror on, views not mirrored. */
export function resetLog() {
  const fresh = resetDb()
  prefs.lang = 'it'
  prefs.mirror = true
  prefs.mirrorViews = false
  return fresh
}
/** The episode heads stored, and the latest update of any episode. */
export const heads = async () => (await db.entries.toArray()).filter(isHead)
export const lastUpdate = async () => (await db.entries.toArray()).filter(isUpdate).sort((a, b) => a.at.localeCompare(b.at)).at(-1)
/** The two faces of the slot (#22): Altro shows everything past the fast path, Corpo brings the figure back; a new draft opens on Corpo. */
export const more = (scope: { getByRole: typeof screen.getByRole } = screen) => fireEvent.click(scope.getByRole('button', { name: /^Altro/ }))
export const body = (scope: { getByRole: typeof screen.getByRole } = screen) => fireEvent.click(scope.getByRole('button', { name: 'Corpo' }))
/** A level's fill as the DOM serialises it. */
export function fill(level: number) {
  const probe = document.createElement('div')
  probe.style.background = intensityColor(level)
  return probe.style.background
}
/** The presets' menu, opened. */
export const menuOfPresets = async () => (await presetItem('Nuovo preset')).closest<HTMLElement>('[role="menu"]')!
/** The pieces drawn on the stage itself, not on the thumbnail of the other side. */
export const strokes = () => document.querySelectorAll('.stage > svg .stroke')
