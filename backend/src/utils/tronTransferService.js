/**
 * TRON Transfer Service
 * Handles USDT (TRC-20) transfers and DepositRelay contract interactions on TRON
 */

import TronWebModule from 'tronweb';
const { TronWeb } = TronWebModule;

// TRON USDT (TRC-20) contract address
const USDT_CONTRACT = process.env.TRON_USDT_CONTRACT || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

// DepositRelay contract address
const DEPOSIT_RELAY_CONTRACT = process.env.TRON_DEPOSIT_RELAY_CONTRACT || '';

// TRC-20 USDT ABI (minimal)
const USDT_ABI = [
  { constant: true, inputs: [{ name: 'who', type: 'address' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], type: 'function' },
  { constant: true, inputs: [], name: 'decimals', outputs: [{ name: '', type: 'uint8' }], type: 'function' },
  { constant: false, inputs: [{ name: '_to', type: 'address' }, { name: '_value', type: 'uint256' }], name: 'transfer', outputs: [{ name: '', type: 'bool' }], type: 'function' },
  { constant: true, inputs: [{ name: '_owner', type: 'address' }, { name: '_spender', type: 'address' }], name: 'allowance', outputs: [{ name: '', type: 'uint256' }], type: 'function' }
];

// DepositRelay ABI (minimal for backend calls)
const DEPOSIT_RELAY_ABI = [
  { inputs: [{ name: 'user', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'nonce', type: 'bytes32' }, { name: 'signature', type: 'bytes' }], name: 'depositWithSignature', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [{ name: 'user', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'nonce', type: 'bytes32' }], name: 'depositByOwner', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { constant: true, inputs: [{ name: 'user', type: 'address' }], name: 'checkAllowance', outputs: [{ name: '', type: 'uint256' }], type: 'function' },
  { constant: true, inputs: [{ name: 'user', type: 'address' }], name: 'checkBalance', outputs: [{ name: '', type: 'uint256' }], type: 'function' },
  { constant: true, inputs: [{ name: 'nonce', type: 'bytes32' }], name: 'isNonceUsed', outputs: [{ name: '', type: 'bool' }], type: 'function' },
  { constant: true, inputs: [{ name: 'user', type: 'address' }], name: 'getUserTotalDeposited', outputs: [{ name: '', type: 'uint256' }], type: 'function' },
  { constant: true, inputs: [], name: 'platformWallet', outputs: [{ name: '', type: 'address' }], type: 'function' },
  { constant: true, inputs: [], name: 'paused', outputs: [{ name: '', type: 'bool' }], type: 'function' },
  { constant: true, inputs: [], name: 'owner', outputs: [{ name: '', type: 'address' }], type: 'function' }
];

let tronWeb = null;
let usdtContract = null;
let depositRelayContract = null;

/**
 * Get the TronWeb instance
 */
export function getTronWeb() {
  return tronWeb;
}

/**
 * Get the DepositRelay contract instance
 */
export function getDepositRelayContract() {
  return depositRelayContract;
}

/**
 * Initialize TRON provider and wallet
 */
export async function initializeTronProvider() {
  try {
    const privateKey = process.env.TRON_PRIVATE_KEY;

    if (!privateKey) {
      console.log('[TRON] No private key provided, TRON functions disabled');
      return false;
    }

    tronWeb = new TronWeb({
      fullHost: 'https://api.trongrid.io',
      privateKey: privateKey
    });

    const walletAddress = tronWeb.address.fromPrivateKey(privateKey);
    console.log(`[TRON] Wallet address: ${walletAddress}`);

    // Check TRX balance
    const trxBalance = await tronWeb.trx.getBalance(walletAddress);
    console.log(`[TRON] TRX balance: ${trxBalance / 1e6} TRX`);

    // Initialize USDT contract
    usdtContract = await tronWeb.contract(USDT_ABI, USDT_CONTRACT);

    // Initialize DepositRelay contract
    if (DEPOSIT_RELAY_CONTRACT) {
      depositRelayContract = await tronWeb.contract(DEPOSIT_RELAY_ABI, DEPOSIT_RELAY_CONTRACT);
      console.log(`[TRON] DepositRelay contract: ${DEPOSIT_RELAY_CONTRACT}`);
    }

    console.log('[TRON] Provider initialized successfully');
    return true;
  } catch (error) {
    console.error('[TRON] Failed to initialize:', error.message);
    return false;
  }
}

/**
 * Get TRX balance
 */
export async function getTRXBalance(address) {
  if (!tronWeb) throw new Error('TRON provider not initialized');
  const balance = await tronWeb.trx.getBalance(address);
  return (balance / 1e6).toString();
}

/**
 * Get USDT (TRC-20) balance
 */
export async function getTronUSDTBalance(address) {
  if (!usdtContract) throw new Error('TRON USDT contract not initialized');
  const balance = await usdtContract.balanceOf(address).call();
  return (Number(balance) / 1e6).toString();
}

/**
 * Transfer USDT (TRC-20) to an address
 */
export async function transferTronUSDT(toAddress, amount) {
  if (!tronWeb || !usdtContract) {
    throw new Error('TRON wallet not initialized');
  }

  try {
    const amountSun = Math.round(Number(amount) * 1e6);

    const tx = await usdtContract.transfer(toAddress, amountSun).send({
      feeLimit: 100 * 1e6 // 100 TRX fee limit
    });

    console.log(`[TRON] Transfer initiated: ${tx}`);

    return {
      success: true,
      txHash: tx
    };
  } catch (error) {
    console.error('[TRON] Transfer failed:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Execute deposit via DepositRelay contract (with signature)
 */
export async function executeDepositWithSignature(userAddress, amount, nonce, signature) {
  if (!depositRelayContract) {
    throw new Error('DepositRelay contract not initialized');
  }

  const amountSun = Math.round(Number(amount) * 1e6);

  // Check nonce
  const isUsed = await depositRelayContract.isNonceUsed(nonce).call();
  if (isUsed) throw new Error('Nonce already used');

  // Check allowance
  const allowance = await depositRelayContract.checkAllowance(userAddress).call();
  if (Number(allowance) < amountSun) throw new Error('Insufficient allowance');

  // Execute deposit
  const tx = await depositRelayContract.depositWithSignature(
    userAddress, amountSun, nonce, signature
  ).send({ feeLimit: 150 * 1e6 });

  console.log(`[TRON] Deposit tx: ${tx}`);
  return { success: true, txHash: tx };
}

/**
 * Execute deposit via DepositRelay contract (owner only, no signature)
 */
export async function executeDepositByOwner(userAddress, amount, nonce) {
  if (!depositRelayContract) {
    throw new Error('DepositRelay contract not initialized');
  }

  const amountSun = Math.round(Number(amount) * 1e6);

  const isUsed = await depositRelayContract.isNonceUsed(nonce).call();
  if (isUsed) throw new Error('Nonce already used');

  const tx = await depositRelayContract.depositByOwner(
    userAddress, amountSun, nonce
  ).send({ feeLimit: 150 * 1e6 });

  console.log(`[TRON] DepositByOwner tx: ${tx}`);
  return { success: true, txHash: tx };
}

/**
 * Get TRON wallet address
 */
export function getTronWalletAddress() {
  if (!tronWeb) return null;
  const pk = process.env.TRON_PRIVATE_KEY;
  return pk ? tronWeb.address.fromPrivateKey(pk) : null;
}

/**
 * Get TRON account balance (TRX and USDT)
 */
export async function getTronAccountBalance() {
  const address = getTronWalletAddress();
  if (!address) return { trx: '0', usdt: '0' };

  try {
    const trx = await getTRXBalance(address);
    const usdt = await getTronUSDTBalance(address);
    return { trx, usdt };
  } catch (error) {
    console.error('[TRON] Failed to get balance:', error.message);
    return { trx: '0', usdt: '0' };
  }
}

export default {
  initializeTronProvider,
  getTRXBalance,
  getTronUSDTBalance,
  transferTronUSDT,
  executeDepositWithSignature,
  executeDepositByOwner,
  getTronWalletAddress,
  getTronAccountBalance
};
