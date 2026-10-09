// Swappable bank for office gambling. All money is virtual moose bucks.
//
// Every mutation writes exactly one signed bank_transactions row inside the
// CALLER's better-sqlite3 transaction (lib/gamble.ts owns the transactions),
// so SUM(amount) per account always reconciles to the balance. A future
// central-office bank API only needs to implement BankProvider — call sites
// in lib/gamble.ts and the routes don't change.

import db from './db';

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
  db.prepare(`
    INSERT INTO bank_transactions (ref_type, ref_id, player_id, amount, memo)
    VALUES (?, ?, ?, ?, ?)
  `).run(ref.type, ref.id ?? null, playerId, amount, ref.memo ?? null);
}

function adjustAccount(playerId: number, delta: number): void {
  const row = selectBalance.get(playerId) as { balance: number } | undefined;
  if (!row) {
    // Account created lazily with the default seed balance; delta applied on top.
    db.prepare(`
      INSERT INTO bank_accounts (player_id, balance) VALUES (?, ?)
      ON CONFLICT(player_id) DO UPDATE SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP
    `).run(playerId, 1000 + delta, delta);
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
const sqliteBank: BankProvider = {
  getBalance(playerId: number): number {
    const row = selectBalance.get(playerId) as { balance: number } | undefined;
    return row?.balance ?? 1000; // default seed balance for unseen players
  },

  getHouseBalance(): number {
    const row = selectHouseBalance.get() as { balance: number } | undefined;
    return row?.balance ?? 0;
  },

  ensureAccount(playerId: number): void {
    db.prepare(`
      INSERT OR IGNORE INTO bank_accounts (player_id, balance) VALUES (?, 1000)
    `).run(playerId);
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