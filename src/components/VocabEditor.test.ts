import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte'
import { resetDb } from '../lib/db'
import { prefs } from '../lib/prefs.svelte'
import VocabEditor from './VocabEditor.svelte'

let db: ReturnType<typeof resetDb>
beforeEach(() => {
  db = resetDb()
  prefs.lang = 'it'
})

const names = () => Array.from(document.querySelectorAll('.item .name')).map((b) => b.textContent)
const itemOf = (name: string) => screen.getByRole('button', { name }).closest('.item') as HTMLElement

describe('Vocabulary editor: symptoms', () => {
  it('lists the symptoms in order, pain locked, the others switchable', async () => {
    render(VocabEditor, { table: 'symptoms' })
    await waitFor(() => expect(names()).toEqual(['Dolore', 'Gonfiore', 'Pesantezza', 'Stanchezza', 'Nebbia mentale', 'Dolorabilità al tatto', 'Rigidità']))
    expect(within(itemOf('Dolore')).queryByRole('checkbox')).not.toBeInTheDocument()
    expect(within(itemOf('Gonfiore')).getByRole('checkbox', { name: 'Gonfiore' })).toBeChecked()
  })

  it('switches a symptom off and on', async () => {
    render(VocabEditor, { table: 'symptoms' })
    const box = await screen.findByRole('checkbox', { name: 'Gonfiore' })
    await fireEvent.click(box)
    await waitFor(async () => expect((await db.symptoms.get('swelling'))?.enabled).toBe(false))
    await waitFor(() => expect(itemOf('Gonfiore')).toHaveClass('off'))
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Gonfiore' }))
    await waitFor(async () => expect((await db.symptoms.get('swelling'))?.enabled).toBe(true))
    await waitFor(() => expect(itemOf('Gonfiore')).not.toHaveClass('off'))
  })

  it('renames in the current language on Enter, leaving the other translation alone', async () => {
    render(VocabEditor, { table: 'symptoms' })
    await fireEvent.click(await screen.findByRole('button', { name: 'Gonfiore' }))
    const input = screen.getByDisplayValue('Gonfiore')
    await fireEvent.input(input, { target: { value: ' Edema ' } })
    await fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(async () => expect((await db.symptoms.get('swelling'))?.label).toEqual({ it: 'Edema', en: 'Swelling' }))
    await waitFor(() => expect(names()[1]).toBe('Edema'))
    expect(screen.queryByDisplayValue('Edema')).not.toBeInTheDocument()
  })

  it('renames on blur too, and a blank name is ignored', async () => {
    render(VocabEditor, { table: 'symptoms' })
    await fireEvent.click(await screen.findByRole('button', { name: 'Rigidità' }))
    let input = screen.getByDisplayValue('Rigidità')
    await fireEvent.input(input, { target: { value: '   ' } })
    await fireEvent.blur(input)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Rigidità' })).toBeInTheDocument())
    expect((await db.symptoms.get('stiffness'))?.label.it).toBe('Rigidità')

    await fireEvent.click(screen.getByRole('button', { name: 'Rigidità' }))
    input = screen.getByDisplayValue('Rigidità')
    await fireEvent.input(input, { target: { value: 'Rigido' } })
    await fireEvent.blur(input)
    await waitFor(async () => expect((await db.symptoms.get('stiffness'))?.label.it).toBe('Rigido'))
  })

  it('moves a symptom up and down, stopping at the ends', async () => {
    render(VocabEditor, { table: 'symptoms' })
    await screen.findByRole('button', { name: 'Gonfiore' })
    await fireEvent.click(within(itemOf('Gonfiore')).getByRole('button', { name: '↓' }))
    await waitFor(() => expect(names().slice(0, 3)).toEqual(['Dolore', 'Pesantezza', 'Gonfiore']))
    await fireEvent.click(within(itemOf('Gonfiore')).getByRole('button', { name: '↑' }))
    await waitFor(() => expect(names().slice(0, 3)).toEqual(['Dolore', 'Gonfiore', 'Pesantezza']))
    await fireEvent.click(within(itemOf('Dolore')).getByRole('button', { name: '↑' }))
    await fireEvent.click(within(itemOf('Rigidità')).getByRole('button', { name: '↓' }))
    await new Promise((res) => setTimeout(res, 20))
    expect(names()).toEqual(['Dolore', 'Gonfiore', 'Pesantezza', 'Stanchezza', 'Nebbia mentale', 'Dolorabilità al tatto', 'Rigidità'])
  })

  it('adds a symptom from the field, by button or Enter, ignoring blanks', async () => {
    render(VocabEditor, { table: 'symptoms' })
    const field = await screen.findByPlaceholderText('Nuovo…')
    await fireEvent.click(screen.getByRole('button', { name: '+ Aggiungi' }))
    await fireEvent.input(field, { target: { value: '  ' } })
    await fireEvent.keyDown(field, { key: 'Enter' })
    await new Promise((res) => setTimeout(res, 20))
    expect(await db.symptoms.count()).toBe(7)

    await fireEvent.input(field, { target: { value: 'Formicolio' } })
    await fireEvent.click(screen.getByRole('button', { name: '+ Aggiungi' }))
    await waitFor(() => expect(names()).toHaveLength(8))
    expect(names()[7]).toBe('Formicolio')
    await waitFor(() => expect(field).toHaveValue(''))
    const added = (await db.symptoms.orderBy('order').last())!
    expect(added).toMatchObject({ label: { it: 'Formicolio', en: 'Formicolio' }, enabled: true, order: 7 })
    expect(added.id).toMatch(/^formicolio_/)

    await fireEvent.input(field, { target: { value: 'Crampi' } })
    await fireEvent.keyDown(field, { key: 'Enter' })
    await waitFor(() => expect(names()[8]).toBe('Crampi'))
    await waitFor(() => expect(field).toHaveValue(''))
    // A user-made item keeps both translations in sync when renamed.
    await fireEvent.click(screen.getByRole('button', { name: 'Crampi' }))
    const input = screen.getByDisplayValue('Crampi')
    await fireEvent.input(input, { target: { value: 'Crampo' } })
    await fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(async () => expect((await db.symptoms.orderBy('order').last())?.label).toEqual({ it: 'Crampo', en: 'Crampo' }))
  })
})

