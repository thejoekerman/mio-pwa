# Durable Release Notes

## Service Worker

- App deployments must preserve the service-worker update safeguards:
  - do not call `skipWaiting()` automatically during install
  - let the user accept the update before the waiting worker takes over
  - cache cleanup must preserve WebLLM model caches

## Deployment

- Public App Docker image: `ghcr.io/thejoekerman/mio-pwa`
- MioServer remains optional self-hosted infrastructure
- The official App is the reference client for the sync contract
