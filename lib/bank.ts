// Swappable bank for office gambling. All money is virtual moose bucks.
//
// Every mutation writes exactly one signed bank_transactions row inside the
// CALLER's better-sqlite3 transaction (lib/gamble.ts owns the transactions),
// so SUM(amount) per account always reconciles to the balance.
//
// The central bank is the Alces Bookie API (lib/alcesBank.ts) — "bank is the
// truth". The SQLite ledger remains the gambling engine's bookkeeping, and
// every PLAYER movement is mirrored out as a real house<->player transfer via
// the bank_sync outbox (drained asynchronously; retries until done). A
// central-office bank API only needs to implement BankProvider — call sites
// in lib/gamble.ts and the routes don't change.

import db from './db';
import {
  AlcesBankError,
  alcesBalance,
  alcesConfig,
  alcesMirrorEnabled,
  listAlcesBalances,
  registerAlcesUser,
  transferAlces,
} from './alcesBank';

export { alcesMirrorEnabled };

export class BankError extends Error {
  constructor(message: string, public code: string) {
    super(message);
  }
}

/** Reference for a ledger row: what it was for, and which entity it belongs to. */
export interface BankRef {
  /** Ledger category, e.g. 'bet_stake', 'challenge_fee', 'gambler_payout'. */
  type: string;
  /** Bet id or gamble match id, where applicable. */
  id?: number | null;
  memo?: string;
}

export interface BankProvider {
  getBalance(playerId: number): number;
  getHouseBalance(): number;
  ensureAccount(playerId: number): void;
  /** Negative amount = debit. Caller owns the transaction. */
  credit(playerId: number | null, amount: number, ref: BankRef): void;
  /**
   * Debit (positive amount) without an over-balance check — caller has
   * already verified funds. Caller owns the transaction.
   */
  debit(playerId: number | null, amount: number, ref: BankRef): void;
  /** Debit with insufficient-funds guard. Throws BankError — caller owns the transaction. */
  debitChecked(playerId: number | null, amount: number, ref: BankRef): void;
  listTransactions(playerId: number | null, limit?: number): BankTransactionRow[];
}

export interface BankTransactionRow {
  id: number;
  ref_type: string;
  ref_id: number | null;
  player_id: number | null;
  amount: number;
  memo: string | null;
  created_at: string;
}

const selectBalance = db.prepare(`SELECT balance FROM bank_accounts WHERE player_id = ?`);
const selectHouseBalance = db.prepare(`SELECT balance FROM bank_house WHERE id = 1`);

function writeLedger(playerId: number | null, amount: number, ref: BankRef): void {
  const result = db.prepare(`
    INSERT INTO bank_transactions (ref_type, ref_id, player_id, amount, memo)
    VALUES (?, ?, ?, ?, ?)
  `).run(ref.type, ref.id ?? null, playerId, amount, ref.memo ?? null);
  // Player movements mirror to the central bank as real transfers (outbox).
  // House-only rows (house_fee, pot_house_cut, house_loss) stay local — the
  // house bank user implicitly collects fees + stakes as its remote balance.
  if (playerId !== null && alcesMirrorEnabled()) {
    db.prepare(`
      INSERT INTO bank_sync (transaction_id, status) VALUES (?, 'pending')
    `).run(result.lastInsertRowid);
  }
}

function adjustAccount(playerId: number, delta: number): void {
  const row = selectBalance.get(playerId) as { balance: number } | undefined;
  if (!row) {
    // Account created lazily with the default seed balance; delta applied on top.
    db.prepare(`
      INSERT INTO bank_accounts (player_id, balance) VALUES (?, ?)
      ON CONFLICT(player_id) DO UPDATE SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP
    `).run(playerId, seedBalance() + delta, delta);
    return;
  }
  db.prepare(`
    UPDATE bank_accounts SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE player_id = ?
  `).run(delta, playerId);
}

function adjustHouse(delta: number): void {
  db.prepare(`
    UPDATE bank_house SET balance = balance + ? WHERE id = 1
  `).run(delta);
}

/**
 * SQLite-backed BankProvider. player_id === null means the house account
 * (ledger rows store NULL player_id for house activity).
 */
