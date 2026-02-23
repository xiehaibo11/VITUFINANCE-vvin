发现漏洞！PUT /api/admin/settings/:key 端点只需要 JWT 认证，不需要安全密码，攻击者可以直接修改钱包地址。而且 JWT Secret 是弱密钥！现在立即修复。

接口封装模式以todesk，攻击和破解无法被获取