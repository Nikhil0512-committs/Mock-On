# 🛡️ Mock-On (Hold-On) — Autonomous AI Consumer Advocate & Statutory Promise Ledger

[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18+-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/Database-Neon%20PostgreSQL-336791?style=flat&logo=postgresql&logoColor=white)](https://neon.tech)
[![Sarvam AI](https://img.shields.io/badge/LLM-Sarvam%20105B-FF6B6B?style=flat)](https://www.sarvam.ai)
[![Gnani AI](https://img.shields.io/badge/Voice-Gnani%20Prisma%20%26%20Timbre-4A90E2?style=flat)](https://gnani.ai)

> **"You live your life. Mock-On negotiates, enforces deadlines, and protects your consumer rights."**

> 📄 **Challenge Submission Document**: Read the comprehensive **[One-Page Solution Brief](docs/ONE_PAGE_SOLUTION.md)** (also available as **[Word Document (.docx)](docs/Mock-On_One_Page_Solution.docx)** and **[Executive PDF](docs/Mock-On_One_Page_Solution.pdf)**).

Mock-On is a voice-first, multi-domain **Agentic AI Consumer Advocate**. It autonomously contacts corporate customer care helplines, navigates IVR phone trees, negotiates billing reversals in bilingual code-mixed Hindi & English, extracts legally binding promises into an auditable ledger, and automatically enforces statutory deadlines (TRAI, RBI, DGCA, IRDAI, CPA 2019).

---

## ⚡ The Problem

When consumers face erroneous deductions, failed UPI debits, or delayed flight refunds, companies deploy **corporate evasion tactics**:
- **Coupon Substitution**: Giving promotional vouchers instead of real bank refunds.
- **Procedural Stalling**: *"Call back after 3 days"*, *"Backend team checking"*.
- **Vague Commitments**: Leaving customers waiting indefinitely without firm dates.

Most people give up after hours on hold. **Mock-On automates the entire consumer defense lifecycle.**

---

## 🚀 Core Agentic Architecture & Key Features

### 1. 🎙️ Autonomous Bilingual Telephony Execution
- **Gnani Prisma v3.0 STT**: 8 kHz real-time telephony streaming speech-to-text tuned for noisy Indian telecom conditions and Hindi-English code-mixing (*Hinglish*).
- **Gnani Timbre v3.0 TTS**: Low-latency, natural conversational speech synthesis.
- **Dual Telephony Execution Modes**:
  - **Browser Voice Mode**: Autonomous simulation against scripted IVR trees and representative dialog.
  - **Live Operator Desk (Switchboard)**: WebRTC/WebSocket bridge where a real human teammate answers as the company desk while Mock-On negotiates.

### 2. ⚖️ Autonomous Statutory Counter-Negotiator (Feature 1)
Powered by **Sarvam 105B LLM**, Mock-On detects corporate evasion in real time:
- Rejects restricted coupons/vouchers under **Consumer Protection Act 2019, Section 2(47)** (*Unfair Trade Practices*) and insists on direct bank reversal.
- Demands firm statutory turnaround times against vague hedging under **TRAI QoS Regulations** and **RBI Master Directions** (T+5 mandatory TAT).

### 3. 📊 Live Corporate Evasion & Commitment Certainty Meter (Feature 2)
Real-time biometric & linguistic certainty gauge (0–100%) streamed via WebSocket:
- Dynamic tactic tags (`COUPON DIVERSION DETECTED`, `PROCEDURAL STALLING`, `SETTLEMENT REFUSED`, `FIRM COMMITMENT`).
- Real-time statutory law citations and actionable AI Advocate guidance.

### 4. 🔒 Tamper-Evident Promise Ledger
- Cryptographically timestamps representative promises (Ticket ID, refund amount, resolution due date, verbatim quotes).
- Persisted in **Neon PostgreSQL** with state machine validations (`pending` → `due_soon` → `overdue` / `fulfilled`).

### 5. ⏱️ Autonomous 24/7 SLA Tracking & 5-Day Check-in Loop
- Background worker (`deadline_worker.py`) monitors statutory deadlines without manual intervention.
- When a deadline lapses:
  - Dispatches automated 5-day check-in email with 1-click `[✓ Yes, Received]` and `[✗ No, Not Received]` verification buttons.
  - If unresolved, autonomously escalates case to `URGENT OVERDUE FOLLOW-UP`, places an automated callback to the company desk, and compiles an **Ombudsman Evidence Pack (PDF)**.

### 6. 🌐 9 Statutory Dispute Domains Supported
1. **E-Commerce & Quick Delivery**: Amazon, Flipkart, Swiggy, Blinkit, Zomato
2. **Banking & UPI**: HDFC Bank, SBI, ICICI, PhonePe, Google Pay (RBI T+5)
3. **Airlines & Travel**: IndiGo, Air India, IRCTC, MakeMyTrip (DGCA 7-day SLA)
4. **Telecom & Broadband**: Airtel, Jio, Vi, Tata Play (TRAI Regulations)
5. **Health & Motor Insurance**: Star Health, HDFC ERGO, Care Health (IRDAI 15-day SLA)
6. **Electricity & Gas Utilities**: Tata Power, BSES, Adani, IGL (SERC Standards)
7. **EdTech & Courses**: Scaler, UpGrad, Unacademy, Byju's (CPA 2019 & UGC)
8. **Cabs & EV Mobility**: Uber, Ola Electric, Rapido, Ather (MoRTH Guidelines)
9. **Rentals & Security Deposits**: NoBroker, PG Landlord, Stanza (Model Tenancy Act)

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 18, Vite, TypeScript, Tailwind CSS, Lucide Icons, Zustand, WebSockets |
| **Backend** | Python 3.11+, FastAPI, SQLAlchemy Async, Neon Serverless PostgreSQL |
| **Voice & Speech** | Gnani Prisma 8kHz STT, Gnani Timbre TTS (API vachana.ai) |
| **Extraction & Reasoning** | Sarvam 105B LLM (`sarvam-30b` / `Qwen2.5-7B-Instruct` fallback) |
| **Scheduler** | PostgreSQL `FOR UPDATE SKIP LOCKED` duplicate-safe background daemon |
| **Evidence & Legal** | ReportLab PDF Generator, SHA-256 Verbatim Transcripts, Resend Mail API |

---

## 💻 Local Setup & Quickstart

### Prerequisites
- **Python 3.11+**
- **Node.js 18+** & npm
- **PostgreSQL** (or Neon PostgreSQL cloud instance)

### 1. Clone the Repository
```bash
git clone https://github.com/Nikhil0512-committs/Mock-On.git
cd Mock-On
```

### 2. Configure Backend
```bash
cd backend
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
```
Edit `.env` and provide your credentials:
```ini
DATABASE_URL=postgresql+asyncpg://user:password@ep-xxx.neon.tech/neondb?ssl=require
GNANI_API_KEY=your-gnani-api-key
SARVAM_API_KEY=your-sarvam-key
```

Run the backend server:
```bash
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Configure Frontend
Open a new terminal:
```bash
cd frontend
npm install
npm run build
node serve.js
# Or for live development:
npm run dev
```

The application will be live at:
- **Web App**: `http://localhost:5173`
- **Interactive API Docs**: `http://localhost:8000/docs`
- **Operator Switchboard**: `http://localhost:5173/switchboard`
- **Simulation Lab**: `http://localhost:5173/demo`

---

## 🎬 Hackathon Demo Walkthrough

1. **Intake (`/`)**: Select a dispute category (e.g. *Telecom & DTH* or *E-Commerce*), select brand or type custom details, choose **Live Company Desk** or **Browser Voice**, and click **Dispatch Agent**.
2. **Live Call (`/call`)**: Watch the AI Advocate initiate the call, navigate menus, and converse in bilingual Hindi/English.
3. **Switchboard Counter-Negotiation (`/switchboard`)**: As the representative, offer a coupon or stall. Observe the AI Advocate instantly refute using **CPA 2019 Section 2(47)** as the **Live Evasion Meter** alerts the consumer.
4. **Promise Ledger (`/ledger`)**: Review the extracted binding commitment locked with ticket number and due date.
5. **Simulation Lab (`/demo`)**: Advance the demo clock by 5 days. Watch the background worker autonomously detect the SLA breach, send the 1-click check-in email, and trigger an urgent follow-up callback.

---

## 👥 Authors & Acknowledgments

Built for the **Great Indian AI Challenge** by:
- **Nikhil Sharma** ([@Nikhil0512-committs](https://github.com/Nikhil0512-committs))

Special thanks to **Gnani.ai** for the Prisma & Timbre telephony speech APIs and **Sarvam AI** for sovereign Indic language models.

