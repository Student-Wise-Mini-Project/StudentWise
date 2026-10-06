# StudentWise — Architecture

Diagrams for mission 11.2: the layers, the database, and the paths money and AI
take through them. They render on GitHub (Mermaid). Every name in them is a real
module or table; when one stops being true, fix the diagram in the same commit.

The database diagrams were generated from the SQLAlchemy models on 2026-10-06
(20 tables, main at `bcc649c` plus 7.1–7.3). Two tables are on their way in on
branches not yet merged: `receipt_images` (deployment, 10.3: receipt photos in
Postgres, because a free host's disk does not survive a restart) and
`expense_embeddings` (semantic search, 8.3). Add them when they land.

- [1. The layers](#1-the-layers)
- [2. The database](#2-the-database)
- [3. Four ways into the ledger](#3-four-ways-into-the-ledger)
- [4. From the ledger to settling up](#4-from-the-ledger-to-settling-up)
- [5. How the AI reads the data, safely](#5-how-the-ai-reads-the-data-safely)

---

## 1. The layers

Four backend layers and nothing more. Each arrow is an import, and nothing
imports upward.

```mermaid
flowchart TB
    subgraph client["Phone or browser"]
        pwa["React 19 PWA<br/>TanStack Query · i18n en/he · service worker"]
    end

    subgraph backend["FastAPI backend (Python 3.12)"]
        api["<b>api/</b><br/>HTTP only: parse, validate, call a service,<br/>return a schema. No SQL."]
        deps["core/deps.py<br/>who you are · are you in this group"]
        services["<b>services/</b><br/>business rules · <b>owns the transaction</b><br/>(the only layer that commits)"]
        repos["<b>repositories/</b><br/>queries · add · flush<br/><b>never commits</b>"]
        domain["<b>domain/</b><br/>pure functions: splitting, min-cash-flow,<br/>anomalies, SQL guard, phone numbers"]
        ai["<b>ai/</b><br/>one replaceable function per model call:<br/>receipt_ocr · bill_parser · gmail · chat"]
        core["core/<br/>errors · security · storage · crypto"]
    end

    db[("Postgres 16<br/>NUMERIC(12,2) money<br/>VARCHAR + CHECK enums")]
    claude["Anthropic API<br/>claude-sonnet-5"]
    gmail["Gmail API<br/>read-only"]

    pwa -- "JSON over /api<br/>Bearer JWT" --> api
    api --> deps
    api --> services
    services --> repos
    services --> domain
    services --> ai
    services --> core
    repos --> db
    ai --> claude
    ai --> gmail
```

**Why it is shaped like this.**

- **Only services commit.** A repository that committed could leave an expense
  saved with no splits. A service builds everything — the expense, its splits,
  the notifications about it — and commits once, so it all lands or none of it
  does.
- **`domain/` takes numbers and returns numbers.** Splitting, the settlement
  plan, anomaly scores and the SQL guard have no database and no web framework
  in them, so they are tested exhaustively and fast (`pytest tests/unit`).
- **Every model call is one function in `ai/`**, which the tests replace. No
  test needs an API key or a network, and swapping a model is a setting.
- **The frontend never does money arithmetic.** It formats what the API sends;
  the API allocates cents. Two implementations would disagree by a cent.

---

## 2. The database

Twenty tables. Ids are UUIDs, money is `NUMERIC(12,2)`, and every enum is a
`VARCHAR` with a `CHECK` rather than a Postgres `ENUM`, so adding a value is not
a migration headache. Deleting is real: removing an expense cascades to its
splits, items, comments and notifications.

### The ledger

What balances are computed from, and what produces it.

```mermaid
erDiagram
    users ||--o{ group_members : "is a member"
    groups ||--o{ group_members : "has"
    groups ||--o{ expenses : "records"
    users ||--o{ expenses : "paid"
    expenses ||--|{ expense_splits : "is shared as"
    users ||--o{ expense_splits : "owes"
    expenses ||--o{ expense_items : "itemised as"
    expense_items ||--o{ item_splits : "had by"
    users ||--o{ item_splits : "had"
    groups ||--o{ settlements : "records"
    users ||--o{ settlements : "pays / is paid"
    groups ||--o{ split_rules : "has"
    split_rules ||--|{ split_rule_shares : "weights"
    split_rules |o--o{ expenses : "applied to"
    groups ||--o{ recurring_bills : "has"
    recurring_bills ||--o{ recurring_bill_participants : "shared by"
    recurring_bills |o--o{ expenses : "posted"
    groups ||--o{ budgets : "has"

    users {
        uuid id PK
        string name
        string email "unique, lower-cased"
        string phone_number "E.164 Israeli mobile, nullable"
        string password_hash "argon2, never leaves the API"
    }
    groups {
        uuid id PK
        string name
        string type "SHARED_APARTMENT, COUPLE, TRIP, SOLO"
        string currency "on the group, never the expense"
        string address "matches Gmail bills to a flat"
        timestamptz archived_at "closed group"
    }
    group_members {
        uuid group_id PK, FK
        uuid user_id PK, FK
        string role "OWNER, MEMBER"
        numeric default_split_weight
        timestamptz left_at "leaving keeps the debt"
    }
    expenses {
        uuid id PK
        uuid group_id FK
        uuid payer_id FK
        string title
        numeric total_amount
        string category
        date expense_date
        string split_type "EQUAL, EXACT, PERCENTAGE, WEIGHT"
        string source "MANUAL, OCR, GMAIL_API, RECURRING"
        jsonb ai_metadata "what the model read"
        uuid split_rule_id FK
        uuid recurring_bill_id FK
    }
    expense_splits {
        uuid id PK
        uuid expense_id FK
        uuid user_id FK
        numeric owed_amount "sums to the total, to the cent"
        numeric share_value
    }
    expense_items {
        uuid id PK
        uuid expense_id FK
        int position
        string name
        numeric amount
    }
    item_splits {
        uuid id PK
        uuid item_id FK
        uuid user_id FK
    }
    settlements {
        uuid id PK
        uuid group_id FK
        uuid from_user_id FK
        uuid to_user_id FK
        numeric amount
        string method "MANUAL, BIT, PAYBOX"
        timestamptz settled_at
    }
    split_rules {
        uuid id PK
        uuid group_id FK
        string name
        string category "applies itself to this category"
    }
    split_rule_shares {
        uuid id PK
        uuid rule_id FK
        uuid user_id FK
        numeric weight
    }
    recurring_bills {
        uuid id PK
        uuid group_id FK
        numeric amount "null: the amount varies"
        string frequency
        date next_due_on
        int occurrences_total
    }
    recurring_bill_participants {
        uuid id PK
        uuid bill_id FK
        uuid user_id FK
        numeric share_value
    }
    budgets {
        uuid id PK
        uuid group_id FK
        string category
        numeric amount
        string period
    }
```

`expense_splits` is the single source of truth for who owes what. Items, split
rules and recurring bills all **produce** ordinary splits; balances and
analytics never learn that items exist.

### Around the ledger

Conversation, alerts, ingestion and safety. None of it is money.

```mermaid
erDiagram
    expenses ||--o{ expense_comments : "discussed in"
    users ||--o{ expense_comments : "wrote"
    users ||--o{ notifications : "receives"
    groups ||--o{ notifications : "about"
    expenses |o--o{ notifications : "about"
    settlements |o--o{ notifications : "about"
    users ||--o| gmail_connections : "connected"
    users ||--o{ ingested_bills : "mailbox of"
    groups |o--o{ ingested_bills : "routed to"
    expenses |o--o| ingested_bills : "became"
    users ||--o{ chat_conversations : "asked"
    groups ||--o{ chat_conversations : "about"
    chat_conversations ||--|{ chat_messages : "contains"
    users ||--o{ idempotency_keys : "sent"

    expense_comments {
        uuid id PK
        uuid expense_id FK
        uuid user_id FK
        text body
    }
    notifications {
        uuid id PK
        uuid user_id FK
        uuid actor_id FK
        uuid group_id FK
        string kind
        jsonb payload "facts only; worded at read time"
        timestamptz read_at
    }
    gmail_connections {
        uuid id PK
        uuid user_id FK
        string google_email
        text refresh_token_encrypted "Fernet"
        bool needs_reconnect
    }
    ingested_bills {
        uuid id PK
        uuid user_id FK
        string gmail_message_id
        string status "IMPORTED, PENDING_REVIEW, APPROVED, DISMISSED..."
        string review_reason
        numeric total_amount
        string service_address
        uuid group_id FK
        uuid expense_id FK
    }
    chat_conversations {
        uuid id PK
        uuid group_id FK
        uuid user_id FK "private to this person"
        string title
    }
    chat_messages {
        uuid id PK
        uuid conversation_id FK
        string role "USER, ASSISTANT"
        text content
        jsonb tools_used
    }
    idempotency_keys {
        uuid id PK
        uuid user_id FK
        string scope
        string key
        string fingerprint
    }
```

- **A bill from Gmail is not an expense until it is decided.** It waits in
  `ingested_bills`; there is deliberately no status column on `expenses`, which
  seventeen modules read as money.
- **Notification wording is never stored** — a `kind` and a payload of facts —
  so the app is shown in Hebrew without a migration.
- **Idempotency keys** make a retried `POST` on a bad connection return the
  first result instead of creating a second expense.

---

## 3. Four ways into the ledger

However an expense arrives, it goes through `expense_service.build_expense`, so
splitting, notifications and the budget check are written once.

```mermaid
flowchart LR
    manual["Typed in<br/>POST /groups/{id}/expenses"]
    receipt["Receipt photo<br/>POST .../receipts/scan"]
    gmail["Utility bill in Gmail<br/>POST /integrations/gmail/sync"]
    recurring["Recurring bill falls due<br/>POST .../recurring-bills/run"]

    ocr["ai/receipt_ocr<br/>Claude reads the lines"]
    draft["A draft the person checks,<br/>and taps who had which line"]
    parse["ai/bill_parser<br/>provider, amount, address"]
    route{"domain/bill_routing<br/>known sender? one matching flat?<br/>amount read? currency right?"}
    review["ingested_bills<br/>waits for a person"]

    build["<b>expense_service.build_expense</b>"]
    split["domain/splitting<br/>largest remainder:<br/>100 / 3 = 33.34 + 33.33 + 33.33"]
    write[("expense + expense_splits<br/>+ notifications<br/><b>one transaction</b>")]

    manual --> build
    receipt --> ocr --> draft -- "person saves" --> build
    gmail --> parse --> route
    route -- "certain" --> build
    route -- "anything else" --> review -- "person approves" --> build
    recurring --> build
    build --> split --> write
```

**Nothing a model read touches money until it is decided.** A scanned receipt
is a draft the person corrects. A Gmail bill is split without a person only when
everything checks out; otherwise it waits with the reason, because anyone can
email a convincing "לתשלום". Nothing runs on a scheduler: opening the app posts
due bills and syncs Gmail once per session, and `run_due_bills.py` /
`fetch_new_bills.py` exist for a real cron.

---

## 4. From the ledger to settling up

Balances are never stored. They are computed from the ledger on every read, so
they cannot drift from it.

```mermaid
flowchart LR
    ledger[("expenses.payer<br/>expense_splits<br/>settlements")]
    balances["balance_service.compute_balances<br/>paid − owed + sent − received<br/>(always sums to zero)"]
    plan["domain/settlement_algo.minimise_transfers<br/>the fewest transfers that clear everyone<br/>— provably minimal, not greedy"]
    screen["Balances screen<br/>who is up, who is down,<br/>and the plan"]

    ledger --> balances --> plan --> screen
```

Paying a transfer from the plan (7.1–7.3):

```mermaid
sequenceDiagram
    actor Gal
    participant App as StudentWise (Balances)
    participant API
    participant Bit as Bit / PayBox app

    Gal->>App: Pay Maya
    App-->>Gal: Maya's number (052-123-4567) and ₪1,474.76,<br/>each with a copy button
    Gal->>App: Copy, copy, Open Bit
    App->>Bit: the app's store page, which shows "Open"<br/>(neither app has a documented payment link)
    Gal->>Bit: paste number and amount, send
    Gal->>App: I paid Maya
    App-->>Gal: Record a payment — Bit already chosen, amount filled in
    Gal->>App: Record it
    App->>API: POST /groups/{id}/settlements {method: BIT, amount}
    API-->>App: 201 — balances recomputed from the ledger
```

Only the person can say the money left, so nothing moves a balance until it is
recorded. Maya's number is visible only to people who share a group with her;
user search never returns phone numbers.

---

## 5. How the AI reads the data, safely

Ask (9.9) and the chat assistant (8.1–8.2) let a model write SQL and call
tools. The model is treated as **an input, not a trusted component**: it has
read expense titles and names that anyone in the group could have typed.

```mermaid
flowchart TB
    q["A question, in English or Hebrew"]
    chat["chat_service<br/>tool loop, history, language"]
    tools["chat_tools<br/>read-only calls into tested services:<br/>balances, by category, by month,<br/>anomalies, duplicates, list expenses"]
    gen["nl_query_service.generate_sql<br/>Claude + the schema description"]
    guard["domain/sql_guard<br/>parsed as SQL, not regex:<br/>one statement · SELECT only ·<br/>no writes anywhere in the tree ·<br/>no password_hash · no dangerous functions"]
    scope["wrap_in_group_scope<br/>every table shadowed by a CTE<br/>filtered to this group"]
    run[("READ ONLY transaction<br/>statement timeout · row cap<br/>always rolled back")]
    answer["Answer, with the SQL<br/>shown on request"]

    q --> chat
    q -- "Ask screen" --> gen
    chat --> tools
    tools -- "query_database" --> gen
    gen --> guard --> scope --> run --> answer
    tools --> answer
```

Any one of these layers failing still leaves the data safe: a query that slipped
the guard still sees one group, in a transaction that cannot write. Text from the
data — titles, notes, names — is wrapped and labelled as data, never
instructions, in every prompt. How often the answers are actually right is
measured against the real model in [`docs/evals/`](evals/).
