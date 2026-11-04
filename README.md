# ♠ Sattebaazi Calculator ♥

> **Real-world offline card game ledger, pot engine, and financial settlement calculator.**  
> Designed for physical card nights with friends & family — track bets, chip stacks, side pots, and settle debts without mental math or disputes.

---

## 🌟 Overview

**Sattebaazi Calculator** is an offline card game financial companion. Players use physical cards around the table in real life, while an admin records table actions in the app. The engine handles all math: blinds, chaals, raises, all-ins, main & side pots, points-based penalties, dealer payouts, and who owes whom.

---

## 🎮 Supported Games

### 1. 🃏 Teen Patti (3-Card Flash)
* **Betting Actions**: Boot, Chaal, Raise, Show, Mutual Show, and Fold.
* **Blind vs. Seen Rules**:
  * Players choose to play **Blind** (cards face down) or **Seen** (after viewing cards).
  * Blind bets are placed at half the stake of Seen bets (enforced by the game engine).
  * Viewing cards automatically updates a player's status and recalculates valid chaal amounts.
* **Stack & Balance Safeguards**: Prevents actions when a player lacks sufficient chips.

### 2. ♠ Texas Hold'em Poker
* **Street Progression**: Real-world Hold'em streets — Pre-Flop, Flop, Turn, River, and Showdown.
* **Blinds Management**:
  * Configurable Small Blind & Big Blind.
  * Clockwise blind button rotation after every hand.
  * Forced all-in handling when players have short stacks for blinds.
* **Dynamic Main & Side Pots Engine**:
  * Automatically separates contributions into the **Main Pot** and arbitrary **Side Pots** when players go all-in with different chip amounts.
  * Preserves contribution history across all streets.
  * Showdown eligibility: each pot is evaluated independently so players only win pots they contributed to.
  * Split pot resolution with remainder chip handling.

### 3. 🎴 Indian Rummy (Points Rummy)
* **Points-Based Scoring**: Configurable rate per point (e.g. ₹1/pt, ₹5/pt, ₹10/pt).
* **Configurable Hand Sizes & Meld Requirements**:
  * Select cards dealt per player (e.g. 7, 9, 10, 13, 21, or custom).
  * Built-in presets:
    * **7 Cards**: Pure Sequence (4) + Set (3).
    * **9 Cards**: Pure Sequence (3) + Any Sequence (3) + Set (3).
    * **10 Cards**: Pure Sequence (4) + Sequence (3) + Set (3).
    * **13 Cards (Classic)**: Pure Sequence (3) + 2nd Sequence (3) + Set (3) + Set/Run (4).
    * **21 Cards (Marriage)**: 3 Pure Sequences (3) + Sequence (3) + 3 Sets (3).
  * Dynamic meld builder for custom set & sequence rules.
* **Penalty Engine & Meld Checklist**:
  * Winner scores **0 points** and wins the total penalty pot.
  * If a player failed to complete the required **Pure Sequence**, full penalty points apply (capped at max points).
  * If a Pure Sequence was made, only unmelded cards count as penalty points.
  * Quick drops (1st Drop, Mid Drop, Full Count).

### 4. ♦ Blackjack (Casino 21)
* **Dealer vs. Players Engine**: Designate a player as Dealer/Banker or play against the Casino House.
* **Standard & Advanced Actions**:
  * Bets placed before each hand.
  * Win (1:1 payout)
  * Loss (dealer collects bet)
  * Push (original bet refunded)
  * Blackjack (3:2 payout)
  * Double Down (2:1 or −2:1)
  * Split Hands (each hand resolved independently)
  * Insurance (2:1 payout on dealer natural blackjack)
* Dealer/Banker chip balance tracked separately when banking as a player.

---

## 💰 Shared Financial & Settlement Architecture

* **Bankroll Modes (Per-Session Selection)**:
  * 🪙 **Chips Mode**: Players start with a fixed chip buy-in (e.g. ₹1,000). All-ins, rebuys, and stack depletion are strictly tracked.
  * 📜 **Debt Mode**: Fluid bankroll without chip counts. Profits and losses are tracked directly in the settlement ledger.
  * *Note: Bankroll mode is locked upon session creation to maintain balance integrity.*
* **"Who Owes Who" Debt Matrix**:
  * Real-time matrix mapping Debtors (rows) against Creditors (columns).
  * Net balance calculation for every player (`+` for net winners, `−` for net debtors).
  * Interactive 1-click settle chips (`₹20 ✓`) and "Mark all as settled" action.
* **Multi-Session Management**:
  * Create, filter, and switch between sessions per game.
  * All rounds, player stacks, transactions, and debts persist in MongoDB.

---

## 🔒 Security & Authentication

