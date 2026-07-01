# Sync API V2

- MioServer is optional. The App remains complete and useful without it.

## Versioning

- `/api/me` advertises `version: 2`; the App blocks sync with v1 servers.

## Entities

- Sync entities are canonical Games, Journeys, Journey-owned logs, and earned Trophies.

## Flow

- **First sync** to a server/account is a full reconciliation.
- **Ordinary sync** is incremental:
  - the App sends only records in its local outbox
  - the App sends its last per-server/user cursor
  - MioServer returns records changed after that cursor
- MioServer assigns monotonically increasing per-user revisions to accepted changes and returns the newest cursor.
- Sync applies Games, then Journeys, then Logs in one transaction.

## Conflict Resolution

- Conflict policy is entity-level last-write-wins by `updatedAt`.
- Submitted records are acknowledged and returned authoritatively even when the server copy wins, allowing stale clients to correct themselves.
- Tombstones are synced so deletions reach offline devices.
- Server identity is normalized API URL plus authenticated user ID.

## Deployment Note

- Deploy MioServer before an incompatible App sync release. Old Apps do not have the v2 guard; avoid syncing during the brief deployment gap.
