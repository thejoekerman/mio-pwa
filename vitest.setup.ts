// Polyfills `indexedDB`/`IDBFactory`/etc. onto `globalThis` so tests that
// exercise Dexie (e.g. the sync integration test) hit a real in-memory IDB.
// Tests that don't touch IndexedDB are unaffected.
import 'fake-indexeddb/auto'
