# 🚀 FlowSync Local Development & Monitoring (GitHub-Ready)

````markdown
# 🚀 FlowSync Local Development & Monitoring

![FlowSync Banner](https://img.shields.io/badge/FlowSync-Local%20Development-blue)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)
![NPM](https://img.shields.io/badge/NPM-9%2B-orange)
![License](https://img.shields.io/badge/License-MIT-yellow)
![Status](https://img.shields.io/badge/Status-Production%20Ready-brightgreen)

**FlowSync** is a multi-platform transaction sync and monitoring system integrated with **Xero** and multiple payment providers. This README describes the local environment, CLI scripts, NPM commands, monitoring, health checks, and logging for a full production-ready setup.

---

## 📋 Table of Contents

- [Introduction](#-introduction)
- [Architecture](#-architecture)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [NPM Commands](#-npm-commands)
- [Monitoring](#-monitoring)
- [Health Check](#-health-check)
- [Logs & Reports](#-logs--reports)
- [Security](#-security)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🏗️ Architecture

### Mermaid Architecture Diagram

```mermaid
graph TB
    A[Payment Providers] --> B[FlowSync Middleware]
    B --> C[Xero Accounting]
    B --> D[Local Development]
    D --> E[CLI Scripts]
    D --> F[Monitoring]
    D --> G[Health Check]
    F --> H[Alerts]
    G --> I[Reports]
    
    subgraph "Payment Providers"
        A1[PayPal]
        A2[Stripe]
        A3[Wise]
        A4[Payflow.buzz]
        A5[IGN Auto]
    end
    
    subgraph "Local Development"
        E1[test-connection.js]
        E2[manual-sync.js]
        E3[check-status.js]
        E4[monitoring.js]
        E5[health-check.js]
    end
````

### Data Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Payment      │     │ FlowSync     │     │ Xero         │
│ Provider     │────▶│ Middleware   │────▶│ Accounting   │
└──────────────┘     └──────────────┘     └──────────────┘
        │                    │                    │
        ▼                    ▼                    ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Transaction  │     │ Data         │     │ Invoice      │
│ Processing   │     │ Transformation│     │ Creation     │
└──────────────┘     └──────────────┘     └──────────────┘
```

---

## 📥 Installation

### Prerequisites

* Node.js v18+
* NPM v9+
* FlowSync account & API key
* Access to payment providers

### Quick Setup

```bash
# 1. Clone repo
git clone https://github.com/your-org/flowsync-local.git
cd flowsync-local

# 2. Install dependencies
npm install

# 3. Copy environment config
cp .env.example .env
# Edit .env with your API keys

# 4. Test connection
npm run test
```

---

## ⚙️ Configuration

### `.env` Example

```env
FLOWSYNC_API_URL=https://api.flowsync.buzz
FLOWSYNC_API_KEY=your_api_key_here
FLOWSYNC_CLIENT_ID=your_client_id_here
FLOWSYNC_TENANT_ID=your_tenant_id_here

XERO_CLIENT_ID=your_xero_client_id
XERO_CLIENT_SECRET=your_xero_client_secret
XERO_TENANT_ID=webtechnicom_tenant

MONITORING_ENABLED=true
CHECK_INTERVAL=300000
ALERT_THRESHOLD=3
ALERT_PHONE=+17034571882
ALERT_EMAIL=alerts@example.com

TWILIO_SID=your_twilio_sid
TWILIO_TOKEN=your_twilio_token
TWILIO_FROM=+15017122661

LOG_LEVEL=info
LOG_FILE=./logs/flowsync.log
```

---

## 🛠️ NPM Commands

| Command           | Description                  | Exit Codes                        |
| ----------------- | ---------------------------- | --------------------------------- |
| `npm run test`    | Test FlowSync API connection | 0=OK, 1=Fail                      |
| `npm run sync`    | Manual sync of transactions  | 0=OK, 1=Warning, 2=Fail           |
| `npm run status`  | Check current sync status    | 0=OK, 1=Warning, 2=Fail           |
| `npm run monitor` | Start continuous monitoring  | N/A                               |
| `npm run health`  | Full health check report     | 0=Healthy, 1=Warning, 2=Unhealthy |
| `npm run dev`     | Start in dev mode (Nodemon)  | N/A                               |

### Typical Workflow

```bash
npm run test        # Test connection
npm run status      # Check status
npm run sync        # Manual sync
npm run monitor     # Start monitoring
npm run health      # Run health check
```

---

## 👁️ Monitoring

* Continuous check every 5 minutes
* Email/SMS alerts after consecutive failures
* Detailed logs in `logs/flowsync.log`
* Health snapshots in `logs/health-snapshot.json`

---

## 🏥 Health Check

| Check          | Description               | Success Criteria  |
| -------------- | ------------------------- | ----------------- |
| API Connection | FlowSync API              | Response < 1000ms |
| Integrations   | External providers        | 100% healthy      |
| Sync Status    | Last sync time            | < 24h             |
| Transactions   | Recent transactions       | ≥ 1 today         |
| Xero Status    | Connection & success rate | >95%              |
| Performance    | API response time         | < 1000ms          |

---

## 📊 Logs & Reports

```
logs/
├── flowsync.log
├── status-history.json
├── health-history.json
└── health-snapshot.json
```

View logs:

```bash
tail -f logs/flowsync.log
grep "ERROR\|WARNING" logs/flowsync.log
```

---

## 🔐 Security

* Never commit `.env`
* Use tokens with minimal permissions
* Rotate API keys regularly
* Audit logs and configure alerts for suspicious activity

```bash
# .gitignore
.env
*.env.local

# 🚀 FlowSync Local Development & Monitoring

![FlowSync Banner](https://img.shields.io/badge/FlowSync-Local%20Development-blue)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)
![NPM](https://img.shields.io/badge/NPM-9%2B-orange)
![License](https://img.shields.io/badge/License-MIT-yellow)
![Status](https://img.shields.io/badge/Status-Production%20Ready-brightgreen)

**FlowSync** is a multi-platform financial transaction synchronization and monitoring platform integrated with Xero and various payment providers. This README covers the local environment setup, CLI scripts, NPM commands, monitoring, and health-checks for a complete operational setup.

---

## 📋 Table of Contents

- [Introduction](#-introduction)
- [Architecture](#-architecture)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [NPM Commands](#-npm-commands)
- [Monitoring](#-monitoring)
- [Health Check](#-health-check)
- [Logs & Reports](#-logs--reports)
- [Security](#-security)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🏗️ Architecture

### Diagram

```mermaid
graph TB
    A[Payment Providers] --> B[FlowSync Middleware]
    B --> C[Xero Accounting]
    B --> D[Local Development]
    D --> E[CLI Scripts]
    D --> F[Monitoring]
    D --> G[Health Check]
    F --> H[Alerts]
    G --> I[Reports]

    subgraph "Payment Providers"
        A1[PayPal]
        A2[Stripe]
        A3[Wise]
        A4[Payflow.buzz]
        A5[IGN Auto]
    end

    subgraph "Local Development"
        E1[test-connection.js]
        E2[manual-sync.js]
        E3[check-status.js]
        E4[monitoring.js]
        E5[health-check.js]
    end
````

### Data Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Payment    │     │   FlowSync   │     │     Xero     │
│   Provider   │────▶│   Middleware │────▶│   Accounting │
└──────────────┘     └──────────────┘     └──────────────┘
        │                    │                    │
        ▼                    ▼                    ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Transaction  │     │   Data       │     │   Invoice    │
│  Processing  │     │ Transformation │   │   Creation   │
└──────────────┘     └──────────────┘     └──────────────┘
```

---

## 📥 Installation

### Prerequisites

* Node.js 18+
* NPM 9+
* FlowSync account with API key
* Access to your payment providers

### Quick Setup

```bash
# 1. Clone the repository
git clone https://github.com/your-org/flowsync-local.git
cd flowsync-local

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your API keys

# 4. Test the connection
npm run test
```

---

## ⚙️ Configuration

### `.env` File

```env
FLOWSYNC_API_URL=https://api.flowsync.buzz
FLOWSYNC_API_KEY=your_api_key_here
FLOWSYNC_CLIENT_ID=your_client_id_here
FLOWSYNC_TENANT_ID=your_tenant_id_here

XERO_CLIENT_ID=your_xero_client_id
XERO_CLIENT_SECRET=your_xero_client_secret
XERO_TENANT_ID=webtechnicom_tenant

MONITORING_ENABLED=true
CHECK_INTERVAL=300000
ALERT_THRESHOLD=3

ALERT_PHONE=+17034571882
ALERT_EMAIL=alerts@example.com

TWILIO_SID=your_twilio_sid
TWILIO_TOKEN=your_twilio_token
TWILIO_FROM=+15017122661

LOG_LEVEL=info
LOG_FILE=./logs/flowsync.log
```

---
🛠️ NPM Commands
Command	Description	Notes
npm run test	Test connection to FlowSync	Checks API connectivity and credentials
npm run sync	Manual transaction synchronization	Dry-run by default
npm run status	Check transaction status	Returns exit codes
npm run monitor	Start continuous monitoring	Sends SMS/email alerts
npm run health	Full health check	Tests all integrations
npm run dev	Development mode	Uses Nodemon for auto reload
npm run flowsync	Run full FlowSync engine	Fetches, transforms, sends to Xero, updates FlowSync, logs results
💡 npm run flowsync executes the complete FlowSync pipeline:
Fetch transactions from FlowSync
Apply all transformations (including IGN → 666)
Send transactions to Xero
Update FlowSync with xero_transaction_id
Generate logs and reports
🔄 IGN → Xero Synchronization
The script sync-ign-to-xero.js:
Detects transactions containing IGN or 666
Converts them to Xero BANKTRANSFER format
Maps all IGN transactions → account 666
Updates FlowSync after successful sync
Handles logging and errors
Run example:
# Test IGN → Xero logic
node test-ign-sync.js

# Real synchronization
node sync-ign-to-xero.js
👁️ Monitoring
Checks every 5 minutes
Sends SMS/email alerts on failure
Detailed logs in ./logs/flowsync.log
Maintains status history and JSON reports
🏥 Health Check
Checks: API connection, integrations, sync status, recent transactions, Xero connection, performance
Exit codes:
0 = Healthy
1 = Warning
2 = Unhealthy
3 = Critical
📊 Logs & Reports
logs/
├── flowsync.log
├── status-history.json
├── health-history.json
└── health-summary-*.json
tail -f logs/flowsync.log to view live logs
grep "ERROR\|WARNING" logs/flowsync.log to filter errors
🔐 Security
Never commit .env
Use minimal-permission tokens
TLS 1.3 + AES-256 for sensitive data
Audit logs and set alerting
✅ Solves
Automatic detection of IGN → 666
Correct transformation to Xero BANKTRANSFER
Bidirectional update (FlowSync ↔ Xero)
Complete logging and alerts
Prevents xero_transaction_id: null

## 👁️ Monitoring

* Continuous checks every 5 minutes
* SMS/Email alerts on failure
* Detailed logging in `logs/flowsync.log`
* Status history in `status-history.json`
* Health check history in `health-history.json`

---

## 🏥 Health Check

* API Connection (<1000ms)
* Integration health (100% healthy)
* Last sync (<24h)
* Transactions ≥1 today
* Xero success rate >95%
* Performance metrics (<1000ms response)

---

## 📊 Logs & Reports

```
logs/
├── flowsync.log
├── status-history.json
├── health-history.json
└── health-summary-*.json
```

View logs:

```bash
tail -f logs/flowsync.log
grep "ERROR\|WARNING" logs/flowsync.log
ls -la logs/health-summary-*.json | head -5
```

---

## 🔐 Security

* Never commit `.env`
* Use limited-access tokens
* Encrypt sensitive data
* Audit logs regularly


MIT
## License

MIT © 2026 FlowSync
