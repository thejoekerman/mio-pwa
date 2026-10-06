# Durable Release Notes

## Service Worker

- App deployments must preserve the service-worker update safeguards:
  - do not call `skipWaiting()` automatically during install
  - let the user accept the update before the waiting worker takes over
  - cache cleanup must preserve WebLLM model caches
  - production builds inject core JavaScript/CSS (including lazy routes and locales) into the install precache; optional WebLLM runtime downloads remain on demand
  - runtime cache refreshes use `event.waitUntil` so cache writes survive delivery of a cached response

## Deployment

- Public App Docker image: `ghcr.io/thejoekerman/mio-pwa`
- MioServer remains optional self-hosted infrastructure
- The official App is the reference client for the sync contract
