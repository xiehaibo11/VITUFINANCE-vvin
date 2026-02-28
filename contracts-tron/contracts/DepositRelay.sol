// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title DepositRelay (TRON版)
 * @dev 充值中继合约 - 实现免密支付
 *
 * 功能：
 * 1. 用户授权USDT给本合约
 * 2. 后端调用本合约的deposit函数
 * 3. 合约从用户钱包转USDT到平台地址
 * 4. 支持签名验证（防止未授权调用）
 *
 * 部署到TRON主网
 */

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
}

contract DepositRelay {
    // ==================== 状态变量 ====================

    // 平台收款地址
    address public platformWallet;

    // 合约所有者（可以更新配置）
    address public owner;

    // USDT合约地址 (TRON主网 TRC-20 USDT: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t)
    address public constant USDT = 0xa614f803B6FD780986A42c78Ec9c7f77e6DeD13C;

    // 最低充值金额 (20 USDT，6位小数)
    uint256 public minDepositAmount = 20 * 10**6;

    // 最高充值金额 (10000 USDT，6位小数)
    uint256 public maxDepositAmount = 10000 * 10**6;

    // 是否暂停充值
    bool public paused = false;

    // 记录已使用的nonce（防重放攻击）
    mapping(bytes32 => bool) public usedNonces;

    // 记录充值历史
    mapping(address => uint256) public totalDeposited;

    // ==================== 事件 ====================

    event Deposit(
        address indexed user,
        uint256 amount,
        bytes32 nonce,
        uint256 timestamp
    );

    event PlatformWalletUpdated(
        address indexed oldWallet,
        address indexed newWallet
    );

    event DepositLimitsUpdated(
        uint256 minAmount,
        uint256 maxAmount
    );

    event Paused(address indexed by);
    event Unpaused(address indexed by);

    // ==================== 修饰符 ====================

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    // ==================== 构造函数 ====================

    constructor(address _platformWallet) {
        require(_platformWallet != address(0), "Invalid platform wallet");
        platformWallet = _platformWallet;
        owner = msg.sender;
    }

    // ==================== 核心功能 ====================

    /**
     * @dev 执行充值（带签名验证）
     * @param user 用户地址
     * @param amount 充值金额（6位小数）
     * @param nonce 随机数（防重放）
     * @param signature 用户签名
     */
    function depositWithSignature(
        address user,
        uint256 amount,
        bytes32 nonce,
        bytes memory signature
    ) external whenNotPaused {
        require(user != address(0), "Invalid user address");
        require(amount >= minDepositAmount, "Amount too low");
        require(amount <= maxDepositAmount, "Amount too high");
        require(!usedNonces[nonce], "Nonce already used");

        // 验证签名
        bytes32 messageHash = getMessageHash(user, amount, nonce);
        bytes32 signedMessageHash = getTronSignedMessageHash(messageHash);
        address signer = recoverSigner(signedMessageHash, signature);
        require(signer == user, "Invalid signature");

        usedNonces[nonce] = true;
        _executeDeposit(user, amount, nonce);
    }

    /**
     * @dev 执行充值（无签名验证，仅owner可调用）
     */
    function depositByOwner(
        address user,
        uint256 amount,
        bytes32 nonce
    ) external onlyOwner whenNotPaused {
        require(user != address(0), "Invalid user address");
        require(amount >= minDepositAmount, "Amount too low");
        require(amount <= maxDepositAmount, "Amount too high");
        require(!usedNonces[nonce], "Nonce already used");

        usedNonces[nonce] = true;
        _executeDeposit(user, amount, nonce);
    }

    /**
     * @dev 内部函数：执行充值
     */
    function _executeDeposit(
        address user,
        uint256 amount,
        bytes32 nonce
    ) internal {
        IERC20 usdt = IERC20(USDT);
        uint256 allowance = usdt.allowance(user, address(this));
        require(allowance >= amount, "Insufficient allowance");

        uint256 balance = usdt.balanceOf(user);
        require(balance >= amount, "Insufficient balance");

        bool success = usdt.transferFrom(user, platformWallet, amount);
        require(success, "Transfer failed");

        totalDeposited[user] += amount;
        emit Deposit(user, amount, nonce, block.timestamp);
    }

    // ==================== 签名验证函数 ====================

    function getMessageHash(
        address user,
        uint256 amount,
        bytes32 nonce
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(user, amount, nonce));
    }

    /**
     * @dev TRON签名消息哈希（使用TRON前缀）
     */
    function getTronSignedMessageHash(bytes32 messageHash)
        public
        pure
        returns (bytes32)
    {
        return keccak256(
            abi.encodePacked("\x19TRON Signed Message:\n32", messageHash)
        );
    }

    function recoverSigner(bytes32 signedMessageHash, bytes memory signature)
        public
        pure
        returns (address)
    {
        require(signature.length == 65, "Invalid signature length");

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }

        return ecrecover(signedMessageHash, v, r, s);
    }

    // ==================== 管理函数 ====================

    function updatePlatformWallet(address newWallet) external onlyOwner {
        require(newWallet != address(0), "Invalid wallet address");
        address oldWallet = platformWallet;
        platformWallet = newWallet;
        emit PlatformWalletUpdated(oldWallet, newWallet);
    }

    function updateDepositLimits(uint256 minAmount, uint256 maxAmount) external onlyOwner {
        require(minAmount > 0, "Min amount must be positive");
        require(maxAmount > minAmount, "Max must be greater than min");
        minDepositAmount = minAmount;
        maxDepositAmount = maxAmount;
        emit DepositLimitsUpdated(minAmount, maxAmount);
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner address");
        owner = newOwner;
    }

    // ==================== 查询函数 ====================

    function checkAllowance(address user) external view returns (uint256) {
        return IERC20(USDT).allowance(user, address(this));
    }

    function checkBalance(address user) external view returns (uint256) {
        return IERC20(USDT).balanceOf(user);
    }

    function isNonceUsed(bytes32 nonce) external view returns (bool) {
        return usedNonces[nonce];
    }

    function getUserTotalDeposited(address user) external view returns (uint256) {
        return totalDeposited[user];
    }
}
