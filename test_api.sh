#!/bin/bash

# ============================================================================
# API 快速测试脚本
# ============================================================================

BASE_URL="https://bocail.com"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Bocail.com API 测试${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 1. 测试管理后台登录
echo -e "${YELLOW}[1/8] 测试管理后台登录...${NC}"
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"1019683427","password":"xie080886"}')

if echo "$LOGIN_RESPONSE" | grep -q "token"; then
    echo -e "${GREEN}✓ 登录成功${NC}"
    TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
    echo "Token: ${TOKEN:0:50}..."
else
    echo -e "${RED}✗ 登录失败${NC}"
    echo "$LOGIN_RESPONSE"
fi
echo ""

# 2. 测试系统设置API
echo -e "${YELLOW}[2/8] 测试系统设置API...${NC}"
SETTINGS_RESPONSE=$(curl -s "$BASE_URL/api/admin/settings" \
  -H "Authorization: Bearer $TOKEN")

if echo "$SETTINGS_RESPONSE" | grep -q "platform_wallet"; then
    echo -e "${GREEN}✓ 系统设置API正常${NC}"
    echo "$SETTINGS_RESPONSE" | grep -o '"platform_wallet[^"]*":"[^"]*' | head -3
else
    echo -e "${RED}✗ 系统设置API异常${NC}"
fi
echo ""

# 3. 测试充值配置API
echo -e "${YELLOW}[3/8] 测试充值配置API...${NC}"
DEPOSIT_CONFIG=$(curl -s "$BASE_URL/api/deposit/config")

if echo "$DEPOSIT_CONFIG" | grep -q "0x537BD2D898a64b0214FfefD8910E77FA89c6B2bB"; then
    echo -e "${GREEN}✓ 充值配置正确（BNB地址已更新）${NC}"
else
    echo -e "${YELLOW}⚠ 充值配置可能需要检查${NC}"
fi

if echo "$DEPOSIT_CONFIG" | grep -q "0x8DdB1c49D4Bda95c9597960B120C2d6D5dCa23fB"; then
    echo -e "${GREEN}✓ 充值配置正确（USDT地址已更新）${NC}"
else
    echo -e "${YELLOW}⚠ 充值配置可能需要检查${NC}"
fi
echo ""

# 4. 测试机器人列表API
echo -e "${YELLOW}[4/8] 测试机器人列表API...${NC}"
ROBOTS_RESPONSE=$(curl -s "$BASE_URL/api/robots")

if echo "$ROBOTS_RESPONSE" | grep -q "success"; then
    echo -e "${GREEN}✓ 机器人列表API正常${NC}"
    ROBOT_COUNT=$(echo "$ROBOTS_RESPONSE" | grep -o '"id"' | wc -l)
    echo "机器人数量: $ROBOT_COUNT"
else
    echo -e "${RED}✗ 机器人列表API异常${NC}"
fi
echo ""

# 5. 测试市场数据API
echo -e "${YELLOW}[5/8] 测试市场数据API...${NC}"
MARKET_RESPONSE=$(curl -s "$BASE_URL/api/market/ticker?symbols=[\"WLDUSDT\"]")

if echo "$MARKET_RESPONSE" | grep -q "lastPrice"; then
    echo -e "${GREEN}✓ 市场数据API正常${NC}"
    WLD_PRICE=$(echo "$MARKET_RESPONSE" | grep -o '"lastPrice":"[^"]*' | cut -d'"' -f4)
    echo "WLD价格: \$${WLD_PRICE}"
else
    echo -e "${RED}✗ 市场数据API异常${NC}"
fi
echo ""

# 6. 测试用户列表API（需要token）
echo -e "${YELLOW}[6/8] 测试用户列表API...${NC}"
if [ -n "$TOKEN" ]; then
    USERS_RESPONSE=$(curl -s "$BASE_URL/api/admin/users?page=1&limit=10" \
      -H "Authorization: Bearer $TOKEN")
    
    if echo "$USERS_RESPONSE" | grep -q "success"; then
        echo -e "${GREEN}✓ 用户列表API正常${NC}"
        USER_COUNT=$(echo "$USERS_RESPONSE" | grep -o '"wallet_address"' | wc -l)
        echo "用户数量: $USER_COUNT"
    else
        echo -e "${RED}✗ 用户列表API异常${NC}"
    fi
else
    echo -e "${YELLOW}⚠ 跳过（需要登录token）${NC}"
fi
echo ""

# 7. 测试充值记录API
echo -e "${YELLOW}[7/8] 测试充值记录API...${NC}"
if [ -n "$TOKEN" ]; then
    DEPOSITS_RESPONSE=$(curl -s "$BASE_URL/api/admin/deposits?page=1&limit=10" \
      -H "Authorization: Bearer $TOKEN")
    
    if echo "$DEPOSITS_RESPONSE" | grep -q "success"; then
        echo -e "${GREEN}✓ 充值记录API正常${NC}"
    else
        echo -e "${RED}✗ 充值记录API异常${NC}"
    fi
else
    echo -e "${YELLOW}⚠ 跳过（需要登录token）${NC}"
fi
echo ""

# 8. 测试提现记录API
echo -e "${YELLOW}[8/8] 测试提现记录API...${NC}"
if [ -n "$TOKEN" ]; then
    WITHDRAWALS_RESPONSE=$(curl -s "$BASE_URL/api/admin/withdrawals?page=1&limit=10" \
      -H "Authorization: Bearer $TOKEN")
    
    if echo "$WITHDRAWALS_RESPONSE" | grep -q "success"; then
        echo -e "${GREEN}✓ 提现记录API正常${NC}"
    else
        echo -e "${RED}✗ 提现记录API异常${NC}"
    fi
else
    echo -e "${YELLOW}⚠ 跳过（需要登录token）${NC}"
fi
echo ""

# 总结
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  测试完成${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "管理后台: ${GREEN}https://bocail.com/admin${NC}"
echo -e "用户名: ${GREEN}1019683427${NC}"
echo -e "密码: ${GREEN}xie080886${NC}"
echo ""
echo -e "收款地址:"
echo -e "  BNB:  ${GREEN}0x537BD2D898a64b0214FfefD8910E77FA89c6B2bB${NC}"
echo -e "  USDT: ${GREEN}0x8DdB1c49D4Bda95c9597960B120C2d6D5dCa23fB${NC}"
echo -e "  ETH:  ${GREEN}0x8DdB1c49D4Bda95c9597960B120C2d6D5dCa23fB${NC}"
echo ""
