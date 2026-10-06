/**
 * The static pages Google's consent screen links (§6.4, #35, #117): the privacy page says who is responsible for what
 * and the basics the GDPR asks of an information notice, in both languages, and warns against posting health details.
 * The terms describe what is given rather than exclude liability, which a page nobody signs cannot do (#121).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const page = readFileSync('public/privacy-policy.html', 'utf8')
const [en, it_] = page.split('<div lang="it" id="it">')
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const terms = readFileSync('public/terms-of-service.html', 'utf8')
const [termsEn, termsIt] = terms.split('<div lang="it" id="it">')

describe('the terms page', () => {
  it('in English: what is given, what no clause limits, backups, nothing paid, changes forward, the law of where you live', () => {
    const t = text(termsEn)
    expect(t).toContain('it can have bugs, and it promises no result')
    expect(t).toContain('Nothing in these terms limits liability for intent or gross negligence, for death or harm to health, or under product liability law')
    expect(t).toContain('art. 1227')
    expect(t).toContain('nothing in the app or its updates depends on paying or donating')
    expect(t).toContain('new terms apply only from that date on')
    expect(t).toContain('If you live in another country, you keep the protection its mandatory rules give you')
    // Excluding liability takes a clause approved in writing (art. 1341 c.c.): the page does not pretend to.
    expect(t).not.toContain('not liable')
  })

  it('in Italian, the same', () => {
    const t = text(termsIt)
    expect(t).toContain('può avere difetti e non promette risultati')
    expect(t).toContain('Nulla in questi termini limita la responsabilità per dolo o colpa grave, per morte o danni alla salute, o prevista dalle norme sulla responsabilità da prodotto')
    expect(t).toContain('art. 1227')
    expect(t).toContain("niente nell'app o nei suoi aggiornamenti dipende da pagamenti o donazioni")
    expect(t).toContain('i nuovi termini valgono solo da quella data in poi')
    expect(t).toContain('Se vivi in un altro paese, conservi le tutele che ti danno le sue norme inderogabili')
    expect(t).not.toContain('non risponde')
  })

  it('has the same sections in both languages', () => {
    const sections = (html: string) => html.match(/<h2>/g)?.length
    expect(sections(termsIt)).toBe(sections(termsEn))
  })
})

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
