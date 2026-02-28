const { TronWeb } = require('tronweb');
const tronWeb = new TronWeb({ fullHost: 'https://api.trongrid.io' });

async function checkBalance() {
  try {
    const address = 'TGMVmVmHDV2UDEHusKWnrhUt6dfGXCpYSi';
    const balance = await tronWeb.trx.getBalance(address);
    console.log('TRX余额:', balance / 1e6, 'TRX');

    const account = await tronWeb.trx.getAccount(address);
    const isEmpty = !account || Object.keys(account).length === 0;
    if (isEmpty) {
      console.log('账户状态: 未激活（需要转入TRX激活）');
    } else {
      console.log('账户状态: 已激活');
      if (account.balance) console.log('确认余额:', account.balance / 1e6, 'TRX');
    }

    // 部署合约大约需要 100-300 TRX 的能量
    console.log('\n部署合约预计需要: 100-400 TRX');
    if (balance / 1e6 >= 100) {
      console.log('✅ 余额充足，可以部署');
    } else {
      console.log('❌ 余额不足，需要充值TRX');
    }
  } catch (e) {
    console.log('查询出错:', e.message);
  }
}
checkBalance();
