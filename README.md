<div align="center">
  <img src="dashboard/public/icon.svg" alt="Skeet Logo" width="100">
  <h1>🎯 Skeet — PVP Trading Agent</h1>
  <p><em>Skeet is a fully autonomous trading agent built specifically for Creatorbid's <strong>BID Protocol "Beat the House"</strong> PvP trading competition.</em></p>
  
  <img src="docs/readme-hero.png" alt="Skeet Hero" width="100%">
  <br/>
  <br/>

  [![Live Demo](https://img.shields.io/badge/🚀_Live-Demo-06b6d4?style=for-the-badge)](#)
  [![Pitch Deck](https://img.shields.io/badge/📊_Pitch-Deck-f59e0b?style=for-the-badge)](#)
  [![Pitch Video](https://img.shields.io/badge/🎬_Pitch-Video-ef4444?style=for-the-badge)](#)
  [![Built for Creatorbid](https://img.shields.io/badge/Creatorbid-BID_Protocol-8b5cf6?style=for-the-badge)](#)

  <br/>

  ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
  ![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
  ![Next.js](https://img.shields.io/badge/Next.js_16-black?style=for-the-badge&logo=next.js)
  ![React](https://img.shields.io/badge/React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
  ![Tailwind](https://img.shields.io/badge/Tailwind_v4-38B2AC?style=for-the-badge&logo=tailwindcss&logoColor=white)
  ![SQLite](https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white)
  ![Ethers.js](https://img.shields.io/badge/Ethers.js_v6-2735C4?style=for-the-badge&logo=ethereum&logoColor=white)
  ![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)
  [![Skeet CI](https://github.com/edycutjong/skeet/actions/workflows/ci.yml/badge.svg)](https://github.com/edycutjong/skeet/actions/workflows/ci.yml)
</div>

---

## 📸 See it in Action
*(Insert a high-quality GIF here showing the core workflow of your app)*
![App Demo](dashboard/public/og-image.png)

## 💡 The Problem & Solution
In PvP trading competitions, speed, precise timing, and risk management are critical, and human execution is too slow to compete at the edge. 
**Skeet** solves this by autonomously front-running liquidity dissolutions and continuously optimizing trade execution.

**Key Features:**
- ⚡ **Autonomous Execution:** State machine handles WATCH ➔ TRADE ➔ EXIT transitions seamlessly.
- 🔒 **Protocol-Native Edge:** Synchronizes natively with BID Protocol's clock to execute precisely at second `162s` to bypass AMM liquidation slippage.
- 🎨 **Real-Time Telemetry:** Dashboard UI to monitor real-time PnL and active round execution charts.
- 🛡️ **Budget Guards:** Sizing fractions are calculated natively against the EOA/Safe balances on chain `42069`.

## 🏗️ Architecture & Tech Stack
We built the trading daemon using **TypeScript**, **ethers.js**, and **better-sqlite3** for persistence. The telemetry dashboard is powered by **Next.js 16** and **Tailwind CSS**.

```mermaid
flowchart TD
    subgraph Chain["BID Protocol Testnet"]
        GS[Game Phase + Clock]
        AMM[AMM Price + Reserves]
        TX[Swap Txns]
    end

    subgraph Agent["Skeet Agent (TypeScript)"]
        FEED[Feed Listener]
        STATE[State Machine: WATCH ➔ TRADE ➔ EXIT]
        SIG[Signals Engine: EMA + Volatility]
        RISK[Risk Engine: Kelly + Throttle]
        DEC[decide Brain]
        EXEC[Safe Executor]
        LOG[(SQLite Database)]
    end

    GS --> FEED
    AMM --> FEED
    FEED --> STATE --> SIG --> RISK --> DEC --> EXEC --> TX
    DEC --> LOG
    EXEC --> LOG
```

### 🚀 Performance Benchmarks & Testing
* **Vitest Suite**: 119 unit tests passing (>95% statement coverage on core files).
* **Latency**: Running `npm run bench` over 1,000 mock tick evaluations returns a **Median (p50)** evaluation latency of **0.0005 ms** (Max: 0.0636 ms).

## 🏆 Sponsor Tracks Targeted
* **Creatorbid's BID Protocol**: Skeet leverages native protocol features like `GET /api/game` for exact server timelines and optimizes against the AMM dissolution phase payload structure on chain `42069`.

## 🚀 Run it Locally (For Judges)

1. **Clone the repo:** `git clone https://github.com/edycutjong/skeet.git`
2. **Install dependencies:** `npm install && cd dashboard && npm install && cd ..`
3. **Set up environment variables:** Rename `.env.example` to `.env` and add your BID access code.
4. **Run safety verifications and start the daemon:**
   ```bash
   npm test
   npm run verify-offline
   npm start
   ```
5. **Run the telemetry dashboard:**
   ```bash
   cd dashboard
   npm run dev
   # Open http://localhost:3000
   ```

> **Note for Judges:** 
> You can bypass live trading and view our offline backtest evaluations by running `npm run backtest`.
