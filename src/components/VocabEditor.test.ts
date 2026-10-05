import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte'
import { resetDb } from '../lib/db'
import { prefs } from '../lib/prefs.svelte'
import { toastState, dismissToast } from '../lib/toast.svelte'
import { addEntry } from '../lib/entries'
import { addPreset } from '../lib/presets'
import { deleteItem } from '../lib/vocab'
import VocabEditor from './VocabEditor.svelte'

let db: ReturnType<typeof resetDb>
beforeEach(() => {
  db = resetDb()
  prefs.lang = 'it'
  dismissToast()
})

const names = () => Array.from(document.querySelectorAll('.item .name')).map((b) => b.textContent)
const itemOf = (name: string) => screen.getByRole('button', { name }).closest('.item') as HTMLElement
/** Deleting lives in the rename field (#115): open it, then Elimina. */
async function deleteNamed(name: string) {
  await fireEvent.click(await screen.findByRole('button', { name: `Rinomina ${name}` }))
  await fireEvent.click(await screen.findByRole('button', { name: `Elimina ${name}` }))
}

describe('Vocabulary editor: symptoms', () => {
  it('lists the symptoms by category in order, every one switchable, pain included', async () => {
    render(VocabEditor, { table: 'symptoms' })
    await waitFor(() => expect(names()).toEqual(['Dolore', 'Gonfiore', 'Pesantezza', 'Stanchezza', 'Male al tocco', 'Rigidità', 'Nebbia mentale', 'Ansia', 'Umore basso']))
    const titles = Array.from(document.querySelectorAll('.group-title')).map((p) => p.textContent)
    expect(titles).toEqual(['Corpo', 'Mente'])
    expect(screen.getAllByPlaceholderText('Nuovo…')).toHaveLength(2)
    expect(within(itemOf('Dolore')).getByRole('checkbox', { name: 'Dolore' })).toBeChecked()
    expect(within(itemOf('Gonfiore')).getByRole('checkbox', { name: 'Gonfiore' })).toBeChecked()
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Dolore' }))
    await waitFor(async () => expect((await db.symptoms.get('pain'))?.enabled).toBe(false))
  })

  it('refuses a name already in the list, whatever the case, as a refusal (#94)', async () => {
    render(VocabEditor, { table: 'symptoms' })
    await waitFor(() => expect(names()).toContain('Gonfiore'))
    const fields = screen.getAllByPlaceholderText('Nuovo…')
    await fireEvent.input(fields[0], { target: { value: 'gonfiore' } })
    await fireEvent.keyDown(fields[0], { key: 'Enter' })
    await waitFor(() => expect(toastState.current).toMatchObject({ message: '«Gonfiore» c\'è già', kind: 'refusal' }))
    expect(names().filter((n) => n === 'Gonfiore')).toHaveLength(1)
  })

  it('adds a mind symptom from the field of its group, and moves only within the group', async () => {
    render(VocabEditor, { table: 'symptoms' })
    const fields = await screen.findAllByPlaceholderText('Nuovo…')
    await fireEvent.input(fields[1], { target: { value: 'Irritabilità' } })
    await fireEvent.keyDown(fields[1], { key: 'Enter' })
    await waitFor(() => expect(names()).toContain('Irritabilità'))
    expect(names().slice(-2)).toEqual(['Umore basso', 'Irritabilità'])
    const added = (await db.symptoms.orderBy('order').last())!
    expect(added).toMatchObject({ category: 'mind', label: 'Irritabilità', enabled: true, order: 9 })
    await fireEvent.click(within(itemOf('Irritabilità')).getByRole('button', { name: '↑' }))
    await waitFor(() => expect(names().slice(-2)).toEqual(['Irritabilità', 'Umore basso']))
    await fireEvent.click(within(itemOf('Irritabilità')).getByRole('button', { name: '↑' }))
    await waitFor(() => expect(names().slice(-3)).toEqual(['Irritabilità', 'Ansia', 'Umore basso']))
    await fireEvent.click(within(itemOf('Irritabilità')).getByRole('button', { name: '↑' }))
    await waitFor(() => expect(names().slice(-4)).toEqual(['Irritabilità', 'Nebbia mentale', 'Ansia', 'Umore basso']))
    // At the top of its group ↑ does nothing; the move after it lands only once that one has.
    await fireEvent.click(within(itemOf('Irritabilità')).getByRole('button', { name: '↑' }))
    await fireEvent.click(within(itemOf('Ansia')).getByRole('button', { name: '↓' }))
    await waitFor(() => expect(names()).toEqual(['Dolore', 'Gonfiore', 'Pesantezza', 'Stanchezza', 'Male al tocco', 'Rigidità', 'Irritabilità', 'Nebbia mentale', 'Umore basso', 'Ansia']))
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

  it('a ✎ button renames, as a tap on the name does; the name keeps its own button name (#115)', async () => {
    render(VocabEditor, { table: 'symptoms' })
    await fireEvent.click(await screen.findByRole('button', { name: 'Rinomina Gonfiore' }))
    expect(screen.getByDisplayValue('Gonfiore')).toBeInTheDocument()
    expect(names()[0]).toBe('Dolore')
  })

  it('renames on Enter: the typed word replaces the name, in every language', async () => {
    render(VocabEditor, { table: 'symptoms' })
    await fireEvent.click(await screen.findByRole('button', { name: 'Gonfiore' }))
    const input = screen.getByDisplayValue('Gonfiore')
    await fireEvent.input(input, { target: { value: ' Edema ' } })
    await fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(async () => expect((await db.symptoms.get('swelling'))?.label).toBe('Edema'))
    await waitFor(() => expect(names()[1]).toBe('Edema'))
    expect(screen.queryByDisplayValue('Edema')).not.toBeInTheDocument()
  })

  it('shows the seed in the app language and a renamed item as it was typed', async () => {
    await db.symptoms.update('swelling', { label: 'Edema' })
    prefs.lang = 'en'
    render(VocabEditor, { table: 'symptoms' })
    await waitFor(() => expect(names().slice(0, 3)).toEqual(['Pain', 'Edema', 'Heaviness']))
  })

  it('renames on blur too, and a blank name is ignored', async () => {
    render(VocabEditor, { table: 'symptoms' })
    await fireEvent.click(await screen.findByRole('button', { name: 'Rigidità' }))
    let input = screen.getByDisplayValue('Rigidità')
    await fireEvent.input(input, { target: { value: '   ' } })
    await fireEvent.blur(input)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Rigidità' })).toBeInTheDocument())
    expect((await db.symptoms.get('stiffness'))?.label).toBe('i18n:vocab.stiffness')

    await fireEvent.click(screen.getByRole('button', { name: 'Rigidità' }))
    input = screen.getByDisplayValue('Rigidità')
    await fireEvent.input(input, { target: { value: 'Rigido' } })
    await fireEvent.blur(input)
    await waitFor(async () => expect((await db.symptoms.get('stiffness'))?.label).toBe('Rigido'))
  })

  it('leaves a name tapped and left unchanged as it was: a seed name keeps following the language', async () => {
    render(VocabEditor, { table: 'symptoms' })
    await fireEvent.click(await screen.findByRole('button', { name: 'Gonfiore' }))
    const input = screen.getByDisplayValue('Gonfiore')
    await fireEvent.input(input, { target: { value: ' Gonfiore ' } })
    await fireEvent.blur(input)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Gonfiore' })).toBeInTheDocument())
    expect((await db.symptoms.get('swelling'))?.label).toBe('i18n:vocab.swelling')
    prefs.lang = 'en'
    await waitFor(() => expect(names()[1]).toBe('Swelling'))
  })

  it('moves a symptom up and down, stopping at the ends', async () => {
    render(VocabEditor, { table: 'symptoms' })
    await screen.findByRole('button', { name: 'Gonfiore' })
    await fireEvent.click(within(itemOf('Gonfiore')).getByRole('button', { name: '↓' }))
    await waitFor(() => expect(names().slice(0, 3)).toEqual(['Dolore', 'Pesantezza', 'Gonfiore']))
    await fireEvent.click(within(itemOf('Gonfiore')).getByRole('button', { name: '↑' }))
    await waitFor(() => expect(names().slice(0, 3)).toEqual(['Dolore', 'Gonfiore', 'Pesantezza']))
    // At the ends nothing moves; the move after them lands only once they have.
    await fireEvent.click(within(itemOf('Dolore')).getByRole('button', { name: '↑' }))
    await fireEvent.click(within(itemOf('Rigidità')).getByRole('button', { name: '↓' }))
    await fireEvent.click(within(itemOf('Gonfiore')).getByRole('button', { name: '↓' }))
    await waitFor(() => expect(names()).toEqual(['Dolore', 'Pesantezza', 'Gonfiore', 'Stanchezza', 'Male al tocco', 'Rigidità', 'Nebbia mentale', 'Ansia', 'Umore basso']))
  })

  it('adds a symptom from the field, by button or Enter, ignoring blanks', async () => {
    render(VocabEditor, { table: 'symptoms' })
    const field = (await screen.findAllByPlaceholderText('Nuovo…'))[0]
    const addButton = () => screen.getAllByRole('button', { name: '+ Aggiungi' })[0]
    await fireEvent.click(addButton())
    await fireEvent.input(field, { target: { value: '  ' } })
    await fireEvent.keyDown(field, { key: 'Enter' })

    // The blanks added nothing: once the add after them has landed, there is one symptom more, not three.
    await fireEvent.input(field, { target: { value: 'Formicolio' } })
    await fireEvent.click(addButton())
    await waitFor(() => expect(names()).toContain('Formicolio'))
    expect(await db.symptoms.count()).toBe(10)
    expect(names()[6]).toBe('Formicolio')
    await waitFor(() => expect(field).toHaveValue(''))
    const added = (await db.symptoms.orderBy('order').last())!
    expect(added).toMatchObject({ label: 'Formicolio', enabled: true, order: 9 })

    await fireEvent.input(field, { target: { value: 'Crampi' } })
    await fireEvent.keyDown(field, { key: 'Enter' })
    await waitFor(() => expect(names()[7]).toBe('Crampi'))
    await waitFor(() => expect(field).toHaveValue(''))
    await fireEvent.click(screen.getByRole('button', { name: 'Crampi' }))
    const input = screen.getByDisplayValue('Crampi')
    await fireEvent.input(input, { target: { value: 'Crampo' } })
    await fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(async () => expect((await db.symptoms.orderBy('order').last())?.label).toBe('Crampo'))
  })
})

describe('Vocabulary editor: names are unique', () => {
  it('refuses to add a name the list already has, in any case and any group, and says so', async () => {
    render(VocabEditor, { table: 'symptoms' })
    await screen.findByRole('button', { name: 'Dolore' })
    const fields = screen.getAllByPlaceholderText('Nuovo…')
    await fireEvent.input(fields[1], { target: { value: ' dolore ' } })
    await fireEvent.keyDown(fields[1], { key: 'Enter' })
    await waitFor(() => expect(toastState.current?.message).toBe('«Dolore» c\'è già'))
    expect(await db.symptoms.count()).toBe(9)
    expect(fields[1]).toHaveValue(' dolore ')
  })

  it('refuses to rename an item to another item\'s name, leaving it as it was', async () => {
    render(VocabEditor, { table: 'tags' })
    await fireEvent.click(await screen.findByRole('button', { name: 'Stress' }))
    const input = screen.getByDisplayValue('Stress')
    await fireEvent.input(input, { target: { value: 'IMPACCO CALDO' } })
    await fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(toastState.current?.message).toBe('«Impacco caldo» c\'è già'))
    expect((await db.tags.get('stress'))?.label).toBe('i18n:vocab.stress')
    expect(screen.getByRole('button', { name: 'Stress' })).toBeInTheDocument()
  })

  it('lets an item be renamed to its own name in another case', async () => {
    render(VocabEditor, { table: 'tags' })
    await fireEvent.click(await screen.findByRole('button', { name: 'Stress' }))
    const input = screen.getByDisplayValue('Stress')
    await fireEvent.input(input, { target: { value: 'STRESS' } })
    await fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(async () => expect((await db.tags.get('stress'))?.label).toBe('STRESS'))
  })
})

describe('Vocabulary editor: tags', () => {
  it('lists the tags by group, each with its own add field', async () => {
    render(VocabEditor, { table: 'tags' })
    await waitFor(() => expect(names()).toHaveLength(16))
    const titles = Array.from(document.querySelectorAll('.group-title')).map((p) => p.textContent)
    expect(titles).toEqual(['Rimedi', 'Contesto', 'Farmaci'])
    // The weather both ways, next to each other.
    expect(names().slice(names().indexOf('Clima caldo'), names().indexOf('Clima caldo') + 3)).toEqual(['Clima caldo', 'Clima freddo', 'Viaggio'])
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
    expect(added).toMatchObject({ group: 'medication', label: 'Ibuprofene', enabled: true, order: 18 })
    expect(names()[names().length - 1]).toBe('Ibuprofene')
  })

  it('moves a tag only within its group', async () => {
    render(VocabEditor, { table: 'tags' })
    await screen.findByRole('button', { name: 'Stress' })
    await fireEvent.click(within(itemOf('Stress')).getByRole('button', { name: '↑' }))
    await waitFor(() => expect(names().slice(8, 10)).toEqual(['Stress', 'Ciclo']))
    // Last of its group, Meditazione stays; the move after it lands only once that one has.
    await fireEvent.click(within(itemOf('Meditazione')).getByRole('button', { name: '↓' }))
    await fireEvent.click(within(itemOf('Stress')).getByRole('button', { name: '↓' }))
    await waitFor(() => expect(names().slice(7, 10)).toEqual(['Meditazione', 'Ciclo', 'Stress']))
  })

  it('switches a tag off', async () => {
    render(VocabEditor, { table: 'tags' })
    await fireEvent.click(await screen.findByRole('checkbox', { name: 'Viaggio' }))
    await waitFor(async () => expect((await db.tags.get('travel'))?.enabled).toBe(false))
    await waitFor(() => expect(itemOf('Viaggio')).toHaveClass('off'))
  })
})

describe('Vocabulary editor: deleting (§6.4)', () => {
  it('offers Elimina only on unused items, and says how much a used one is used', async () => {
    await addEntry({ layers: [{ regions: [], readings: { pain: 4, swelling: 2 }, tags: [] }] })
    await addEntry({ layers: [{ regions: [], readings: { pain: 4, swelling: 1 }, tags: [] }] })
    await addPreset({ name: 'P', kind: 'chronic', layers: [{ regions: ['mind'], asks: ['fog'] }] })
    render(VocabEditor, { table: 'symptoms' })
    await waitFor(() => expect(within(itemOf('Gonfiore')).getByText('2 voci')).toBeInTheDocument())
    expect(within(itemOf('Nebbia mentale')).getByText('1 preset')).toBeInTheDocument()
    // Not on the row (#115): in the rename field, and only for what nothing uses.
    expect(screen.queryByRole('button', { name: /^Elimina/ })).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Rinomina Gonfiore' }))
    expect(screen.queryByRole('button', { name: /^Elimina/ })).not.toBeInTheDocument()
    await fireEvent.keyDown(screen.getByDisplayValue('Gonfiore'), { key: 'Enter' })
    await fireEvent.click(screen.getByRole('button', { name: 'Rinomina Pesantezza' }))
    expect(screen.getByRole('button', { name: 'Elimina Pesantezza' })).toBeInTheDocument()
    // Pain is used, so it stays; unused, it could go like any other.
    expect(within(itemOf('Dolore')).getByText('2 voci')).toBeInTheDocument()
  })

  it('a tag or a symptom read only on a later layer is in use: no bin, and a delete is refused', async () => {
    await addEntry({
      layers: [
        { regions: ['152'], readings: { pain: 4 }, tags: [] },
        { regions: ['110'], readings: { pain: 2, stiffness: 3 }, tags: [] },
        { regions: ['130'], readings: { pain: 1 }, tags: ['rest'] },
      ],
    })
    render(VocabEditor, { table: 'tags' })
    await waitFor(() => expect(within(itemOf('Riposo')).getByText('1 voce')).toBeInTheDocument())
    await fireEvent.click(screen.getByRole('button', { name: 'Rinomina Riposo' }))
    expect(screen.queryByRole('button', { name: 'Elimina Riposo' })).not.toBeInTheDocument()
    expect(await deleteItem('tags', 'rest')).toBeUndefined()
    expect(await deleteItem('symptoms', 'stiffness')).toBeUndefined()
    expect(await db.tags.get('rest')).toBeDefined()
    expect(await db.symptoms.get('stiffness')).toBeDefined()
  })

  it('deletes with an undo toast, no dialog, and undo puts the item back in its place', async () => {
    render(VocabEditor, { table: 'tags' })
    await deleteNamed('Stress')
    await waitFor(() => expect(names()).not.toContain('Stress'))
    expect(await db.tags.get('stress')).toBeUndefined()
    expect(toastState.current?.message).toBe('Eliminato: Stress')
    toastState.current!.action!.run()
    await waitFor(() => expect(names().slice(8, 10)).toEqual(['Ciclo', 'Stress']))
    expect(await db.tags.get('stress')).toMatchObject({ label: 'i18n:vocab.stress', group: 'context', order: 11 })
  })

  it('can empty a whole group', async () => {
    render(VocabEditor, { table: 'tags' })
    for (const name of ['Ciclo', 'Stress', 'Dormito male', 'A lungo in piedi', 'A lungo a sedere', 'Clima caldo', 'Clima freddo', 'Viaggio']) {
      await deleteNamed(name)
      await waitFor(() => expect(names()).not.toContain(name))
    }
    expect(await db.tags.where('group').equals('context').count()).toBe(0)
    expect(screen.getAllByPlaceholderText('Nuovo…')).toHaveLength(3)
  })
})
