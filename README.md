# Gom Jabbar

Chronic pain diary. Installable web app, no backend, data stays on the phone. See [SPEC.md](SPEC.md).

```sh
npm install
npm run dev        # http://localhost:5173, also on the LAN
npm test           # vitest
npm run check      # svelte-check + tsc
npm run build      # static bundle in dist/
```

`node scripts/seed.mjs` writes a demo export you can load from Settings → Importa to see Trends and the report with data.

Deploys to GitHub Pages on every push to `main` (`.github/workflows/deploy.yml`). Enable Pages with source "GitHub Actions" in the repo settings once.
