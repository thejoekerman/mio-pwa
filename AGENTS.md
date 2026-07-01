# MioLog App

Local-first games library and play journal. Think "Goodreads for games" with a focus on personal playthroughs.

## What it is
- **Purpose:** Track your game library, play sessions, and journeys through games
- **User-facing:** Call it "app" or "web app", not "PWA"
- **Offline-first:** Full functionality without a server

## Core Abstractions
- **Game** — Canonical metadata (title, year, developers, genres, cover, etc.)
- **Journey** — A playthrough, replay, or intention. Owns status, platform, rating, review, playtime, dates, and logs
- **Log** — Play session notes. Belongs to a Journey, not directly to a Game

Every Game has at least one Journey. Replays create new Journeys.

## Tech Stack
- Vue 3 + TypeScript + Vite
- Vuetify for UI
- Dexie.js / IndexedDB for local persistence
- Service worker with careful update handling (no auto `skipWaiting()`)

## Development
Everything runs in Docker. **No host tooling installed.**

```bash
make dev      # Dev server at localhost:5173
make test     # Lint, typecheck, 317 unit tests
make frontend-build  # Production build
```

## Sync
- Optional: connects to MioServer via Sync API v2
- API version advertised at `/api/me` — App blocks sync with v1 servers
- Conflict policy: last-write-wins by `updatedAt`

## Memory
Extended context in `memory/`:
- `01-ecosystem.md` — Project shape and release state
- `02-model.md` — Games, Journeys, Logs data model
- `03-persistence.md` — IndexedDB, migrations, backups
- `04-sync.md` — Sync API v2 contract
- `05-metadata.md` — Metadata assistance and covers
- `06-ux.md` — Product and UX decisions
- `07-review.md` — Review drafting and recommendations
- `08-verification.md` — Dev commands and verification
- `09-release.md` — Durable release notes

## Sister Repos
- `mio-server/` — Optional self-hosted backend
- `games-backlog/` — Marketing site (this repo has no app source)
