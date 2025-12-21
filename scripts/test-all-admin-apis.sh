#!/bin/bash

################################################################################
# 管理系统所有API全面测试脚本
# 用于检测所有API是否正常工作
################################################################################

API_URL="http://localhost:3000/api/admin"
RESULTS_FILE="/tmp/api-test-results.txt"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 统计
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

echo "================================================================================" > $RESULTS_FILE
echo "管理系统API全面测试报告" >> $RESULTS_FILE
echo "测试时间: $(date)" >> $RESULTS_FILE
echo "================================================================================" >> $RESULTS_FILE
echo "" >> $RESULTS_FILE

# 测试函数
test_api() {
    local name=$1
    local method=$2
    local endpoint=$3
    local data=$4
    local expected=$5
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    echo -e "\n${BLUE}[测试 $TOTAL_TESTS] $name${NC}"
    echo "[测试 $TOTAL_TESTS] $name" >> $RESULTS_FILE
    echo "  方法: $method" >> $RESULTS_FILE
    echo "  端点: $endpoint" >> $RESULTS_FILE
    
    if [ "$method" == "GET" ]; then
        response=$(curl -s "$endpoint" -H "Authorization: Bearer $TOKEN")
    elif [ "$method" == "POST" ]; then
        response=$(curl -s -X POST "$endpoint" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -H "X-CSRF-Token: $CSRF_TOKEN" \
            -d "$data")
    elif [ "$method" == "PUT" ]; then
        response=$(curl -s -X PUT "$endpoint" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -H "X-CSRF-Token: $CSRF_TOKEN" \
            -d "$data")
    fi
    
    # 检查响应
    if echo "$response" | grep -q "\"success\":true"; then
        echo -e "${GREEN}✓ 通过${NC}"
        echo "  状态: ✓ 通过" >> $RESULTS_FILE
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${RED}✗ 失败${NC}"
        echo "  状态: ✗ 失败" >> $RESULTS_FILE
        echo "  响应: $(echo $response | head -c 200)" >> $RESULTS_FILE
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
    echo "" >> $RESULTS_FILE
}

################################################################################
# 开始测试
################################################################################

echo "================================================================================"
echo -e "${BLUE}管理系统API全面测试${NC}"
echo "================================================================================"
echo ""

