nr_getHistoryTokenHolder
此 API 可通过提供合约地址、区块号和资源 ID 来获取历史代币持有者列表。支持同质化代币（ERC-20、BEP-20）和 NFT（ERC-721、BEP-721、ERC-1155、BEP-1155）。

📘
仅支持BSC主网。

可用令牌类型：

同质化代币（ERC-20、BEP-20）
NFT（ERC-721、BEP-721、ERC-1155、BEP-1155）
🚧
此 API 为异步任务，需要nr_historytokenholdersend API 的返回结果。调用此 API 前，请先向nr_historytokenholdersend发送请求以获取资源 ID。

参数
contractAddress- 代币的合约地址应该与您在nr_historytokenholdersend API中提交的地址相同。
blockNumber- 区块编号（十六进制格式）应与您在nr_historytokenholdersend API中提交的区块编号相同。
resourceId- 您从nr_historytokenholdersend API的响应中收到的资源 ID 。
返回
result
status- 0：错误；1：成功；2：正在生成；3：资源 ID 错误
links- 代币持有者列表的链接，JSON 文件格式
API 端点
此 API 的端点是：以下是一个示例：https://open-platform.nodereal.io/{API-KEY}/tokenholder/

https://open-platform.nodereal.io/64a9df0874fb4a93b9d0a3849de012d3/tokenholder/

您可以参考此指南查找 API 密钥和API 密钥的端点。

例子
要求


curl https://open-platform.nodereal.io/{API-KEY}/tokenholder/ \
-X POST \
-H "Content-Type: application/json" \
-d '{"jsonrpc":"2.0","method":"nr_getHistoryTokenHolder","params":["0xeDa21B525Ac789EaB1a08ef2404dd8505FfB973D","0x1550e20", "59d30c83562b9f9d1989ceb8ceaf4f6f7e749e8ffd1440d577fc0823169b0866"],"id": 1 }'
结果

JSON

{
    "jsonrpc": "2.0",
    "id": 1,
    "result": {
        "status": 1,
        "links": [
            "https://tf-nodereal-prod-bsc-gold-digger.s3.amazonaws.com/public/a4a4b76170ddc1w2d060717342826c31ca4307w8d3edfbb01593f5c48c78b7ab"
        ]
    }
}
🚧
结果以 Base64 格式编码，您需要对其进行解码才能获得上述链接中的结果。请注意，结果文件仅在 24 小时内有效。如果文件过期，您需要提交新的任务。

您将在文件中看到历史代币持有者列表数据，其中包括：

区块编号
tokenAddress
持有者（数组）
帐户
平衡
tokenType（如果是 NFT）
tokenId（如果是 NFT）
例子

{
   "blockNumber":22351392,
   "tokenAddress":"0x15b3d410fcd0d695e1bbe4f717f8e1b6d0fb2d0c",
   "holders":[
      {
         "account":"0x2f003ce63d5ebe72d9cb5afd94b00b14d75d47be",
         "balance":"0x0000000000000000000000000000000000000000000000000de0b6b3a7640000"
      },
      {
         "account":"0x68368ef36bb436f92b20d97b64fc080212821be5",
         "balance":"0x0000000000000000000000000000000000000000000000000000006c86d6dda0"
      },
      {
         "account":"0x949716fba215f35ecdc1a8fcdd1960b8d18e7510",
         "balance":"0x0000000000000000000000000000000000000000000000000070c9be58939bf6"
      }
     ...
   ]
}


Historical Token Holder:https://open-platform.nodereal.io/0e91c33451a94222bdb4a68a6e4a708d/tokenholder/


Fungible Tokens-ETH:https://eth-mainnet.nodereal.io/v1/0e91c33451a94222bdb4a68a6e4a708d

Fungible Tokens-BSC:https://bsc-mainnet.nodereal.io/v1/0e91c33451a94222bdb4a68a6e4a708d


NFT-ETH:https://eth-mainnet.nodereal.io/v1/0e91c33451a94222bdb4a68a6e4a708d


NFT-BSC:https://bsc-mainnet.nodereal.io/v1/0e91c33451a94222bdb4a68a6e4a708d


SPACE ID:https://open-platform.nodereal.io/0e91c33451a94222bdb4a68a6e4a708d/spaceid/


BNBBurn API:https://bsc-mainnet.nodereal.io/v1/0e91c33451a94222bdb4a68a6e4a708d



BNB Greenfield Testnet Billing API:https://open-platform.nodereal.io/0e91c33451a94222bdb4a68a6e4a708d/greenfieldbilling-testnet/


BNB Greenfield Testnet Enhanced API:https://open-platform.nodereal.io/0e91c33451a94222bdb4a68a6e4a708d/greenfieldscan-testnet/


BNB Greenfield Mainnet Billing API:https://open-platform.nodereal.io/0e91c33451a94222bdb4a68a6e4a708d/greenfieldbilling-mainnet/


BNB Greenfield Mainnet Enhanced API:https://open-platform.nodereal.io/0e91c33451a94222bdb4a68a6e4a708d/greenfieldscan-mainnet/


PancakeSwap GraphQL v2 (Free):https://open-platform.nodereal.io/0e91c33451a94222bdb4a68a6e4a708d/pancakeswap-free/graphql


BNB Chain Staking API:https://open-platform.nodereal.io/0e91c33451a94222bdb4a68a6e4a708d/bnb-chain-staking/



Klaytn RPC:https://open-platform.nodereal.io/0e91c33451a94222bdb4a68a6e4a708d/klaytn/

NEAR RPC:https://open-platform.nodereal.io/0e91c33451a94222bdb4a68a6e4a708d/near/


ETH Beacon Chain API:https://eth2-beacon-mainnet.nodereal.io/v1/0e91c33451a94222bdb4a68a6e4a708d/eth/v1

Arbitrum Nitro RPC:https://open-platform.nodereal.io/0e91c33451a94222bdb4a68a6e4a708d/arbitrum-nitro/


Optimism RPC:https://opt-mainnet.nodereal.io/v1/0e91c33451a94222bdb4a68a6e4a708d



Combo Mainnet RPC:https://combo-mainnet.nodereal.io/v1/0e91c33451a94222bdb4a68a6e4a708d

Combo Testnet RPC:https://combo-testnet.nodereal.io/v1/0e91c33451a94222bdb4a68a6e4a708d

Combo Mainnet Enhance API:https://combo-mainnet.nodereal.io/v1/0e91c33451a94222bdb4a68a6e4a708d

Status API-ETH:https://eth-mainnet.nodereal.io/v1/0e91c33451a94222bdb4a68a6e4a708d


Status API-BSC:https://bsc-mainnet.nodereal.io/v1/0e91c33451a94222bdb4a68a6e4a708d

Bitcoin RPC：https://open-platform.nodereal.io/0e91c33451a94222bdb4a68a6e4a708d/bitcoin

TRON REST API：https://open-platform.nodereal.io/0e91c33451a94222bdb4a68a6e4a708d/tron-rest

BSC RPC：https://bsc-mainnet.nodereal.io/v1/0e91c33451a94222bdb4a68a6e4a708d