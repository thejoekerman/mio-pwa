# MioLog PWA

This is a source-available reference copy of the [MioLog PWA](https://app.miolog.net/) frontend.

It exists so people can inspect the browser-side code that handles local data,
backups, sync requests, service worker behavior, and optional AI feature calls.
It is not the private production/deployment repository and does not include the
Mio-specific art assets, website, deployment wiring, or project memory files.

## Run Locally

Use ordinary frontend tooling:

```bash
npm install
npm run dev
```

The local app is served by Vite, usually at:

```text
http://localhost:5173
```

Build:

```bash
npm run build
```

[Mio Server](https://github.com/thejoekerman/mio-server) is optional. If you run a compatible server, configure its sync API
base URL and token in the app settings.

## License

PolyForm Strict License 1.0.0
