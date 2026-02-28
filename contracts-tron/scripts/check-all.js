const { TronWeb } = require('tronweb');
const tronWeb = new TronWeb({ fullHost: 'https://api.trongrid.io' });

async function check() {
  const address = 'TGMVmVmHDV2UDEHusKWnrhUt6dfGXCpYSi';

  // 检查 TRX 余额
  const trxBalance = await tronWeb.trx.getBalance(address);
  console.log('TRX 余额:', trxBalance / 1e6, 'TRX');

  // 检查 USDT (TRC-20) 余额
  // TRON USDT: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
  try {
    const contract = await tronWeb.contract(
      [{"constant":true,"inputs":[{"name":"who","type":"address"}],"name":"balanceOf","outputs":[{"name":"","type":"uint256"}],"type":"function"}],
      'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
    );
    const usdtBalance = await contract.balanceOf(address).call();
    console.log('USDT 余额:', Number(usdtBalance) / 1e6, 'USDT');
  } catch (e) {
    console.log('USDT 查询失败:', e.message);
  }

  // 检查账户资源
  const account = await tronWeb.trx.getAccount(address);
  const isEmpty = !account || Object.keys(account).length === 0;
  console.log('\n账户状态:', isEmpty ? '未激活' : '已激活');

  if (!isEmpty) {
    const resources = await tronWeb.trx.getAccountResources(address);
    console.log('能量(Energy):', resources.EnergyLimit || 0);
    console.log('带宽(Bandwidth):', resources.freeNetLimit || 0);
  }

  console.log('\n========================================');
  console.log('部署合约需要: TRX (用于支付能量/带宽费)');
  console.log('USDT 不能用于支付 gas 费用');
  console.log('========================================');
}

check().catch(console.error);
