/**
 * Third-party notices for `open-source-licences.html` (#35): every package whose code ends up in the app, with its licence text,
 * because MIT and Apache ask for their notices to travel with copies. Pure: `vite.config.ts` does the file reading.
 */

export type Notice = { name: string; version: string; license: string; text: string }

/** The package a bundled module comes from: the last `node_modules` segment of its path, scoped names included. */
export function packageOf(id: string): string | null {
  const parts = id.split('?')[0].split(/[\\/]/)
  const i = parts.lastIndexOf('node_modules')
  if (i < 0 || i + 1 >= parts.length) return null
  return parts[i + 1].startsWith('@') ? `${parts[i + 1]}/${parts[i + 2]}` : parts[i + 1]
}

const LICENCE_FILE = /^(licen[cs]e|copying)(\.(md|txt))?$/i

/** A package's notice, from its `package.json` and its licence file. `read` gets a file of the package by name. */
export function noticeOf(name: string, read: (file: string) => string | null, files: string[]): Notice {
  const pkg = JSON.parse(read('package.json') ?? '{}') as { version?: string; license?: string | { type?: string } }
  const license = (typeof pkg.license === 'string' ? pkg.license : pkg.license?.type) ?? 'unknown'
  const file = files.find((f) => LICENCE_FILE.test(f))
  const text = (file && read(file)?.trim()) || `No licence file in the package; package.json says: ${license}.`
  // Apache-2.0 §4(d): a NOTICE file travels with every copy.
  const noticeFile = files.find((f) => /^notice(\.(md|txt))?$/i.test(f))
  const notice = noticeFile && read(noticeFile)?.trim()
  return { name, version: pkg.version ?? '?', license, text: notice ? `${text}\n\nNOTICE\n\n${notice}` : text }
}

/**
 * The body map's entry (#35, #121). Its outlines are the CHOIR body map's own segment regions, devised at Stanford, as
 * shipped in the MIT-licensed CHOIRBM package, whose metadata names Stanford as copyright holder: credit the map, its
 * authors and both papers, say the app is not affiliated, then the package's licence (`mit`, from scripts/choir).
 */
export function choirNotice(mit: string): Notice {
  const credit = [
    'The CHOIR Body Map (Collaborative Health Outcomes Information Registry), Stanford University Division of Pain Medicine; the original body map was devised by Ming-Chih J. Kao and Sean Mackey. Gom Jabbar draws its segment outlines, recoloured and renumbered, as shipped in the CHOIRBM R package by Eric Cramer, under the MIT licence below; the package\'s metadata names Stanford University School of Medicine as copyright holder. Gom Jabbar is not affiliated with or endorsed by Stanford University or CHOIR.',
    'References: Scherrer KH et al., "Development and validation of the Collaborative Health Outcomes Information Registry body map", PAIN Reports 2021;6(1):e880, doi:10.1097/PR9.0000000000000880. Cramer E et al., "CHOIRBM: An R package for exploratory data analysis and interactive visualization of pain patient body map data", PLOS Computational Biology 2022, doi:10.1371/journal.pcbi.1010496.',
  ].join('\n\n')
  return { name: 'CHOIRBM', version: '(body map outlines, scripts/choir)', license: 'MIT', text: `${credit}\n\n${mit.trim()}` }
}

const escape = (t: string) => t.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const anchor = (name: string) => name.replace(/^@/, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase()

/** A plain page like `privacy-policy.html` and `terms-of-service.html`: the same top line, each licence as written. */
export function renderNotices(notices: Notice[]): string {
  const unique = [...new Map(notices.map((n) => [n.name, n])).values()].sort((a, b) => a.name.localeCompare(b.name))
  const sections = unique.map((n) => `<h2 id="${anchor(n.name)}">${escape(`${n.name} ${n.version} — ${n.license}`)}</h2>\n<pre>${escape(n.text)}</pre>`)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Gom Jabbar · Open source licences</title>
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<style>
  :root { color-scheme: light dark; }
  body { max-width: 40rem; margin: 0 auto; padding: 16px; font: 17px/1.55 system-ui, sans-serif; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; }
</style>
</head>
<body>
<p id="en"><a href="./">Gom Jabbar</a> · <a href="privacy-policy.html">Privacy policy</a> · <a href="terms-of-service.html">Terms of service</a> · <strong>Open source licences</strong> · <a href="#it">Italiano</a></p>
<h1>Open source licences</h1>
<p>Gom Jabbar: © 2026 Paolo Brasolin, under the <a href="https://interoperable-europe.ec.europa.eu/collection/eupl/eupl-text-eupl-12">EUPL-1.2</a> (<a href="https://github.com/paolobrasolin/gom-jabbar">source code</a>). Below, the third-party code and data shipped in the app, each under its own licence.</p>
<div lang="it" id="it">
<p><a href="./">Gom Jabbar</a> · <a href="privacy-policy.html#it">Informativa sulla privacy</a> · <a href="terms-of-service.html#it">Termini d'uso</a> · <strong>Licenze open source</strong> · <a href="#en">English</a></p>
<h1>Licenze open source</h1>
<p>Gom Jabbar: © 2026 Paolo Brasolin, sotto la <a href="https://interoperable-europe.ec.europa.eu/collection/eupl/eupl-text-eupl-12">EUPL-1.2</a> (<a href="https://github.com/paolobrasolin/gom-jabbar">codice sorgente</a>). Qui sotto il codice e i dati di terzi inclusi nell'app, ciascuno con la sua licenza; i testi delle licenze sono in inglese.</p>
</div>
${sections.join('\n')}
</body>
</html>
`
}