/**
 * Mock (offline) mode mints each player 1000 locally — that IS the smoke-test
 * economy. With the central Alces bank no local mint exists: balances live on
 * the bank, so an unlinked/no-row account is simply zero.
 */
export function seedBalance(): number {
  return alcesMirrorEnabled() ? 0 : 1000;
}

const sqliteBank: BankProvider = {
  getBalance(playerId: number): number {
    const row = selectBalance.get(playerId) as { balance: number } | undefined;
    return row?.balance ?? seedBalance(); // default seed balance for unseen players
  },

  getHouseBalance(): number {
    const row = selectHouseBalance.get() as { balance: number } | undefined;
    return row?.balance ?? 0;
  },

  ensureAccount(playerId: number): void {
    db.prepare(`
      INSERT OR IGNORE INTO bank_accounts (player_id, balance) VALUES (?, ?)
    `).run(playerId, seedBalance());
  },

  credit(playerId: number | null, amount: number, ref: BankRef): void {
    if (amount <= 0) throw new BankError(`credit must be positive (got ${amount})`, 'bad_amount');
    writeLedger(playerId, amount, ref);
    if (playerId === null) adjustHouse(amount);
    else adjustAccount(playerId, amount);
  },

  debit(playerId: number | null, amount: number, ref: BankRef): void {
    if (amount <= 0) throw new BankError(`debit must be positive (got ${amount})`, 'bad_amount');
    writeLedger(playerId, -amount, ref);
    if (playerId === null) adjustHouse(-amount);
    else adjustAccount(playerId, -amount);
  },

  debitChecked(playerId: number | null, amount: number, ref: BankRef): void {
    const balance = playerId === null ? sqliteBank.getHouseBalance() : sqliteBank.getBalance(playerId);
    if (balance < amount) {
      throw new BankError(`insufficient funds: balance ${balance} < ${amount}`, 'insufficient_funds');
    }
    sqliteBank.debit(playerId, amount, ref);
  },

  listTransactions(playerId: number | null, limit = 50): BankTransactionRow[] {
    if (playerId === null) {
      return db.prepare(`
        SELECT id, ref_type, ref_id, player_id, amount, memo, created_at
        FROM bank_transactions
        WHERE player_id IS NULL
        ORDER BY id DESC LIMIT ?
      `).all(limit) as BankTransactionRow[];
    }
    return db.prepare(`
      SELECT id, ref_type, ref_id, player_id, amount, memo, created_at
      FROM bank_transactions
      WHERE player_id = ?
      ORDER BY id DESC LIMIT ?
    `).all(playerId, limit) as BankTransactionRow[];
  },
};

export function getBank(): BankProvider {
  return sqliteBank;
}

// ============================================================
// Alces Bookie linking + outbox draining ("bank is the truth")
// ============================================================

export interface LinkedAccountInfo {
  player_id: number;
  bank_username: string | null;
  bank_linked_at: string | null;
  balance: number;
}

/** The player's central-bank account, WITHOUT the password (never leaves the server). */
export function getLinkedAccount(playerId: number): LinkedAccountInfo | null {
  const row = db.prepare(`
    SELECT player_id, bank_username, bank_linked_at, balance
    FROM bank_accounts WHERE player_id = ?
  `).get(playerId) as LinkedAccountInfo | undefined;
  return row ?? null;
}

/** Does this player hold a registered Alces Bookie account? */
export function isBankLinked(playerId: number): boolean {
  const row = db.prepare(`SELECT bank_username FROM bank_accounts WHERE player_id = ?`)
    .get(playerId) as { bank_username: string | null } | undefined;
  return !!row?.bank_username;
}

/** Guard for gambling actions that move money — callers translate the code. */
export function assertBankLinked(playerId: number): void {
  if (!alcesMirrorEnabled()) return; // offline/mock mode: local bank serves everyone
  if (!isBankLinked(playerId)) {
    throw new BankError(
      'You need to register your Alces Bookie account before betting moose bucks',
      'bank_not_linked',
    );
  }
}

