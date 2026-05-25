# MioLog PWA

<img src="docs/assets/miolog-chibi.png" alt="MioLog" width="128" />

[MioLog](https://app.miolog.net/) is a local-first games backlog and play-log PWA. It helps you track what
you want to play, what you are playing, what you paused, what you finished, and
the small notes that make a playthrough feel personal.

This repository is the canonical public source for the MioLog PWA frontend. The
app works fully offline with browser-local IndexedDB storage. A compatible [MioServer](https://github.com/thejoekerman/mio-server) 
backend is optional and adds sync, IGDB enrichment, and server-backed
review drafting.

## Local Development

Local development requires Docker:

```bash
make ci
make dev
```

Run `make ci` once after cloning, or again whenever `package-lock.json` changes.
After that, `make dev` starts the Vite dev server in the container.

The app runs at:

```text
http://localhost:5173
```

Useful commands:

```bash
make lint
make test
make frontend-build
make demo-build
```

Or run the Node scripts directly if you manage local Node yourself:

```bash
npm ci
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```

## Docker Image

Release tags publish a static PWA image to GitHub Container Registry:

```text
ghcr.io/thejoekerman/mio-pwa:vX.Y.Z
```

The image serves the Vite build through Nginx and exposes `/healthz` for
container health checks.

## Backend

[MioServer](https://github.com/thejoekerman/mio-server) is optional. If you run a compatible backend, configure the sync API
base URL and token in the app Settings screen. For local development, the common
backend URL is:

```text
http://localhost:8000
```

## License and Trademarks

The source code is licensed under AGPL-3.0-or-later. See [LICENSE](./LICENSE).

The MioLog name, logos, Mio/Mio-chan character assets, and official service
identity are trademarks/brand assets of the project owner. Forks are welcome
under the software license, but they must not imply they are the official MioLog
app or service. See [TRADEMARKS.md](./TRADEMARKS.md).
