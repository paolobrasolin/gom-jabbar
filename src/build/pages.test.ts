/**
 * The static pages Google's consent screen links (§6.4, #35, #117): the privacy page says who is responsible for what
 * and the basics the GDPR asks of an information notice, in both languages, and warns against posting health details.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const page = readFileSync('public/privacy-policy.html', 'utf8')
const [en, it_] = page.split('<div lang="it" id="it">')
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('the privacy page', () => {
  it('in English: who is responsible for what, the warning first, then legal basis, retention, rights and the authority', () => {
    const t = text(en)
    expect(t).toContain('Who is responsible for what')
    expect(t).toContain('purely personal use')
    // The warning first, then the legal minimum for what is sent anyway.
    expect(t.indexOf("Don't send personal data.")).toBeLessThan(t.indexOf('Art. 6(1)(f)'))
    expect(t).toContain('no health details, no screenshots, no backups')
    expect(t).toMatch(/kept no longer than that/)
    expect(t).toMatch(/Arts\. 15–21/)
    expect(en).toContain('https://www.garanteprivacy.it')
  })

  it('in Italian, titled Informativa sulla privacy, with the same items', () => {
    const t = text(it_)
    expect(it_).toContain('<h1>Informativa sulla privacy</h1>')
    expect(t).toContain('Chi è responsabile di cosa')
    expect(t).toContain('uso esclusivamente personale')
    expect(t.indexOf('Non mandare dati personali.')).toBeLessThan(t.indexOf('art. 6, par. 1, lett. f'))
    expect(t).toContain('niente dati sulla salute, niente schermate, niente backup')
    expect(t).toMatch(/e non resta oltre/)
    expect(t).toMatch(/artt\. 15–21/)
    expect(it_).toContain('https://www.garanteprivacy.it')
  })
})
