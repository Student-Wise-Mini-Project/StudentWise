# StudentWise

**Shared expenses for students, where AI adds repeated expenses based on email, upload receipts for easy changing and conduct insights.**

| | |
|---|---|
| **Team** | Gal Harel, Hila Zuckerman, Dana Bernstein |
| **Course** | Topics in Applications of Computer Science |
| **Date** | October 2026 |


## Introduction

### The problem

Students who share an apartment pay for many things together: rent, electricity, groceries, cleaning supplies. Someone pays, someone forgets, and after a few months nobody knows who owes whom. Apps like Splitwise and Tricount help with the bookkeeping, but every expense still has to be typed in by hand, and repeated bills are manually added, which is where people forget or make mistakes.

### Our solution

StudentWise is a Splitwise-style app for groups (a shared apartment, a couple, a trip). It has the usual features, and adds AI exactly where the manual work is:

- **Receipt scanning.** Take a photo, AI reads the lines, you fix mistakes and mark who shared what.
- **Bills from Gmail.** Utility bills are found in the inbox, read, and split in the right apartment, or held for review when the app is not sure.
- **Analytics.** Spending by category, month and member, budget warnings, alerts for unusual or duplicate bills, and a question box ("how much did we spend on groceries in August?") that is answered from the group's own data.

The basic features are groups, four ways to split an expense (equal, exact, percentage, weights), balances, settling up with the fewest payments, and recurring bills. The app works in English and Hebrew and can be installed on any phone.

### Tools

| Area | Technology |
|---|---|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2.0, Pydantic v2 |
| Database | PostgreSQL 16 (Docker), Alembic migrations |
| Security | JWT, Argon2 password hashing, Fernet encryption |
| AI and APIs | Anthropic Claude API (vision and structured output), Gmail API |
| Frontend | React, TypeScript, Vite, Tailwind CSS, TanStack Query |
| Testing | pytest, Vitest, Testing Library, MSW, GitHub Actions |


## System Specification

### Architecture

A client-server system. The React frontend talks to the backend only through a JSON REST API. The backend is the only part that touches the database, file storage, and outside services.

```mermaid
flowchart LR
    U[User<br/>phone or browser] --> FE[React PWA]
    FE -- REST / JSON + JWT --> API[FastAPI backend]
    API --> DB[(PostgreSQL)]
    API --> FS[Receipt storage]
    API --> CL[Claude API]
    API --> GM[Gmail API<br/>read-only]
```

The backend has four layers, and code may only call downward:

| Layer | Job |
|---|---|
| `api/` | Read and validate the HTTP request, call a service, return a response |
| `services/` | Business rules, permissions, and the database transaction |
| `repositories/` | Build queries, add rows |
| `domain/` | Pure math: splitting, settling up, anomaly scores |

Next to them, `core/` holds settings, security and errors, and `ai/` holds every call to Claude or Google.

### Data model

```mermaid
erDiagram
    USERS ||--o{ GROUP_MEMBERS : "belongs to"
    GROUPS ||--o{ GROUP_MEMBERS : has
    GROUPS ||--o{ EXPENSES : has
    EXPENSES ||--o{ EXPENSE_SPLITS : "split into"
    USERS ||--o{ EXPENSE_SPLITS : owes
    EXPENSES ||--o{ EXPENSE_ITEMS : "receipt lines"
    EXPENSE_ITEMS ||--o{ ITEM_SPLITS : "shared by"
    GROUPS ||--o{ SETTLEMENTS : has
    GROUPS ||--o{ RECURRING_BILLS : has
    GROUPS ||--o{ BUDGETS : has
    USERS ||--o| GMAIL_CONNECTIONS : connects
    USERS ||--o{ INGESTED_BILLS : "bills found"
```

An expense has a split row only for the people who take part in it. Bills read from Gmail wait in `ingested_bills` and become expenses only after they are approved, so unconfirmed AI output never affects a balance.


## Description of the Implementation

### Splitting and settling up

All splitting math is in `domain/splitting.py`. To handle rounding to sum up to the exact amount (for example to split 100 between 3 people), we use the largest remainder method: round every share down to the cent, then hand the leftover cents to the largest remainders.

