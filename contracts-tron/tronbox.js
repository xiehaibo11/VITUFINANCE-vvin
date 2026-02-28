const port = process.env.HOST_PORT || 9090;

module.exports = {
  networks: {
    mainnet: {
      privateKey: process.env.DEPLOYER_PRIVATE_KEY,
      userFeePercentage: 100,
      feeLimit: 1000 * 1e6,
      fullHost: 'https://api.trongrid.io',
      network_id: '1'
    },
    shasta: {
      privateKey: process.env.DEPLOYER_PRIVATE_KEY,
      userFeePercentage: 50,
      feeLimit: 1000 * 1e6,
      fullHost: 'https://api.shasta.trongrid.io',
      network_id: '2'
    },
    nile: {
      privateKey: process.env.DEPLOYER_PRIVATE_KEY,
      userFeePercentage: 100,
      feeLimit: 1000 * 1e6,
      fullHost: 'https://nile.trongrid.io',
      network_id: '3'
    },
    development: {
      privateKey: process.env.DEPLOYER_PRIVATE_KEY,
      userFeePercentage: 0,
      feeLimit: 1000 * 1e6,
      fullHost: 'http://127.0.0.1:' + port,
      network_id: '9'
    }
  },
  compilers: {
    solc: {
      version: '0.8.20',
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        }
      }
    }
  }
};
