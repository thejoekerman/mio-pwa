# Local Persistence and Migration

## Source of Truth

- IndexedDB/Dexie is the App's source of truth.

## Migration

- Existing 2.x browser data migrates automatically to canonical Games, deterministic initial Journeys, and Journey-owned logs.
- The deterministic initial Journey ID is: `{gameId}:initial-journey`.

## Backup Formats

- **JSON backup** is the complete migration/restore format and preserves Games, Journeys, logs, and earned Trophies.
- Legacy JSON backups remain importable and are migrated into initial Journeys.

- **CSV** is deliberately simpler: for one-time spreadsheet library import and game-list export, not full-fidelity migration or Journey history.
- CSV keeps the approachable legacy headers: `title,status,platform,rating,playTimeHours,finishedDate,coverUrl,mioId`.
- Only `title` is required; status normalization is intentionally friendly.