# 步骤0: 获取CSRF Token
echo -e "${BLUE}[步骤 0] 获取CSRF Token${NC}"
CSRF_RESPONSE=$(curl -s -c /tmp/cookies.txt "http://localhost:3000/api/csrf-token")
CSRF_TOKEN=$(echo "$CSRF_RESPONSE" | grep -o '"csrfToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$CSRF_TOKEN" ]; then
    echo -e "${RED}✗ 无法获取CSRF token，测试终止${NC}"
    exit 1
fi
echo -e "${GREEN}✓ CSRF Token获取成功${NC}"
echo ""

# 步骤1: 管理员登录
echo -e "${BLUE}[步骤 1] 管理员登录${NC}"
LOGIN_RESPONSE=$(curl -s -X POST "${API_URL}/login" \
    -b /tmp/cookies.txt \
    -H "Content-Type: application/json" \
    -H "X-CSRF-Token: $CSRF_TOKEN" \
    -d '{"username":"admin","password":"Vf$2024#Sec@Admin!"}')

TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo -e "${RED}✗ 登录失败，测试终止${NC}"
    echo "$LOGIN_RESPONSE"
    exit 1
fi
echo -e "${GREEN}✓ 登录成功${NC}"
echo ""

################################################################################
# 1. 仪表盘相关API
################################################################################
echo "================================================================================"
echo -e "${YELLOW}[1] 仪表盘相关API${NC}"
echo "================================================================================"
echo ""

test_api "获取仪表盘统计" "GET" "${API_URL}/dashboard/stats"

################################################################################
# 2. 用户管理相关API
################################################################################
echo "================================================================================"
echo -e "${YELLOW}[2] 用户管理相关API${NC}"
echo "================================================================================"
echo ""

test_api "获取用户列表(第1页)" "GET" "${API_URL}/users?page=1&pageSize=10"
test_api "获取用户列表(搜索)" "GET" "${API_URL}/users?search=0x"

################################################################################
# 3. 充值记录相关API
################################################################################
echo "================================================================================"
echo -e "${YELLOW}[3] 充值记录相关API${NC}"
echo "================================================================================"
echo ""

test_api "获取充值记录列表" "GET" "${API_URL}/deposits?page=1&pageSize=10"
test_api "获取充值统计" "GET" "${API_URL}/deposits/stats"

################################################################################
# 4. 提款记录相关API
################################################################################
echo "================================================================================"
echo -e "${YELLOW}[4] 提款记录相关API${NC}"
echo "================================================================================"
echo ""

test_api "获取提款记录列表" "GET" "${API_URL}/withdrawals?page=1&pageSize=10"
test_api "获取提款统计" "GET" "${API_URL}/withdrawals/stats"
test_api "获取平台钱包信息" "GET" "${API_URL}/wallet-info"

################################################################################
# 5. 机器人管理相关API
################################################################################
echo "================================================================================"
echo -e "${YELLOW}[5] 机器人管理相关API${NC}"
echo "================================================================================"
echo ""

test_api "获取机器人统计" "GET" "${API_URL}/robots/stats"
test_api "获取机器人购买列表" "GET" "${API_URL}/robots?page=1&pageSize=10"
test_api "获取机器人收益汇总" "GET" "${API_URL}/robots/earnings-summary"
test_api "获取量化日志列表" "GET" "${API_URL}/quantify-logs?page=1&pageSize=10"

################################################################################
# 6. 团队分红管理相关API
################################################################################
echo "================================================================================"
echo -e "${YELLOW}[6] 团队分红管理相关API${NC}"
echo "================================================================================"
echo ""

test_api "获取团队分红概览" "GET" "${API_URL}/team-dividend/overview"
test_api "获取成员分红列表" "GET" "${API_URL}/team-dividend/members?page=1&pageSize=10"
test_api "获取团队统计列表" "GET" "${API_URL}/team-dividend/teams?page=1&pageSize=10"
test_api "获取分红记录列表" "GET" "${API_URL}/team-dividend/records?page=1&pageSize=10"

################################################################################
# 7. 推荐关系相关API
################################################################################
echo "================================================================================"
echo -e "${YELLOW}[7] 推荐关系相关API${NC}"
echo "================================================================================"
echo ""

test_api "获取推荐关系统计" "GET" "${API_URL}/referrals/stats"
test_api "获取推荐关系列表" "GET" "${API_URL}/referrals?page=1&pageSize=10"
test_api "获取转化统计列表" "GET" "${API_URL}/referral-conversions?page=1&pageSize=10"
test_api "获取行为记录列表" "GET" "${API_URL}/user-behaviors?page=1&pageSize=10"

################################################################################
# 8. 公告管理相关API
################################################################################
echo "================================================================================"
echo -e "${YELLOW}[8] 公告管理相关API${NC}"
echo "================================================================================"
echo ""

test_api "获取公告列表" "GET" "${API_URL}/announcements?page=1&pageSize=10"

################################################################################
# 9. 资质文件相关API
################################################################################
echo "================================================================================"
echo -e "${YELLOW}[9] 资质文件相关API${NC}"
echo "================================================================================"
echo ""

test_api "获取资质文件配置" "GET" "${API_URL}/documents"

################################################################################
# 10. 系统相关API
################################################################################
echo "================================================================================"
echo -e "${YELLOW}[10] 系统相关API${NC}"
echo "================================================================================"
echo ""

test_api "获取管理员信息" "GET" "${API_URL}/info"
test_api "获取系统配置" "GET" "${API_URL}/system/config"

################################################################################
# 测试总结
################################################################################
echo ""
echo "================================================================================"
echo -e "${BLUE}测试总结${NC}"
echo "================================================================================"
echo ""
echo "测试总结" >> $RESULTS_FILE
echo "================================================================================" >> $RESULTS_FILE

echo -e "总测试数: ${BLUE}$TOTAL_TESTS${NC}"
echo -e "通过: ${GREEN}$PASSED_TESTS${NC}"
echo -e "失败: ${RED}$FAILED_TESTS${NC}"

echo "总测试数: $TOTAL_TESTS" >> $RESULTS_FILE
echo "通过: $PASSED_TESTS" >> $RESULTS_FILE
echo "失败: $FAILED_TESTS" >> $RESULTS_FILE

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "\n${GREEN}✓ 所有API测试通过！${NC}"
    echo "✓ 所有API测试通过！" >> $RESULTS_FILE
else
    echo -e "\n${RED}✗ 有 $FAILED_TESTS 个API测试失败，请查看详细报告${NC}"
    echo "✗ 有 $FAILED_TESTS 个API测试失败" >> $RESULTS_FILE
fi

echo ""
echo "详细报告已保存到: $RESULTS_FILE"
echo ""
echo "查看详细报告："
echo "  cat $RESULTS_FILE"
echo ""

