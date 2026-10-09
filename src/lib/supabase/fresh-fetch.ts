/**
 * fetch for Supabase clients that always reads fresh data. During a page render
 * Next.js reuses the response of an identical earlier GET (request memoization),
 * so a read after a write in the same render could return the old row. Passing
 * a signal opts out of that reuse.
 */
export const freshFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: "no-store", signal: init?.signal ?? new AbortController().signal });