Settling up (`domain/settlement_algo.py`) is the main algorithm. Each person's debts are reduced to one balance, which removes every circle of debt. The fewest possible payments is `n` minus the largest number of subgroups whose balances sum to zero. This is NP-hard in general, but flatmate groups are small, so for up to 14 people we solve it exactly with dynamic programming over subsets, and for larger groups we use a greedy method. 

### Recurring bills, budgets and analytics

- **Recurring bills.** A fixed bill like rent is created automatically when due. A changing bill like electricity sends a reminder instead of guessing. There is no background scheduler: opening a group posts what is due.
- **Budgets.** A monthly limit per category, with a warning at 80% and another when it is passed.
- **Unusual bills.** A group expense that is way above the regular expense over time creates an alert, that comes with a plain reason ("50% above the usual 3000").
- **Duplicates.** Two expenses with a close amount, a close date and a similar title are reported for a person to decide. Requests also accept an `Idempotency-Key`, so a retry from a phone with a bad connection does not create the expense twice.

### The AI features

All AI code is in `app/ai/`, under three rules: text in an image or email is data and never instructions, amounts come back from the model as text and are parsed into `Decimal`, and nothing the model reads becomes money until a strict rule or a person decides. We call Claude with structured output, so the answer must match a Pydantic schema that our code then checks.

**Receipt scanning.** The backend sends the photo to Claude and gets the store, date, lines and total. Our code builds a draft and adds warning codes when something is missing or does not add up. The scan saves nothing. On the review screen the user fixes mistakes and paints each line with the colour of the group members who shared it (if not marked then split between all members). A discount or tip is spread in proportion to each person's lines, and the per-person preview is computed by the server, so it is the same math as the final save, which becomes a normal exact split.

**Bills from Gmail.** The user connects Gmail with the read-only permission, and the refresh token is encrypted before it is stored. For each new email, Claude is asked whether it is a household bill and, if so, for the amount, due date, service and address. A pure function then routes the bill. It is split automatically only when the sender is a known utility, the amount was read, the user has exactly one matching apartment, there is no fixed recurring bill of that kind, and the currency matches. Anything else goes to a review screen with the reason. House numbers are compared exactly. 

**Asking questions (Text-to-SQL).** A user write a question in simple text, Claude writes a SQL query from the user's question.

1. A validator built on a real SQL parser (`sqlglot`) allows a single read-only `SELECT`.
2. Every table name is replaced by a copy filtered to the current group, so the model cannot see other groups, and the users table has no password column.
3. The query runs in a read-only transaction with a time limit and a row limit.

### Frontend

React and TypeScript, with TanStack Query for data.

- **Home.** One screen shows the net balance across every group the user is in, plus a combined activity feed of recent expenses and payments.
- **Insights, per group.** Charts for spend by category, by month and by member, switchable between "whole group" and "just me".
- **Settings.** Connect Gmail (read-only) so household bills are picked up automatically, switch the app between Hebrew and English, and manage the account.
- **Generated API types.** TypeScript types come from the backend's OpenAPI description, so the frontend does not compile when the backend changes. CI fails if they are out of date.
- **Hebrew and right-to-left.** Every string is a key in a message catalogue, and a missing Hebrew translation is a compile error. We use only logical CSS directions (start and end), so the layout mirrors correctly.
- **Design system.** Colours and fonts live in one folder.

### Testing and quality

- **Backend.** pytest runs against a real PostgreSQL database built from the actual migrations, with each test rolled back at the end. Every endpoint has a test. Every call to Claude or Google is replaced by a fake, so the suite needs no API key or network.
- **Frontend.** Vitest with MSW, plus guard tests that scan the code for hard-coded colours, left/right CSS and untranslated text.
- **CI.** GitHub Actions runs lint, migration check, all tests, build, and the API types check on every push.


## Demonstration

### Create a new account or connect to an existing account - and update your profile to enjoy the full experience


<p align="center">
  <img src="images/IMG_0465.png" alt="Settings" width="27%" />
  <img src="images/IMG_0463.png" alt="Create account" width="27%" />
  <img src="images/IMG_0464.png" alt="Connect to existing account" width="27%" />
