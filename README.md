# Gom Jabbar

Chronic pain diary. Installable web app, no backend, data stays on the phone. See [SPEC.md](SPEC.md).

```sh
npm install
npm run dev        # http://localhost:5173, also on the LAN
npm test           # vitest
npm run check      # svelte-check + tsc
npm run build      # static bundle in dist/
```

Deploys to GitHub Pages on every push to `main` (`.github/workflows/deploy.yml`). Enable Pages with source "GitHub Actions" in the repo settings once.
