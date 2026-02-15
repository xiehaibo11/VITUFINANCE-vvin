# VituFinance - RPC & Node Services Reference

> Extracted from VituFinance project codebase for reuse in other projects.
> Last updated: 2026-02-07
> Verified: 2026-02-07 (all endpoints live-tested)

---

## Verification Summary

| Endpoint | Status | Notes |
|----------|--------|-------|
| NodeReal BSC | ✅ OK | 0.32s response |
| PublicNode BSC | ✅ OK | 0.57s response |
| Binance BSC | ✅ OK | 0.32s response |
| DeFiBit BSC | ✅ OK | 0.32s response |
| NiniCoin BSC | ✅ OK | 0.34s response |
| LlamaRPC ETH | ✅ OK | 0.32s response |
| PublicNode ETH | ✅ OK | 0.26s response |
| Ankr ETH | ❌ UNUSABLE | Now requires API key (free registration needed) |
| BlastAPI ETH | ✅ OK | 0.12s response |
| Infura ETH | ❌ UNUSABLE | Returns 401, requires paid API key |
| BSCScan API | ✅ OK | Accessible |

---

## 1. BSC (BNB Smart Chain) - Chain ID: 56 (0x38)

### RPC Nodes (All Verified ✅)

| Priority | RPC URL | Provider | Status | Notes |
|----------|---------|----------|--------|-------|
| 1 (Primary) | `https://bsc-mainnet.nodereal.io/v1/0e91c33451a94222bdb4a68a6e4a708d` | NodeReal | ✅ | Free tier: 35M requests/month. ⚠️ API key is共享的, 建议去 nodereal.io 注册你自己的 |
| 2 | `https://bsc.publicnode.com` | PublicNode | ✅ | Free, no key needed |
| 3 | `https://bsc-dataseed.binance.org/` | Binance Official | ✅ | Free, no key needed, most stable |
| 4 | `https://bsc-dataseed1.defibit.io/` | DeFiBit | ✅ | Free, no key needed |
| 5 | `https://bsc-dataseed1.ninicoin.io/` | NiniCoin | ✅ | Free, no key needed |

### Token Contracts (BSC Mainnet, Verified on-chain ✅)

| Token | Contract Address | Decimals | On-chain Name |
|-------|-----------------|----------|---------------|
| USDT (BEP-20) | `0x55d398326f99059fF775485246999027B3197955` | 18 | Tether USD |

### Block Explorer

| Service | URL | Status |
|---------|-----|--------|
| BSCScan Explorer | `https://bscscan.com/` | ✅ |
| BSCScan API | `https://api.bscscan.com/api` | ✅ |

---

## 2. Ethereum Mainnet - Chain ID: 1 (0x1)

### RPC Nodes

| Priority | RPC URL | Provider | Status | Notes |
|----------|---------|----------|--------|-------|
| 1 (Primary) | `https://eth.llamarpc.com` | LlamaRPC | ✅ | Free, no API key needed |
| 2 | `https://ethereum-rpc.publicnode.com` | PublicNode | ✅ | Free, no API key needed |
| 3 | `https://eth-mainnet.public.blastapi.io` | BlastAPI | ✅ | Free, no API key needed, fastest (0.12s) |
| ~~4~~ | ~~`https://rpc.ankr.com/eth`~~ | ~~Ankr~~ | ❌ | **已失效** - 现在需要注册 API key (免费注册: ankr.com/rpc/) |
| ~~5~~ | ~~`https://mainnet.infura.io/v3/`~~ | ~~Infura~~ | ❌ | **无 API key** - 返回 401, 项目中仅为占位符 |

### Token Contracts (Ethereum Mainnet, Verified on-chain ✅)

| Token | Contract Address | Decimals | On-chain Name |
|-------|-----------------|----------|---------------|
| USDT (ERC-20) | `0xdAC17F958D2ee523a2206206994597C13D831ec7` | 6 | Tether USD |
| WLD | `0x163f8C2467924be0ae7B5347228CABF260318753` | 18 | Worldcoin |

### Block Explorer

| Service | URL |
|---------|-----|
| Etherscan Explorer | `https://etherscan.io/` |

---

## 3. Polygon Mainnet - Chain ID: 137 (0x89)

### Token Contracts (Polygon Mainnet, Verified on-chain ✅)

| Token | Contract Address | Decimals |
|-------|-----------------|----------|
| USDT | `0xc2132D05D31c914a87C6611C10748AEb04B58e8F` | 6 |

> Note: Polygon RPC nodes are not explicitly configured in the project; only token contracts are defined in the frontend wallet utility.
> If you需要 Polygon RPC, 推荐使用: `https://polygon-rpc.com/` (已验证可用)

