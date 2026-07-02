# MioLog Ecosystem

Last refreshed: 2026-06-26

## Project Shape

- MioLog is a warm, personal, local-first games library and play journal.
- Public/user-facing copy should generally say "app" or "web app", not "PWA".
- The official App repo is public: `https://github.com/thejoekerman/mio-pwa`
- The optional self-hostable backend: `https://github.com/thejoekerman/mio-server`
- Everything is Docker-first. Keep Node, npm, PHP, Composer off the host.
- Use each repository's Makefile and Docker containers.

## Current Release State

- MioLog App `3.2.1` was built and deployed on 2026-06-26.
- MioServer 3 with sync API v2 was deployed before the App on 2026-06-14.
- Production sync has worked correctly since deployment.
- The App and MioServer worktrees were clean after the release commits.
- `mio-pwa/3_0_PLAN.md` is an intentionally untracked planning artifact — useful historical context, but its implementation checklist is complete.
