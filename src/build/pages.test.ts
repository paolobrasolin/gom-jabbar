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

describe('what the app is, on both pages', () => {
  // The pages state the intended purpose, which decides whether software is a medical device (MDR Art. 2(12), #121):
  // what it is for, said first, then what it does not do.
  it.each([
    ['privacy', en, it_],
    ['terms', termsEn, termsIt],
  ])('the %s page: a diary that shows what was written without interpreting it, in both languages', (_, english, italian) => {
    expect(text(english)).toContain('without interpreting it')
    expect(text(english)).toMatch(/does not diagnose, assess treatments or medicines, or give advice/i)
    expect(text(italian)).toContain('senza interpretarlo')
    expect(text(italian)).toMatch(/non fa diagnosi, non valuta cure o farmaci, non dà consigli/i)
  })
})

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
  it('in English: who is responsible for what, the warning first, then legal basis, recipients, retention, rights and the authority', () => {
    const t = text(en)
    expect(t).toContain('Who is responsible for what')
    expect(t).toContain('purely personal use')
    // The warning first, then the legal minimum for what is sent anyway.
    expect(t.indexOf("Don't send personal data.")).toBeLessThan(t.indexOf('Art. 6(1)(f)'))
    expect(t).toContain('no health details, no screenshots, no backups')
    expect(en).toContain('https://www.garanteprivacy.it')
    // #121: what the browser keeps (technical storage is disclosed, not consented to), where a Drive backup goes
    // away, who else holds what is sent, for how long, and the right to object on its own (GDPR Art. 21(4)).
    expect(t).toContain('no cookies and no trackers')
    expect(t).toContain('a copy of the app so it opens offline')
    expect(t).toContain('empty the trash')
    expect(t).not.toContain('no one but you')
    expect(t).toContain("the publisher's Gmail account (Google)")
    expect(t).toContain('issues are public on GitHub')
    expect(t).toContain('EU-US Data Privacy Framework')
    // Promises cover the publisher's own mailbox and issues; Google and GitHub keep copies on their own terms.
    expect(t).toContain('deleted within 12 months of the last message')
    expect(t).toContain('issues are public on GitHub and stay as long as the repository does')
    expect(t).toContain('None of it leaves the phone unless you send it')
    expect(t).toContain('Emails, issues and comments containing health details are deleted immediately')
    expect(t).not.toContain('Art. 9(2)(a)')
    expect(t).toContain('Google and GitHub delete their own copies on their own schedule')
    expect(t).not.toContain('kept no longer than that')
    expect(t).toMatch(/You can object at any time to this use of your data \(Art\. 21\)/)
    expect(t).toMatch(/Arts\. 15–18/)
  })

  it('in Italian, titled Informativa sulla privacy, with the same items', () => {
    const t = text(it_)
    expect(it_).toContain('<h1>Informativa sulla privacy</h1>')
    expect(t).toContain('Chi è responsabile di cosa')
    expect(t).toContain('uso esclusivamente personale')
    expect(t.indexOf('Non mandare dati personali.')).toBeLessThan(t.indexOf('art. 6, par. 1, lett. f'))
    expect(t).toContain('niente dati sulla salute, niente schermate, niente backup')
    expect(it_).toContain('https://www.garanteprivacy.it')
    expect(t).toContain('non usa cookie né strumenti di tracciamento')
    expect(t).toContain("una copia dell'app per aprirsi offline")
    expect(t).toContain('svuota il cestino')
    expect(t).not.toContain('nessun altro li tratta')
    expect(t).toContain("nell'account Gmail di chi pubblica l'app (Google)")
    expect(t).toContain('le issue sono pubbliche su GitHub')
    expect(t).toContain('EU-US Data Privacy Framework')
    expect(t).toContain("vengono cancellate entro 12 mesi dall'ultimo messaggio")
    expect(t).toContain('le issue sono pubbliche su GitHub e restano finché esiste il repository')
    expect(t).toContain('Niente di questo lascia il telefono, se non sei tu a mandarlo')
    expect(t).toContain('Email, issue e commenti che contengono dati sulla salute vengono cancellati immediatamente')
    expect(t).not.toContain('art. 9, par. 2, lett. a')
    expect(t).toContain('Google e GitHub cancellano le loro copie con i loro tempi')
    expect(t).not.toContain('e non resta oltre')
    expect(t).toMatch(/Puoi opporti in qualsiasi momento a questo uso dei tuoi dati \(art\. 21\)/)
    expect(t).toMatch(/artt\. 15–18/)
  })
})
