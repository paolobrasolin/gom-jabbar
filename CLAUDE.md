# Gom Jabbar — notes for agent sessions

Installable pain diary PWA (Svelte 5, Vite, Dexie), Italian first, for one Android user. `SPEC.md` is the source of truth for behaviour: update it when behaviour changes. `CHECKLIST.md` is the manual phone pass before telling anyone to update.

## Commands
`npm run check` (svelte-check + tsc), `npm test` (vitest), `npm run build`, `npm run size` (150 KB gzipped JS gate). `nix build` runs all four in the sandbox and leaves the Pages bundle in `result/`; CI does exactly that on every push; a push to `main` also deploys to GitHub Pages, so work on `development` and merge into `main` to release (`CHECKLIST.md` has the steps; never edit `version` in `package.json` by hand, `npm version` does it and tags). The Settings version label is `package.json` version + short commit hash, baked in by `vite.config.ts` from `GIT_REV` (set by the flake) or `git rev-parse`. The dev shell comes from `flake.nix` via direnv (`.envrc`). Dependencies are read from `package-lock.json` by `importNpmLock`, so a lockfile change needs no hash update. `npm test` can print all green and still exit non-zero on unhandled errors: check the exit code, not the summary line.

## Conventions and traps
- Anything handed to Dexie must be a plain object. Svelte `$state` deep proxies cannot be structured-cloned by IndexedDB. Live-query results (`lib/live.svelte.ts`) and objects that flow back to the db use `$state.raw`; form drafts are copied via spreads in `lib/draft.ts`.
- Body region ids (`lib/regions.ts`) are stored in user data. Add regions, never rename or remove them.
- Every i18n key must exist in both `src/i18n/it.json` and `en.json` (a test enforces it). Italian first, terse, informal.
- No confirmation dialogs anywhere. Destructive actions get an undo toast (`lib/toast.svelte.ts`).
- Schema change: bump the Dexie version in `lib/db.ts` with an upgrade function and a migration test; keep `parseImport` in `lib/backup.ts` accepting older export files, bump `EXPORT_VERSION` only if the export shape changes.
- No chart or UI libraries. Charts and the body map are hand-written SVG; colours come from the intensity ramp in `lib/color.ts`.
- jsdom lacks `scrollTo` and `matchMedia`: guard or avoid them in code that runs under tests.

## Verifying UI
Screenshot in Pixel 7 emulation with `playwright-core` using the installed Chrome (`chromium.launch({ channel: 'chrome' })`) against `npm run preview`. Block service workers in the context. Seed data through the app's own Settings → Importa with the output of `node scripts/seed.mjs`. Do not use Chrome's `--screenshot` flag: it hangs and its minimum window width fakes overflow bugs. Playwright download paths have no extension; `saveAs` before opening a downloaded file.

## Tests come first
- Write the failing test before the code: every change in `lib/`, every user-visible behaviour in a screen or component, and every bug fix starts with a test that reproduces it. Red, green, then tidy.
- `npm test` runs with coverage and fails below the thresholds in `vite.config.ts`. They are a ratchet: raise them when coverage grows, never lower them, and raise them in the same commit that grows coverage. `npm run coverage` writes an HTML report to `coverage/`.
- Component tests use Testing Library against the real Dexie on `fake-indexeddb`, not mocks of `lib/`. Screens with no test are debt, not a choice.

