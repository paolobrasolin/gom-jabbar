# Gom Jabbar

[![Deploy](https://github.com/paolobrasolin/gom-jabbar/actions/workflows/deploy.yml/badge.svg)](https://github.com/paolobrasolin/gom-jabbar/actions/workflows/deploy.yml)
[![Version](https://img.shields.io/github/v/tag/paolobrasolin/gom-jabbar?label=version&sort=semver)](https://github.com/paolobrasolin/gom-jabbar/tags)
[![Licence](https://img.shields.io/github/license/paolobrasolin/gom-jabbar)](LICENSE)

Chronic pain diary. Installable web app, no backend: the data stays on the phone, with an optional backup to the person's own Google Drive. See [SPEC.md](SPEC.md). Deployed at https://gom-jabbar.618.ovh/ (install to the home screen from there).

With [Nix](https://nixos.org) and [direnv](https://direnv.net), `direnv allow` once and the shell gets the pinned Node; `nix build` runs the whole CI (check, tests, build, size gate, licence notices) and leaves the Pages bundle in `result/`. Without Nix, Node 22.18 or later, 23 and 25 excepted (`engines` in `package.json`: Vitest wants 22.12, the seed script's TypeScript imports 22.18).

```sh
npm install
npm run dev        # http://localhost:5173, also on the LAN
npm test           # vitest
npm run check      # svelte-check + tsc
npm run build      # static bundle in dist/
```

`node scripts/seed.mjs` writes a demo export you can load from Settings → Ripristina da file to see Trends and the report with data.

Work happens on `development`, where CI runs `nix build` (`.github/workflows/ci.yml`). Merging into `main` deploys to GitHub Pages (`.github/workflows/deploy.yml`, same build plus the upload). Releases are cut with `npm version minor` or `patch`, see [CHECKLIST.md](CHECKLIST.md). Settings shows the version plus the short commit hash it was built from. Enable Pages with source "GitHub Actions" in the repo settings once.

## Licence

Copyright © 2026 Paolo Brasolin. Licensed under the [European Union Public Licence v. 1.2](LICENSE) (EUPL-1.2), available in every official EU language at <https://interoperable-europe.ec.europa.eu/collection/eupl/eupl-text-eupl-12>. It comes with no warranty and, as far as the law allows, no liability (articles 7 and 8). Third-party code and data shipped in the app keep their own licences, listed in `open-source-licences.html` next to the app.