---

## 4. Quick Copy - RPC Arrays (JavaScript)

### BSC RPC Nodes (5 nodes, all verified)

```javascript
const BSC_RPC_URLS = [
  'https://bsc-mainnet.nodereal.io/v1/YOUR_NODEREAL_API_KEY', // NodeReal - register free at nodereal.io
  'https://bsc.publicnode.com',
  'https://bsc-dataseed.binance.org/',
  'https://bsc-dataseed1.defibit.io/',
  'https://bsc-dataseed1.ninicoin.io/'
];
```

### ETH RPC Nodes (3 usable nodes after removing failed ones)

```javascript
const ETH_RPC_URLS = [
  'https://eth.llamarpc.com',
  'https://ethereum-rpc.publicnode.com',
  'https://eth-mainnet.public.blastapi.io'
  // ❌ 'https://rpc.ankr.com/eth' - requires API key now
  // ❌ 'https://mainnet.infura.io/v3/' - requires paid API key
];
```

---

## 5. Quick Copy - Chain Config (JavaScript)

```javascript
const CHAIN_CONFIGS = {
  BSC: {
    name: 'BNB Smart Chain',
    chainId: 56,
    chainIdHex: '0x38',
    rpcUrl: 'https://bsc-dataseed.binance.org/',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    explorer: 'https://bscscan.com/',
    tokens: {
      USDT: { address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 }
    }
  },
  ETH: {
    name: 'Ethereum Mainnet',
    chainId: 1,
    chainIdHex: '0x1',
    rpcUrl: 'https://eth.llamarpc.com',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    explorer: 'https://etherscan.io/',
    tokens: {
      USDT: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
      WLD:  { address: '0x163f8C2467924be0ae7B5347228CABF260318753', decimals: 18 }
    }
  },
  Polygon: {
    name: 'Polygon Mainnet',
    chainId: 137,
    chainIdHex: '0x89',
    rpcUrl: 'https://polygon-rpc.com/',
    nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
    explorer: 'https://polygonscan.com/',
    tokens: {
      USDT: { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 }
    }
  }
};
```

---

## 6. Quick Copy - Environment Variables

```env
# BSC Configuration
BSC_RPC_URL=https://bsc-dataseed.binance.org
CHAIN_ID=56

# Optional: NodeReal BSC RPC (register free at nodereal.io for your own key)
# NODEREAL_BSC_RPC=https://bsc-mainnet.nodereal.io/v1/YOUR_API_KEY

# Optional: BSCScan API Key (free tier: 5 requests/sec, register at bscscan.com)
BSCSCAN_API_KEY=your_api_key_here
```

---

## 7. ERC-20 Transfer Event Signature

Used for monitoring on-chain deposit events (applies to all EVM chains):

```
Transfer(address,address,uint256)
Topic: 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
```

---

## 8. Wallet Add Chain Config (EIP-3085)

For prompting users to add BSC network in their wallet:

```javascript
await ethereum.request({
  method: 'wallet_addEthereumChain',
  params: [{
    chainId: '0x38',
    chainName: 'BNB Smart Chain',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    rpcUrls: ['https://bsc-dataseed.binance.org/'],
    blockExplorerUrls: ['https://bscscan.com/']
  }]
});
```

---

## 9. Minimal ERC-20 ABI (for balanceOf / transfer)

```javascript
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)'
];
```

---

## ⚠️ Important Notes & Warnings

1. **NodeReal API Key 共享风险**: 项目中的 NodeReal BSC RPC URL 包含一个 API key (`0e91c33451a94222bdb4a68a6e4a708d`)。这个 key 是 VituFinance 项目的，如果你在别的项目用，建议去 [nodereal.io](https://nodereal.io) 免费注册一个你自己的 key，避免共享额度冲突。

2. **Ankr 已不可用**: `https://rpc.ankr.com/eth` 现在返回 "Unauthorized" 错误，必须注册 API key。如需使用请去 [ankr.com/rpc](https://www.ankr.com/rpc/) 免费注册。

3. **Infura 仅为占位符**: 项目中的 Infura URL (`https://mainnet.infura.io/v3/`) 没有配置 API key，无法使用。

4. **USDT 精度差异 (关键!)**: 
   - BSC USDT = **18** decimals
   - ETH USDT = **6** decimals
   - Polygon USDT = **6** decimals
   - 解析金额时务必使用正确的 decimals，否则金额会差 10^12 倍！

5. **推荐策略**: 使用多节点轮询 (round-robin) 避免单点限流，项目中已有此模式可参考。

6. **Polygon 原生代币更名**: Polygon 网络的原生代币已从 MATIC 更名为 POL (2025年12月迁移完成)。
