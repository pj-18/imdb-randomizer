/**
 * Watched-state persistence.
 *
 * Keyed on the IMDb `tt…` id rather than an array index, so regenerating movies.json
 * (which reorders entries) can never scramble someone's saved progress.
 *
 * Clearing browser data removes the key, which resets counts to 0/250 — the requested behavior.
 */

const KEY = 'imdbRandomizer.watched.v1';

/**
 * localStorage throws in Safari private mode and when a browser blocks site data
 * entirely, so every access is guarded. On failure we degrade to an in-memory map:
 * the page keeps working for the session, it just does not persist across reloads.
 */
let memoryFallback = null;

function readStore() {
  if (memoryFallback) return memoryFallback;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    memoryFallback = {};
    return memoryFallback;
  }
}

function writeStore(store) {
  if (memoryFallback) {
    memoryFallback = store;
    return;
  }
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Quota exceeded or storage disabled — keep going in memory.
    memoryFallback = store;
  }
}

export function isPersistent() {
  return memoryFallback === null;
}

/** @returns {Map<string, number>} watched id -> timestamp marked. */
export function loadWatched() {
  return new Map(Object.entries(readStore()));
}

export function markWatched(id) {
  const store = readStore();
  store[id] = Date.now();
  writeStore(store);
}

export function unmarkWatched(id) {
  const store = readStore();
  delete store[id];
  writeStore(store);
}
