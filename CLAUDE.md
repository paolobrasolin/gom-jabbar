# Gom Jabbar — notes for agent sessions

Installable pain diary PWA (Svelte 5, Vite, Dexie), Italian first, for one Android user. `SPEC.md` is the source of truth for behaviour: update it when behaviour changes. `CHECKLIST.md` is the manual phone pass before telling anyone to update.

## Commands
`npm run check` (svelte-check + tsc), `npm test` (vitest), `npm run build`, `npm run size` (150 KB gzipped JS gate). `nix build` runs all four in the sandbox and leaves the Pages bundle in `result/`; CI does exactly that on every push; a push to `main` also deploys to GitHub Pages, so work on `development` and merge into `main` to release (`CHECKLIST.md` has the steps; never edit `version` in `package.json` by hand, `npm version` does it and tags). The Settings version label is `package.json` version + short commit hash, baked in by `vite.config.ts` from `GIT_REV` (set by the flake) or `git rev-parse`. The dev shell comes from `flake.nix` via direnv (`.envrc`). Dependencies are read from `package-lock.json` by `importNpmLock`, so a lockfile change needs no hash update. `npm test` can print all green and still exit non-zero on unhandled errors: check the exit code, not the summary line. `nix build` only sees files git tracks: `git add` new files before trusting it, or a new test silently does not run.

## Conventions and traps
- Anything handed to Dexie must be a plain object. Svelte `$state` deep proxies cannot be structured-cloned by IndexedDB. Live-query results (`lib/live.svelte.ts`) and objects that flow back to the db use `$state.raw`; form drafts are copied via spreads in `lib/draft.ts`.
- Body region ids (`lib/regions.ts`) are stored in user data. Add regions, never rename or remove them.
- Every i18n key must exist in both `src/i18n/it.json` and `en.json` (a test enforces it). Italian first, terse, informal.
- No confirmation dialogs anywhere. Destructive actions get an undo toast (`lib/toast.svelte.ts`).
- Schema change: follow "User data is never lost" below, no exceptions.
- No chart or UI libraries. Charts and the body map are hand-written SVG; colours come from the intensity ramp in `lib/color.ts`.
- jsdom lacks `scrollTo` and `matchMedia`: guard or avoid them in code that runs under tests.

## Verifying UI
Screenshot in Pixel 7 emulation with `playwright-core` using the installed Chrome (`chromium.launch({ channel: 'chrome' })`) against `npm run preview`. Block service workers in the context. Seed data through the app's own Settings → Importa with the output of `node scripts/seed.mjs`. Do not use Chrome's `--screenshot` flag: it hangs and its minimum window width fakes overflow bugs. Playwright download paths have no extension; `saveAs` before opening a downloaded file.

## Tests come first
- Write the failing test before the code: every change in `lib/`, every user-visible behaviour in a screen or component, and every bug fix starts with a test that reproduces it. Red, green, then tidy.
- `npm test` runs with coverage and fails below the thresholds in `vite.config.ts`. They are a ratchet: raise them when coverage grows, never lower them, and raise them in the same commit that grows coverage. `npm run coverage` writes an HTML report to `coverage/`.
- Component tests use Testing Library against the real Dexie on `fake-indexeddb`, not mocks of `lib/`. Screens with no test are debt, not a choice.

## User data is never lost
The app owns the only copy of a person's medical diary. Every schema or export change follows this protocol.

1. **Freeze the version you are leaving.** Before touching `lib/db.ts` or `EXPORT_VERSION`, make sure `src/test/fixtures/db-vN.json` (rows as stored under Dexie version N) and `export-vN.json` (a backup written by export version N) exist and cover every field and edge case: episodes with history, ongoing, full body, several areas, pain 0, custom and disabled vocabulary, a sparse entry.
2. **Write the transformation down.** Add the N → N+1 rule to `UPGRADES` in `lib/migrations.test.ts`. That test pushes every fixture of every past version through today's code and requires every field to arrive intact except what the rule says. A version without a fixture fails the guard test.
3. **Convert, never drop.** An upgrade may delete a field only after writing its replacement. Fields the code does not know about pass through Dexie upgrades and `parseImport` untouched; a test enforces it for import.
4. **Export → import → export is the identity.** The migration test checks it; keep it true.
5. **Dexie upgrades are one transaction.** If an upgrade throws, the database stays at the old version with the data intact. Never catch inside an upgrade function, never write partial results.
6. `clear()`, `delete()` and bulk overwrites on user tables happen only in `applyImport('replace')`, which snapshots for undo, and in the delete paths that already have an undo toast. Nowhere else.
7. `parseImport` accepts every export version ever written. `EXPORT_VERSION` is bumped only when the export shape changes.
