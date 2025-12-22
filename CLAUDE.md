# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

VituFinance is a cryptocurrency finance platform with AI trading robots, staking, copy trading, and referral systems. It's built as a monorepo with three main applications.

## Architecture

```
/
├── backend/         # Node.js + Express API server (ES modules)
├── frontend/        # Vue 3 + Vite user-facing app
├── admin/           # Vue 3 + Vite admin dashboard
├── scripts/         # Maintenance and deployment scripts
└── backups/         # Database backups
```

### Backend (Node.js/Express)
- **Entry point**: `backend/server.js` (large monolithic file ~230KB)
- **Database**: MySQL via `mysql2/promise` with connection pooling (`backend/db.js`)
- **Admin routes**: `backend/src/adminRoutes.js` - handles all admin API endpoints
- **Key route modules** in `backend/src/routes/`:
  - `robotRoutes.js` - AI trading robot management
  - `authRoutes.js` - Wallet signature authentication (TokenPocket)
  - `luckyWheelRoutes.js` - Lucky wheel/lottery system
  - `proxyRoutes.js` - Proxy services
- **Cron jobs** in `backend/src/cron/`:
  - `robotExpiryCron.js` - Robot expiration processing
  - `teamDividendCron.js` - Team broker daily dividends
  - `depositMonitorCron.js` - Deposit monitoring
  - `simulatedGrowthCron.js` - Simulated amount growth
- **Security modules** in `backend/src/security/`:
  - SQL injection protection, enhanced protection, general security middleware
- **Utils** in `backend/src/utils/`:
  - `referralMath.js` - CEX 8-level referral reward calculations
  - `teamMath.js` - Team broker rules
  - `errorLogger.js` - Error logging system
  - `auditLogger.js` - Audit logging
  - `bscTransferService.js` - BSC blockchain transfers

### Frontend (Vue 3)
- **Tech stack**: Vue 3, Vite, Element Plus, Pinia, Vue Router, vue-i18n
- **Dev port**: 5173
- **Build output**: `frontend/dist/`
- **Key views**: Home, Robot, Pledge, Follow, Invite, Assets (wallet)
- **Path alias**: `@` → `src/`

### Admin (Vue 3)
- **Tech stack**: Vue 3, Vite, Element Plus, Pinia, ECharts, Three.js
- **Dev port**: 3001
- **Base path**: `/admin/`
- **Build output**: `admin/dist/`
- **Auth**: JWT token stored in `localStorage` as `admin_token`
- **Key views**: Dashboard, Users, Deposits, Withdrawals, Robots, Settings, ErrorLogs, IPBlacklist

## Common Commands

### Backend
```bash
cd backend
npm run dev          # Start with nodemon (hot reload)
npm start            # Production start
```

### Frontend
```bash
cd frontend
npm run dev          # Dev server on :5173
npm run build        # Production build
npm run preview      # Preview production build
```

### Admin
```bash
cd admin
npm run dev          # Dev server on :3001
npm run build        # Production build
npm run preview      # Preview production build
```

### Production Services
```bash
pm2 restart vitu-backend     # Restart backend service
pm2 logs vitu-backend        # View backend logs
nginx -t && systemctl reload nginx  # Reload nginx config
```

### Database Backup
```bash
./scripts/backup-database.sh   # Manual backup (auto runs daily at 3am)
```

### Logs
```bash
tail -f /www/wwwlogs/vitufinance.com.error.log   # Nginx errors
tail -f /root/.pm2/logs/vitu-backend-error.log   # Backend errors
```

## Environment Configuration

Backend requires `.env` file (see `backend/env.example`):
- Database: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- Security: `JWT_SECRET`, `ADMIN_KEY`
- Platform: `PLATFORM_WALLET_ADDRESS` (BSC)
- Server: `PORT` (default 3000), `NODE_ENV`

## Key Technical Details

- Backend uses ES modules (`"type": "module"`)
- Database timezone is UTC+8 (Asia/Shanghai)
- Admin API proxy: `/api` → `http://localhost:3000`
- Frontend uses code splitting by vendor (vue-vendor, element-plus, i18n)
- Admin uses code splitting (element-plus, vue-vendor, echarts, three)
- Wallet authentication uses signature verification (Web3 wallets like TokenPocket)
