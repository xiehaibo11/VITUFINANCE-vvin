/**
 * 检查钱包地址和余额
 */
import { ethers } from 'ethers';

const PRIVATE_KEY = '4263fe95dcdb4fe82429c14c7ef8c55157b33e8237172288ce8f7cecc3de40a7';
const BSC_RPC = 'https://bsc-dataseed.binance.org:443';
const USDT_CONTRACT = '0x55d398326f99059fF775485246999027B3197955';

const USDT_ABI = [
    'function balanceOf(address account) view returns (uint256)',
    'function decimals() view returns (uint8)'
];

async function checkWallet() {
    try {
        // 创建钱包
        const wallet = new ethers.Wallet(PRIVATE_KEY);
        console.log('===== 钱包信息 =====');
        console.log('地址:', wallet.address);
        console.log('');

        // 连接 BSC
        const provider = new ethers.JsonRpcProvider(BSC_RPC);
        const walletConnected = wallet.connect(provider);

        // 查询 BNB 余额
        const bnbBalance = await provider.getBalance(wallet.address);
        console.log('===== BSC 余额 =====');
        console.log('BNB:', ethers.formatEther(bnbBalance), 'BNB');

        // 查询 USDT 余额
        const usdtContract = new ethers.Contract(USDT_CONTRACT, USDT_ABI, provider);
        const usdtBalance = await usdtContract.balanceOf(wallet.address);
        console.log('USDT:', ethers.formatUnits(usdtBalance, 18), 'USDT');
        console.log('');

        console.log('===== 老收款地址余额 =====');
        const oldBscAddress = '0x0290df8A512Eff68d0B0a3ECe1E3F6aAB49d79D4';
        const oldBnbBalance = await provider.getBalance(oldBscAddress);
        const oldUsdtBalance = await usdtContract.balanceOf(oldBscAddress);
        console.log('老地址:', oldBscAddress);
        console.log('BNB:', ethers.formatEther(oldBnbBalance), 'BNB');
        console.log('USDT:', ethers.formatUnits(oldUsdtBalance, 18), 'USDT');
        console.log('');

        console.log('===== 新收款地址余额 =====');
        const newBscAddress = '0x537BD2D898a64b0214FfefD8910E77FA89c6B2bB';
        const newBnbBalance = await provider.getBalance(newBscAddress);
        const newUsdtBalance = await usdtContract.balanceOf(newBscAddress);
        console.log('新地址:', newBscAddress);
        console.log('BNB:', ethers.formatEther(newBnbBalance), 'BNB');
        console.log('USDT:', ethers.formatUnits(newUsdtBalance, 18), 'USDT');

    } catch (error) {
        console.error('查询失败:', error.message);
    }
}

checkWallet();
