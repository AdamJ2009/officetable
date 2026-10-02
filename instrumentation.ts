/**
 * Next.js instrumentation: runs once per server start before the app serves
 * requests. Used to kick off background jobs that have no natural request
 * trigger — like the season-hype scheduler (no cron required).
 */
export async function register() {
  // The hype scheduler needs better-sqlite3, so only run on the Node.js
  // runtime (not Edge middleware, where it would fail to load).
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { startSeasonHypeScheduler } = await import('./lib/seasonHype');
  startSeasonHypeScheduler();
}