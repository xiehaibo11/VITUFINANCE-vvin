/**
 * ============================================================================
 * User Balance Utilities (ES Module)
 * ============================================================================
 *
 * Why this exists:
 * - Robot expiry / refunds MUST credit the user's USDT balance reliably.
 * - In production we can have edge cases:
 *   - user_balances row missing (legacy data / admin-created purchases)
 *   - wallet address casing mismatches (0xAbc... vs 0xabc...)
 *
 * This helper centralizes:
 * - wallet normalization
 * - ensuring a user_balances row exists
 * - crediting USDT with basic safety checks
 *
 * NOTE:
 * - We intentionally keep the SQL simple and compatible with existing schema usage
 *   in backend/server.js (usdt_balance/wld_balance/total_deposit/total_withdraw).
 */

/**
 * Normalize an EVM wallet address.
 * We store and query addresses in lowercase to reduce mismatch risk.
 *
 * @param {string} address
 * @returns {string|null} normalized address or null when invalid input
 */
export function normalizeWalletAddress(address) {
  if (!address || typeof address !== 'string') return null;
  const trimmed = address.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

/**
 * Ensure `user_balances` has a row for this wallet.
 *
 * @param {Function} dbQuery - mysql2/promise query wrapper
 * @param {string} walletAddr - normalized wallet address
 * @returns {Promise<void>}
 */
export async function ensureUserBalanceRow(dbQuery, walletAddr) {
  // Insert a default row if missing. Using INSERT IGNORE prevents duplicates.
  await dbQuery(
    `INSERT IGNORE INTO user_balances
      (wallet_address, usdt_balance, wld_balance, total_deposit, total_withdraw, created_at, updated_at)
     VALUES (?, 0, 0, 0, 0, NOW(), NOW())`,
    [walletAddr]
  );
}

/**
 * Credit USDT balance for a wallet address.
 *
 * Safety behavior:
 * - Always attempts to ensure the balance row exists.
 * - If a direct match update affects 0 rows (casing mismatch), retries using LOWER().
 * - Throws if we still cannot update (prevents silently marking robots expired without refund).
 *
 * @param {Function} dbQuery - mysql2/promise query wrapper
 * @param {string} walletAddr - normalized wallet address
 * @param {number} amount - positive number
 * @returns {Promise<void>}
 */
export async function creditUsdtBalance(dbQuery, walletAddr, amount) {
  const creditAmount = Number(amount);
  if (!Number.isFinite(creditAmount) || creditAmount <= 0) {
    throw new Error('Invalid credit amount');
  }
  if (!walletAddr) throw new Error('Invalid wallet address');

  await ensureUserBalanceRow(dbQuery, walletAddr);

  // First attempt: direct match (fast path when stored normalized).
  const result = await dbQuery(
    `UPDATE user_balances
     SET usdt_balance = usdt_balance + ?, updated_at = NOW()
     WHERE wallet_address = ?`,
    [creditAmount, walletAddr]
  );

  if (result?.affectedRows > 0) return;

  // Retry: case-insensitive match (covers legacy casing in DB).
  const retry = await dbQuery(
    `UPDATE user_balances
     SET usdt_balance = usdt_balance + ?, updated_at = NOW()
     WHERE LOWER(wallet_address) = LOWER(?)`,
    [creditAmount, walletAddr]
  );

  if (retry?.affectedRows > 0) return;

  // Hard fail: do not silently continue.
  throw new Error(`Failed to credit user balance for wallet=${walletAddr}`);
}