* **Mandatory Google OAuth Gatekeeper (`AuthGate`)**:
  * Unauthenticated users are barred from viewing or interacting with tables or bankrolls.
  * API endpoints (`/api/sessions`, `/api/games/[type]`) reject unauthenticated requests with `401 Unauthorized`.

---

## 🛠 Tech Stack

| Technology | Purpose |
|---|---|
| **Next.js 14** (App Router) | React framework, Server & Client Components, API route handlers |
| **TypeScript** | Strict typing for game states, pots, rounds, and transactions |
| **MongoDB & Mongoose** | Persistent schemas for Sessions, Games, and Historical Ledgers |
| **NextAuth.js** | Google OAuth 2.0 authentication |
| **Node.js Test Runner** | 24 automated unit tests (`node --test`) for pot math, blind rules, and scoring |
| **Pure CSS** | Bespoke luxury dark casino themes (responsive on desktop, tablet, and mobile) |

---

## 🚀 Getting Started

### 1. Prerequisites
* **Node.js** v18.17+ (v20+ recommended)
* **MongoDB** instance (local or MongoDB Atlas connection URI)
* **Google Cloud Console** OAuth 2.0 credentials (for Google Sign-In)

### 2. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/your-username/sattebaazi-calculator.git
cd sattebaazi-calculator
npm install
```

### 3. Environment Configuration
Create a `.env.local` file in the project root:
```env
# MongoDB Connection
MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/sattebaazi?retryWrites=true&w=majority

# NextAuth Configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_nextauth_secret_generated_here

# Google OAuth Credentials
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

> **Setting up Google OAuth:**
> 1. Go to [Google Cloud Console > Credentials](https://console.cloud.google.com/apis/credentials).
> 2. Create an **OAuth 2.0 Client ID** (Web application).
> 3. Add `http://localhost:3000/api/auth/callback/google` to **Authorized redirect URIs**.
> 4. Copy the Client ID and Secret to `.env.local`.

### 4. Running the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Testing

The repository includes comprehensive unit test suites covering pot calculations, blind rules, Indian rummy melds, and blackjack dealer payouts:

```bash
npm test
```

### Test Coverage Highlights:
* `tests/pokerPot.test.ts`:
  * Side pot separation for 2, 3, or more players going all-in with different chip stacks.
  * Folded players retaining pot contributions without eligibility.
  * Showdown ties and remainder chip distribution.
* `tests/blindRules.test.ts`:
  * Clockwise small & big blind button rotation.
  * Short stack forced all-in blind deductions.
  * Teen Patti blind vs. seen bet scaling.
* `tests/rummyEngine.test.ts`:
  * 7-card (4+3) and 9-card (3+3+3) custom hand size scoring.
  * Pure sequence requirements and unmelded card penalty capping.
* `tests/blackjackEngine.test.ts`:
  * Win, push, loss, blackjack (3:2), double downs, splits, and insurance payouts.

---

## 📂 Project Structure

```
sattebaazi-calculator/
├── app/
│   ├── api/
│   │   ├── auth/          # NextAuth & configuration status
│   │   ├── games/[type]/  # Active game state endpoints
│   │   └── sessions/      # Session CRUD endpoints
│   ├── blackjack/         # /blackjack route
│   ├── poker/             # /poker route
│   ├── rummy/             # /rummy route
│   ├── teen-patti/        # /teen-patti route
│   ├── globals.css        # Luxury casino design system
│   ├── layout.tsx         # Root layout with AuthGate & favicon
│   └── page.tsx           # Lobby card room
├── components/
│   ├── blackjack/         # Table & controls for 21
│   ├── common/            # Header, SeatsList, SessionsModal, DebtModal, etc.
│   ├── lobby/             # Game selection 2x2 grid
│   ├── poker/             # Table, community board, betting controls
│   ├── rummy/             # Table, meld scoring, config modal
│   ├── teen-patti/        # 3-card table & blind/seen controls
│   ├── AuthGate.tsx       # Mandatory login gatekeeper
│   └── AuthProvider.tsx   # NextAuth SessionProvider wrapper
├── hooks/
│   └── useGameEngine.ts   # Unified state & sync hook
├── lib/
│   ├── blackjackEngine.ts # Blackjack payout & outcome calculator
│   ├── blindRules.ts      # Blind rotation & deduction engine
│   ├── models/            # Mongoose Session & Game models
│   ├── mongodb.ts         # Cached MongoDB connection client
│   ├── pokerPot.ts        # Main pot & side pot calculator
│   └── rummyEngine.ts     # Rummy scoring & meld requirements engine
├── public/                # Favicon and icon assets
├── tests/                 # Node.js automated test suites
├── types/                 # Game, Player, Round, and Session interfaces
└── package.json
```

---

## 📜 License
Private project. All rights reserved.

