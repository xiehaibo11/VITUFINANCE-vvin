## Free/Public RPC Nodes Used By This Repo

This note collects the free/public RPC endpoints already used in this codebase,
so you can reuse them in another project (BSC + ETH).

Important:
- Public/free RPCs can be rate-limited, pruned (limited historical blocks), or unstable.
- For production, always implement retries + timeouts + multi-node rotation.
- Do not hardcode someone else's API key. If a provider requires a key, create your own.

---

## BSC (BNB Smart Chain) Mainnet

### 1) NodeReal (requires your own API key)
- Endpoint pattern:
  - `https://bsc-mainnet.nodereal.io/v1/<YOUR_API_KEY>`
- Website:
  - https://nodereal.io
- Notes:
  - This repo uses NodeReal as the primary BSC RPC (then falls back to public nodes).
  - Create a key in NodeReal dashboard and replace `<YOUR_API_KEY>`.

### 2) PublicNode (public)
- Endpoint:
  - `https://bsc.publicnode.com`
- Website:
  - https://publicnode.com

### 3) BNB Chain official dataseed (public)
- Endpoint:
  - `https://bsc-dataseed.binance.org/`
- Docs (RPC references):
  - https://docs.bnbchain.org

### 4) Defibit dataseed mirror (public)
- Endpoint:
  - `https://bsc-dataseed1.defibit.io/`
- Website:
  - https://defibit.io

---

## Ethereum (ETH) Mainnet

### 1) LlamaRPC (public)
- Endpoint:
  - `https://eth.llamarpc.com`
- Website:
  - https://llamarpc.com

### 2) PublicNode (public)
- Endpoint:
  - `https://ethereum-rpc.publicnode.com`
- Website:
  - https://publicnode.com

### 3) Ankr (public / keyless endpoint)
- Endpoint:
  - `https://rpc.ankr.com/eth`
- Website:
  - https://www.ankr.com

### 4) Blast API Public (public)
- Endpoint:
  - `https://eth-mainnet.public.blastapi.io`
- Website:
  - https://blastapi.io

---

## Quick Health Check (curl)

Get latest block number:

```bash
curl -sS -X POST \
  -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' \
  https://bsc.publicnode.com
```

```bash
curl -sS -X POST \
  -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' \
  https://ethereum-rpc.publicnode.com
```

---

## Recommended Usage Pattern (Rotation + Retry)

If you reuse these in another project, do NOT rely on a single RPC.
Use a list and rotate on failures/rate limits.

Minimal Node.js (fetch) example:

```js
const RPC_URLS = [
  "https://bsc.publicnode.com",
  "https://bsc-dataseed.binance.org/",
  "https://bsc-dataseed1.defibit.io/",
  // "https://bsc-mainnet.nodereal.io/v1/<YOUR_API_KEY>", // optional (requires key)
];

let rpcIndex = 0;

function currentRpc() {
  return RPC_URLS[rpcIndex];
}

function rotateRpc() {
  rpcIndex = (rpcIndex + 1) % RPC_URLS.length;
}

async function rpcCall(method, params, { timeoutMs = 10000, retries = 2 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const url = currentRpc();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
        signal: controller.signal,
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      if (json.error) throw new Error(json.error.message || "RPC error");
      return json.result;
    } catch (e) {
      // Rotate on error and retry.
      rotateRpc();
      if (attempt === retries) throw e;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
}

// Example usage:
rpcCall("eth_blockNumber", []).then(console.log).catch(console.error);
```

---

## Notes For Deposit Monitoring (If You Scan Transfer Logs)

If your other project needs to detect incoming token transfers:
- Use `eth_getLogs` with:
  - `address`: token contract (e.g. USDT contract)
  - `topics[0]`: ERC-20 Transfer topic
  - `topics[2]`: receiver address (padded to 32 bytes)
- Limit scanned blocks per run and store `lastCheckedBlock` in DB to resume after restart.
- Expect "history pruned" errors on some free nodes; auto-reset closer to latest blocks if needed.

ERC-20 Transfer topic:
- `0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef`

---

## PublicNode Full List (Auto-fetched)

If you want the full free/public endpoint list from PublicNode (many chains), run:

```bash
node scripts/fetch-publicnode-endpoints.mjs
```

Outputs:
- `scripts/publicnode_endpoints.md`
- `scripts/publicnode_endpoints.json`