/**
 * Register (action 'create') or connect (action 'link') a player's Alces
 * Bookie account and record their credentials for future transfers.
 * 'create' proves itself by the bank minting the user; 'link' is trusted to
 * work (no credential probe). Returns the account's real (bank-side) balance.
 */
export async function linkBankAccount(
  playerId: number,
  action: 'create' | 'link',
  username: string,
  password: string,
): Promise<{ balance: number }> {
  if (!alcesMirrorEnabled()) {
    throw new BankError('Central bank is not configured', 'bank_disabled');
  }
  await ensureAlcesHouse();

  if (action === 'create') {
    await registerAlcesUser(username, password); // 409 already_taken surfaces to the user
  }
  // No credential-test handshake: the API is trusted as working — a wrong
  // password surfaces naturally on the first real transfer as a failed sync.

  const balance = (await alcesBalance(username)) ?? 0;
  db.prepare(`
    INSERT INTO bank_accounts (player_id, balance, bank_username, bank_password, bank_linked_at, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(player_id) DO UPDATE SET
      balance = excluded.balance, bank_username = excluded.bank_username,
      bank_password = excluded.bank_password, bank_linked_at = excluded.bank_linked_at,
      updated_at = CURRENT_TIMESTAMP
  `).run(playerId, balance, username, password);
  return { balance };
}

/** Disconnect the site player from their central-bank account (keeps the player). */
export function unlinkBankAccount(playerId: number): void {
  db.prepare(`
    UPDATE bank_accounts
    SET bank_username = NULL, bank_password = NULL, bank_linked_at = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE player_id = ?
  `).run(playerId);
}

/**
 * Boot-time bookie assets: register the site's house user on the central
 * bank if it doesn't exist (registration mints it 500 — that IS our reserve).
 */
