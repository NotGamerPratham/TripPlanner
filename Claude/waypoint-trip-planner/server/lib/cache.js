// Tiny in-memory TTL cache with in-flight de-duplication, so the live-data
// endpoints and the AI planner can request the same upstream data concurrently
// without hitting the free public APIs twice.

const MAX_ENTRIES = 500;
const store = new Map(); // key -> { value, expires }
const inflight = new Map(); // key -> Promise

export async function cached(key, ttlMs, producer) {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  if (inflight.has(key)) return inflight.get(key);

  const promise = (async () => {
    try {
      const value = await producer();
      store.set(key, { value, expires: Date.now() + ttlMs });
      if (store.size > MAX_ENTRIES) store.delete(store.keys().next().value);
      return value;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