describe('Vocabulary editor: tags', () => {
  it('lists the tags by group, each with its own add field', async () => {
    render(VocabEditor, { table: 'tags' })
    await waitFor(() => expect(names()).toHaveLength(15))
    const titles = Array.from(document.querySelectorAll('.group-title')).map((p) => p.textContent)
    expect(titles).toEqual(['Rimedi', 'Contesto', 'Farmaci'])
    expect(screen.getAllByPlaceholderText('Nuovo…')).toHaveLength(3)
    expect(names().slice(0, 2)).toEqual(['Compressione', 'Linfodrenaggio'])
    expect(names()[8]).toBe('Ciclo')
    expect(screen.getByRole('checkbox', { name: 'Compressione' })).toBeChecked()
  })

  it('adds a tag to the group of the field it was typed in', async () => {
    render(VocabEditor, { table: 'tags' })
    const fields = await screen.findAllByPlaceholderText('Nuovo…')
    await fireEvent.input(fields[2], { target: { value: 'Ibuprofene' } })
    await fireEvent.click(screen.getAllByRole('button', { name: '+ Aggiungi' })[2])
    await waitFor(() => expect(names()).toContain('Ibuprofene'))
    const added = (await db.tags.orderBy('order').last())!
    expect(added).toMatchObject({ group: 'medication', label: { it: 'Ibuprofene', en: 'Ibuprofene' }, enabled: true, order: 17 })
    expect(names()[names().length - 1]).toBe('Ibuprofene')
  })

  it('moves a tag only within its group', async () => {
    render(VocabEditor, { table: 'tags' })
    await screen.findByRole('button', { name: 'Stress' })
    await fireEvent.click(within(itemOf('Stress')).getByRole('button', { name: '↑' }))
    await waitFor(() => expect(names().slice(8, 10)).toEqual(['Stress', 'Ciclo']))
    await fireEvent.click(within(itemOf('Meditazione')).getByRole('button', { name: '↓' }))
    await new Promise((res) => setTimeout(res, 20))
    expect(names()[7]).toBe('Meditazione')
    expect(names()[8]).toBe('Stress')
  })

  it('switches a tag off', async () => {
    render(VocabEditor, { table: 'tags' })
    await fireEvent.click(await screen.findByRole('checkbox', { name: 'Viaggio' }))
    await waitFor(async () => expect((await db.tags.get('travel'))?.enabled).toBe(false))
    await waitFor(() => expect(itemOf('Viaggio')).toHaveClass('off'))
  })
})
