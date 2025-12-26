/**
 * Platform wallet helpers (multi-chain)
 *
 * IMPORTANT:
 * - Frontend uses `/api/platform/wallet` which is backed by `system_settings` keys:
 *   - platform_wallet_bsc
 *   - platform_wallet_eth
 * - Deposit verification MUST use the same wallet addresses, otherwise users can
 *   send funds to the correct platform wallet but the backend rejects the deposit,
 *   resulting in "platform received but user balance not updated".
 *
 * This module provides a single source of truth for retrieving platform wallet
 * address per chain from database, with safe fallbacks.
 */

/**
 * Validate EVM wallet address.
 * Kept local to avoid circular dependencies with security modules.
 *
 * @param {string} address - Wallet address
 * @returns {boolean} True if valid
 */
function isValidEvmAddress(address) {
  if (!address || typeof address !== 'string') return false;
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Normalize chain name to supported keys.
 *
 * @param {string} chain - Chain input
 * @returns {'BSC'|'ETH'} Normalized chain
 */
function normalizeChain(chain) {
  const c = String(chain || '').trim().toUpperCase();
  return c === 'ETH' ? 'ETH' : 'BSC';
}

/**
 * Get platform wallet address from `system_settings` for a specific chain.
 *
 * DB keys:
 * - BSC -> platform_wallet_bsc
 * - ETH -> platform_wallet_eth
 * Fallback keys:
 * - platform_wallet_address (legacy)
 *
 * @param {(sql: string, params?: any[]) => Promise<any[]>} dbQuery - Database query function
 * @param {string} chain - 'BSC' | 'ETH' (case-insensitive)
 * @param {object} [fallbacks] - Optional fallbacks map (e.g. CHAIN_CONFIGS)
 * @returns {Promise<string>} Wallet address (lowercased)
 */
export async function getPlatformWalletAddressByChain(dbQuery, chain, fallbacks = {}) {
  const normalizedChain = normalizeChain(chain);
  const chainKey = normalizedChain === 'ETH' ? 'eth' : 'bsc';
  const settingKey = `platform_wallet_${chainKey}`;

  // 1) Prefer per-chain wallet from DB
  try {
    const rows = await dbQuery(
      'SELECT setting_value FROM system_settings WHERE setting_key = ? LIMIT 1',
      [settingKey]
    );
    const value = rows?.[0]?.setting_value;
    if (isValidEvmAddress(value)) return value.toLowerCase();
  } catch (error) {
    // Ignore and fallback (do not block deposits due to settings read failure)
  }

  // 2) Fallback to legacy single wallet key
  try {
    const rows = await dbQuery(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'platform_wallet_address' LIMIT 1"
    );
    const value = rows?.[0]?.setting_value;
    if (isValidEvmAddress(value)) return value.toLowerCase();
  } catch (error) {
    // Ignore and fallback
  }

  // 3) Fallback to provided map (e.g. CHAIN_CONFIGS)
  const fallbackFromMap = fallbacks?.[normalizedChain]?.platformWallet;
  if (isValidEvmAddress(fallbackFromMap)) return fallbackFromMap.toLowerCase();

  // 4) Last resort: env var (kept for backward compatibility)
  const envWallet = process.env.PLATFORM_WALLET_ADDRESS;
  if (isValidEvmAddress(envWallet)) return envWallet.toLowerCase();

  // 5) Hard fallback (must be valid to prevent runtime crashes)
  return '0x0290df8a512eff68d0b0a3ece1e3f6aab49d79d4';
}