let houseReady: Promise<void> | null = null;
export function ensureAlcesHouse(): Promise<void> {
  if (!houseReady) {
    houseReady = (async () => {
      if (!alcesMirrorEnabled()) return;
      // The house registers once-ever: the flag persists in settings so we
      // never re-POST the registration on later drains (the bank would only
      // 409 it, but each attempt is traffic the down/shared API shouldn't
      // see). Clear 'alces_house_registered' in settings to force a re-probe.
      if (db.prepare(`SELECT value FROM settings WHERE key = 'alces_house_registered'`)
        .get() as { value: string } | undefined) return;
      const { houseUser, housePassword } = alcesConfig();
      if (!housePassword) throw new BankError('No house password available', 'bank_disabled');
      try {
        await registerAlcesUser(houseUser, housePassword);
      } catch (e) {
        if (!(e instanceof AlcesBankError && e.code === 'already_taken')) throw e;
      }
      db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('alces_house_registered', '1')`).run();
    })().catch(e => {
      // Don't cache the failure: one bank outage must not poison every later
      // link/sync attempt until a server restart. Clear and let it retry.
      houseReady = null;
      throw e;
    });
  }
  return houseReady;
}

/** Ledger rows still waiting to reach (or that failed to reach) the central bank. */
export function bankSyncBacklog(): { pending: number; failed: number } {
  const row = db.prepare(`
    SELECT SUM(status = 'pending') as pending, SUM(status = 'failed') as failed
    FROM bank_sync
  `).get() as { pending: number | null; failed: number | null };
  return { pending: row.pending ?? 0, failed: row.failed ?? 0 };
}

interface SyncJob {
  id: number;
  transaction_id: number;
  attempts: number;
}

let draining = false;

/** A job is considered burnt after this many failed transfers; it stays
 *  'failed' for a manual/admin reset instead of hammering the bank forever. */
const MAX_SYNC_ATTEMPTS = 10;

/** Push queued movements to the central bank. Fire-and-forget; never throws. */
export async function drainBankSync(): Promise<void> {
  if (!alcesMirrorEnabled() || draining) return;
  draining = true;
  try {
    await ensureAlcesHouse();
    const { houseUser, housePassword } = alcesConfig();
    if (!housePassword) return;
    for (;;) {
      const jobs = db.prepare(`
        SELECT id, transaction_id, attempts FROM bank_sync
        WHERE status IN ('pending', 'failed') AND attempts < ${MAX_SYNC_ATTEMPTS}
        ORDER BY id LIMIT 25
      `).all() as SyncJob[];
      if (!jobs.length) break;
      const ledger = db.prepare(`
        SELECT player_id, amount FROM bank_transactions WHERE id = ?
      `);
      // Each job is tried AT MOST ONCE per drain. If this batch made no
      // progress (all failures — e.g. bank errors the breaker doesn't catch),
      // stop: retrying in a tight loop would hammer the bank's API.
      let progress = false;
      for (const job of jobs) {
        const tx = ledger.get(job.transaction_id) as { player_id: number; amount: number } | undefined;
        const account = tx
          ? db.prepare(`SELECT bank_username, bank_password FROM bank_accounts WHERE player_id = ?`)
              .get(tx.player_id) as { bank_username: string | null; bank_password: string | null } | undefined
          : undefined;
        try {
          if (!tx || !account?.bank_username || !account.bank_password) {
            throw new BankError('Player bank account unregistered', 'bank_not_linked');
          }
          if (tx.amount < 0) {
            // Debit: player pays the exact ledgered amount to the house.
            await transferAlces({
              fromUser: account.bank_username, fromPassword: account.bank_password,
              toUser: houseUser, amount: -tx.amount, viaService: true,
            });
          } else {
            // Credit: the house pays the player.
            await transferAlces({
              fromUser: houseUser, fromPassword: housePassword,
              toUser: account.bank_username, amount: tx.amount, viaService: true,
            });
          }
          db.prepare(`UPDATE bank_sync SET status = 'done', error = NULL WHERE id = ?`).run(job.id);
          progress = true;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          db.prepare(`
            UPDATE bank_sync SET status = 'failed', attempts = attempts + 1, error = ? WHERE id = ?
          `).run(msg, job.id);
          // One hard stop per drain on connection trouble so a bank outage
          // doesn't burn 25 failed attempts in a second — they retry on the
          // next kick.
          if (e instanceof AlcesBankError && e.code === 'unreachable') return;
        }
      }
      if (!progress) break;
    }
    await reconcileAlcesBalances();
  } finally {
    draining = false;
  }
}

/** Fire-and-forget drainer kick. Nothing to move → no traffic at all. */
export function kickBankSync(): void {
  const backlog = bankSyncBacklog();
  if (backlog.pending === 0 && backlog.failed === 0) return;
  void drainBankSync().catch(e => console.error('bank sync:', e));
}

/**
 * "Bank is the truth": once every movement has drained, snap the local
 * projections onto the real bank-side balances — it absorbs the bank's 2%
 * receipt skim and any spending done outside this site. The house pot
 * (bank_house) is engine bookkeeping and stays local.
 */
export async function reconcileAlcesBalances(): Promise<void> {
  if (!alcesMirrorEnabled()) return;
  const backlog = bankSyncBacklog();
  if (backlog.pending > 0 || backlog.failed > 0) return;
  let balances: Map<string, number>;
  try {
    balances = await listAlcesBalances();
  } catch {
    return; // unreachable right now — try again on the next drain
  }
  const rows = db.prepare(`
    SELECT player_id, balance, bank_username FROM bank_accounts
    WHERE bank_username IS NOT NULL
  `).all() as { player_id: number; balance: number; bank_username: string }[];
  const update = db.prepare(`
    UPDATE bank_accounts SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE player_id = ?
  `);
  for (const row of rows) {
    const truth = balances.get(row.bank_username);
    if (truth !== undefined && Math.abs(truth - row.balance) > 0.004) {
      update.run(truth, row.player_id);
    }
  }
  // The house pot includes everything players actually paid in — entry fees,
  // stakes, and the house user's own mint on the central bank. With the queue
  // clear, snap bank_house onto that central truth so payout/bet caps use the
  // REAL bank holdings (a fresh reset otherwise shows a 0 pot and blocks bets).
  const houseUser = alcesConfig().houseUser;
  const houseTruth = balances.get(houseUser);
  if (houseTruth !== undefined && Math.abs(houseTruth - sqliteBank.getHouseBalance()) > 0.004) {
    db.prepare(`UPDATE bank_house SET balance = ? WHERE id = 1`).run(houseTruth);
  }
}