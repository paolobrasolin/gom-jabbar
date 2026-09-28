/**
 * Third-party notices for `licenses.txt` (#35): every package whose code ends up in the app, with its licence text,
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

const RULE = '='.repeat(72)

export function renderNotices(notices: Notice[]): string {
  const unique = [...new Map(notices.map((n) => [n.name, n])).values()].sort((a, b) => a.name.localeCompare(b.name))
  const head = [
    'Gom Jabbar',
    'Copyright © 2026 Paolo Brasolin. Licensed under the EUPL-1.2: no warranty and, as far as the law allows, no liability.',
    'Source and licence text: https://github.com/paolobrasolin/gom-jabbar',
    '',
    'Third-party software and data shipped with the app, each under its own licence:',
  ]
  const sections = unique.map((n) => [RULE, `${n.name} ${n.version} — ${n.license}`, '-'.repeat(72), n.text].join('\n'))
  return [head.join('\n'), ...sections].join('\n\n') + '\n'
}
