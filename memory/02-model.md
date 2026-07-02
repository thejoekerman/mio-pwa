# MioLog 3.0 Model

MioLog tracks stable Games and the personal Journeys taken through them.

## Game

Canonical library metadata:
- title, release year, developers, publishers, genres, themes, game modes, tags, cover, external references, and optional playtime estimates.

## Journey

A playthrough, copy, or intention to play:
- status, platform, ownership, priority, rating, review, playtime
- started/finished dates, pause/nudge dates, and logs

## Relationships

- Logs belong to a Journey, not directly to a Game.
- Every Game has at least one Journey.
- Starting a replay creates another Journey and preserves previous completions, reviews, ratings, and logs.
- `Replaying` is a derived display state: a Game has a finished Journey and a current active Journey.
- Rating and review belong to each Journey. There is no separate Game-level review.

## Aggregation

- Game Detail can select historical Journeys and aggregate all Journey logs.
- Stats and Wrapped distinguish unique Games, finished Journeys, and replays.
- Backlog recommendations exclude Games with active Journeys and use finished Journeys as taste signals.