</p>


### Create and view your groups


<p align="center">
  <img src="images/IMG_0470.png" alt="Add people to group" width="27%" />
  <img src="images/IMG_0491.png" alt="Add new group" width="27%" />
  <img src="images/IMG_0467.png" alt="Your groups" width="27%" />
</p>


### View your expenses


<p align="center">
  <img src="images/IMG_0468.png" alt="Your expenses in the group" width="42%" />
  <img src="images/IMG_0466.png" alt="Your full expenses" width="42%" />
</p>


### See what you owe people, remind someone to pay and settle up


<p align="center">
  <img src="images/IMG_0489.png" alt="Settle up" width="20%" />
  <img src="images/IMG_0488.png" alt="Create a settle" width="20%" />
  <img src="images/IMG_0487.png" alt="Remind" width="20%" />
  <img src="images/IMG_0469.png" alt="Pay someone" width="20%" />
</p>


### Create new expense - a repeated one or a one time


<p align="center">
  <img src="images/IMG_0477.png" alt="View expense and edit" width="20%" />
  <img src="images/IMG_0476.png" alt="How to split new expense" width="20%" />
  <img src="images/IMG_0475.png" alt="Create new expense" width="20%" />
  <img src="images/IMG_0471.png" alt="Repeated expense general info" width="20%" />
</p>


### Upload a receipe to automatically create new expense and split it smartly between the group members


<p align="center">
  <img src="images/IMG_0481.png" alt="Aprove receipt and edit" width="27%" />
  <img src="images/IMG_0480.png" alt="Load receipt" width="27%" />
  <img src="images/IMG_0478.png" alt="Scan receipt" width="27%" />
</p>


<p align="center">
  <img src="images/IMG_0485.png" alt="Save shared expense" width="27%" />
  <img src="images/IMG_0483.png" alt="Select who payed" width="27%" />
  <img src="images/IMG_0482.png" alt="Select row" width="27%" />
</p>


### Track what you spend under categories and unusual expenses, and question your AI assistant


<p align="center">
  <img src="images/IMG_0474.png" alt="AI query" width="42%" />
  <img src="images/IMG_0473.png" alt="Graphs" width="42%" />
</p>


## Conclusions and Summary

### What we achieved

We built a Splitwise-style app and used AI to remove the part people hate most, manually handling with bills. It works end to end: groups, four split types, balances, settling up with the fewest payments, recurring bills, budgets, and a bilingual mobile interface. On top of that, receipts are scanned and split line by line, utility bills arrive from Gmail into the right apartment, and the group's data can be queried in plain language.

The most important concept we learned and implemented is: **AI should suggest, and people or strict rules should decide.** The important design work was not the prompts but what happens after the model answers: drafts, review screens, trusted senders, and checks on every value. This is relevant for the features of upload receipt from picture and email detections of new bills.

### Summary

StudentWise is a complete expense-splitting app whose AI features save real typing without ever being trusted with money on their own. The project gave us practice in database design, algorithms, API design, security, frontend engineering, working with language models, and working as a team on one codebase.


## Running the Project

You need Python 3.12, Docker Desktop and Node 20 or newer. On Windows (PowerShell), from the repository root:

```powershell
docker compose up -d                 # PostgreSQL on port 5434

cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
alembic upgrade head
python seed.py                       # demo data
uvicorn app.main:app --reload        # API docs at http://localhost:8000/docs

cd ..\frontend                       # second terminal
npm install
npm run gen:api
npm run dev                          # app at http://localhost:5173
```

## Setup the project on your phone

1. From your phone - connect to https://studentwise-4o6d.onrender.com/login
2. Press the 3 dots or the share option in the chrome that opens
3. Choose the "add to home screen" or equivelent option
4. Enter the App from your home screen and connect with an existing user (for the demo with already existing data you can use - `gal@studentwise.dev` with the password `password123`) or create a new user.

* It might take a minute to load - we are using render to wrap the program so this layer is loading when someone enters the program (because we use the free option).

Enjoy:)