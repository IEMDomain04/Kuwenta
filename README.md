# Offline AI Personal Finance Assistant

**Android-first · Local-first · Private · Human-in-the-loop**

A lightweight Android app for recording income and expenses, tracking savings, setting budgets, and understanding personal finances through natural conversation. Financial records stay on the phone. The MVP uses manual Save for creation and confirmation for edits/deletions; on-device AI is a future feature.

This README describes the planned product, architecture, and development roadmap.

> Chat to record money. Dashboard to understand money. Notifications to notice important changes.

## Contents

- [Agreed MVP specification](#agreed-mvp-specification)
- [Product principles](#product-principles)
- [User experience](#user-experience)
- [Recording and managing transactions](#recording-and-managing-transactions)
- [Finance features](#finance-features)
- [Insights and notifications](#insights-and-notifications)
- [AI workflow](#ai-workflow)
- [Technical architecture](#technical-architecture)
- [Privacy and backup](#privacy-and-backup)
- [Release plan](#release-plan)
- [Development roadmap](#development-roadmap)
- [Success criteria](#success-criteria)

## Agreed MVP specification

This specification defines the current implementation scope. The later product-vision sections describe future features and do not expand the MVP.

### Scope

Build Home, Transactions, and Settings using the existing Expo, React Native, TypeScript, and Expo Router stack. Persist financial records with `expo-sqlite`, which is already installed. Reuse existing theme components and avoid unnecessary dependencies and abstractions.

Create only Cash, with a user-defined opening balance defaulting to PHP 0. Do not implement multiple-account management, savings, goals, budgets, transfers, notifications, conversational parsing, or AI yet.

| Screen | MVP contents |
| --- | --- |
| Home | Cash balance, monthly income and expenses, recent records, and entry shortcuts. |
| Transactions | Manual income/expense entry, chronological history, editing, and deletion. |
| Settings | Cash opening-balance setup and basic app information. |

### Financial rules

- PHP only; store `currency: "PHP"` on each account.
- Store money as integer centavos and transaction amounts as positive values. Transaction type determines whether money increases or decreases.
- Parse monetary input exactly, validate safe integer ranges, and avoid floating-point monetary arithmetic.
- Treat opening balance as a starting adjustment, not income. Store it on the account and exclude it from monthly income and expenses.
- Derive Cash balance from opening balance plus recorded income minus recorded expenses. Do not store a manually maintained running balance.
- Keep `transactionDate`, `transactionTime`, `createdAt`, and `updatedAt` separate. Transaction date/time always use Philippine time (UTC+8). Monthly reports use `transactionDate`; audit timestamps are stored in UTC.
- Default transaction date/time to the current Philippine date/time regardless of device timezone. Allow valid backdated entries. Use YYYY-MM-DD and HH:mm:ss; timezone selection and full change history are deferred.
- Allow negative account balances and display a visible warning.
- Require a valid transaction type, positive amount, category, account, date, and time. Notes are optional.
- Prevent duplicate records from repeated Save actions or retries of the same submission. Separate legitimate records with identical details must still be possible.

### Account and transaction models

These are conceptual fields; finalize the SQLite schema during the persistence step.

| Entity | Fields |
| --- | --- |
| Account | `id`, `name`, `currency`, `openingBalance`, `purpose` (`spending` or `savings`), `includedInAvailable`, `archived` |
| Transaction | `id`, `type`, `amount`, `accountId`, `category`, `transactionDate`, `transactionTime`, `createdAt`, `updatedAt`, `notes?`, `destinationAccountId?`, `adjustmentDirection?` |

Cash starts with purpose `spending`, included in Available Money, and not archived. Enable only `INCOME` and `EXPENSE` operations in the MVP. Prepare the structure for future `TRANSFER` and `ADJUSTMENT` types without building their functionality. Future adjustments need an explicit direction because amounts remain positive.

Future transfers move money between accounts without counting as income or expenses. When account management is introduced, accounts with transactions must be archived rather than permanently deleted; historical records must remain available.

### Transaction workflow

- Create: enter the fields and tap **Save**, with success feedback and Undo if feasible. No separate creation-confirmation dialog is required.
- Edit: modify a draft and confirm before changing the saved record.
- Delete: show the selected record and require confirmation before removal.
- Cancel: discard pending changes and preserve the original data.
- Future conversational entry: review and confirm interpreted proposals before saving. The AI confirmation state machine below applies to this future workflow only.

### Future metric definitions (documentation only)

| Metric | Definition |
| --- | --- |
| Total Money | Sum of account balances for asset accounts. |
| Available Money | Sum of balances from accounts included in available spending money. |
| Saved This Month | Monthly transfers from spending to savings minus transfers from savings to spending. Transfers between savings accounts do not count. |
| Savings Rate | Saved This Month divided by Monthly Income, as a percentage. Display an em dash when income is zero; allow negative rates. |
| Goals | Initially, one savings goal can link to one dedicated savings account. |

Do not implement these aggregate metrics or goals yet. Display Cash balance and monthly income/expenses in the MVP.

### Implemented finance foundation

Pure TypeScript logic lives in `src/features/finance/`: `types.ts`, `money.ts`, `dates.ts`, `validation.ts`, and `calculations.ts`. It is independent of React and SQLite. Amounts must fit safe integer centavos, dates must be between 1900 and 9999, and unsupported future transaction types are rejected by MVP validation/calculations. Negative account balances remain valid.

Run the focused tests with the existing TypeScript compiler and Node's built-in test runner (verified with Node 24):

```sh
npm run test:finance
npx tsc --noEmit
```

Tests live in `tests/finance/`. The test command compiles only the finance modules into ignored `.expo/finance-tests/` output before running the tests. No additional test dependencies are required. Tests cover the finance foundation and the storage operations described below. The modules are not yet connected to app screens.

### Implemented SQLite persistence

`src/features/finance/storage/` contains:

- `database.ts`: opens `kuwenta.db` through `expo-sqlite`, enables foreign keys and WAL, initializes the schema, and closes failed connections. Callers own the returned connection and close it when finished.
- `migrations.ts`: atomically creates schema version 1 and one Cash account with zero opening balance. Reopening preserves data; databases from newer schema versions are rejected.
- `accounts.ts`: retrieves Cash and updates its separate opening balance without recording income. Archived accounts reject changes.
- `transactions.ts`: creates submission IDs and provides validated create, read, edit, and delete operations. History sorts by Philippine transaction date/time with stable tie-breakers. Edits preserve creation timestamps. Writes bind user input as SQL parameters.

Create a submission ID once with `createTransactionId`, then reuse it for every retry of `createTransaction`. The unique database ID prevents duplicate records. Retrying an already saved ID returns its current record without overwriting it. Separate IDs allow legitimate identical expenses. A deleted record is not a durable submission tombstone; the later UI must retire that submission after deletion or Undo.

The schema includes optional transfer/adjustment fields, but constraints and storage validation allow only income/expense records. A future migration is required to enable the deferred types. No running balance is stored; feed retrieved records to the existing calculation functions. Call edit/delete operations only after UI confirmation (or explicit creation Undo).

`npm run test:finance` also runs `storage.test.cjs` against real SQLite using Node 24's built-in `node:sqlite` module and a small test adapter for Expo's async methods. Tests cover persisted records after reopening, repeated initialization/submissions, updates/deletion, backdating/sorting, constraints, and rollback. The adapter serializes transactions; it does not validate Expo's native connection behavior or Android concurrent-write locking. Test that integration on the phone when wiring up the app. Exclusive SQLite transactions target native mobile; web integration is outside this MVP.

No additional dependencies were installed. Screens and app lifecycle integration remain the next milestone.

### Acceptance checks

Verify that opening balances are excluded from monthly income, expenses reduce balances, edits/deletions recalculate results, and backdated records appear in the correct month. Invalid amounts and missing required fields must not save. Repeated taps must not duplicate records. Preserve exact centavos and verify records survive closing and reopening the app.

With income and expense in the same reporting month:

| Item | PHP amount |
| --- | ---: |
| Opening Cash | 1,000 |
| Income | 500 |
| Expense | 120 |
| Expected Cash balance | **1,380** |
| Expected monthly income | **500** |
| Expected monthly expenses | **120** |

## Product principles

| Principle | What it means |
| --- | --- |
| Local first | The app works without an account, backend, cloud database, or internet connection. Financial information remains on the device by default. |
| User confirmation | AI can interpret, classify, suggest, explain, and summarize. Manual creation uses Save with success feedback and Undo if feasible. Edits/deletions and future conversational proposals require confirmation. |
| Reliable calculations | Application code calculates balances, totals, savings rates, remaining budgets, category spending, comparisons, averages, and goal progress. AI explains those results. |
| Manual entry always available | The tracker remains usable when AI fails, inference is slow, or the phone cannot run the model efficiently. |
| Lightweight design | Build the manual finance engine and local persistence first; add deterministic parsing later. Add the smallest local model that performs well enough. |

The guiding philosophy is: **AI interprets. Code calculates. Rules detect. The user decides.**

Possible product positioning:

> A private personal finance assistant that lives on your phone.
>
> Talk to your money without sending your money data to the cloud.

## User experience

This section describes the longer-term product vision. Current implementation scope is defined by the agreed MVP specification above.

### Home screen

The home screen should help users understand their money within a few seconds. Make the prompt **“What happened to your money today?”** prominent, alongside an **Add manually** button.

```text
Good morning 👋

Available          ₱12,480
Spent this month    ₱8,420
Saved this month    ₱4,000
Savings goal           72%

What happened to your money?
Tell me...

[ + Income ] [ − Expense ] [ ⇄ Transfer ]
[ Add manually ]

Your Money Today
🍔 Food spending ↑ 18% this week
🎯 Emergency Fund: ₱14,400 / ₱20,000
```

Quick input suggestions can include “Spent ₱120,” “Got paid,” and “Move to savings.”

### Main screens

| Screen | Contents |
| --- | --- |
| Home | Available money, monthly income and spending, savings, conversational input, recent insights, and goal progress. |
| Transactions | Chronological history, search, category and transaction-type filters, editing, and deletion. |
| Goals | Savings goals, progress, contributions, and money transfers. |
| Chat / Ask My Money | Transaction entry, corrections to pending transactions, financial questions, explanations, and summaries. |
| Settings | Categories, accounts, budgets, notification preferences, currency, privacy, backup, and AI model settings. |

### Chat actions and questions

The same chat handles both changes and information requests:

| Mode | Examples | Confirmation |
| --- | --- | --- |
| Actions | “Spent 250 on lunch.” “Add my ₱30,000 salary.” “Move ₱2,000 to savings.” | Required before modifying data. |
| Questions | “How much did I spend on food this month?” “How much have I saved?” “What was my biggest expense?” | Not required because records remain unchanged. |

Other questions can include comparisons with last month and how much money is available until payday.

### Taglish support

The assistant should eventually understand practical Filipino/English transaction descriptions, including:

- “Gumastos ako 120 sa lunch.”
- “Nagbigay si Mama ng 500.”
- “250 pamasahe today.”
- “Save ko 1k.”
- “Bumili ako coffee 180.”
- “May sahod akong 35k.”
- “Move 2k sa emergency fund.”

## Recording and managing transactions

### Conversational entry

Interpret the user's message, present a proposed transaction, and offer **Confirm**, **Edit**, and **Cancel**. Save only after confirmation.

| User message | Proposed interpretation | Next step |
| --- | --- | --- |
| “I got 250 pesos for my baon.” | Income · ₱250 · Allowance · Cash · Description: Baon | Confirm the income. |
| “Mama gave me 500.” | Income · ₱500 · Cash · Allowance or Gift | Clarify the category, then confirm. |
| “Gumastos ako 150 sa Jollibee.” | Expense · ₱150 · Food · Jollibee · Cash · Today | Confirm the expense. |
| “79 pesos pamasahe.” | Expense · ₱79 · Transportation | Review and confirm. |
| “Bought coffee for 180 yesterday.” | Expense · ₱180 · Food · Coffee · Yesterday | Review and confirm. |

A proposed transaction card could look like this:

```text
− ₱180
Category: Food
Description: Coffee
Account: Cash
Date: Today

[ Confirm ] [ Edit ] [ Cancel ]
```

### Transfers

Receiving money creates income; moving existing money between accounts creates a transfer. A transfer changes where money is stored while keeping the user's total money unchanged.

For example, “I received ₱1,000 for baon” adds income to Cash. “I saved ₱500 from my baon” proposes a transfer from Cash to Savings.

| Account | Before transfer | After moving ₱500 |
| --- | ---: | ---: |
| Cash | ₱1,000 | ₱500 |
| Savings | ₱2,000 | ₱2,500 |
| **Total** | **₱3,000** | **₱3,000** |

### Corrections, edits, and deletion

Users can correct a pending transaction through chat. After “I spent 350 at Uniqlo,” the message “Actually make that 450” updates the proposal to **−₱450 · Shopping · Uniqlo**. Nothing is saved until the user confirms.

Changes to saved records also require confirmation. For “Delete the Jollibee transaction,” show the matching record—Jollibee, ₱150, Food, October 9—and offer **Delete** and **Cancel** before removing it.

### Manual entry

**Add manually** lets users enter the transaction type, amount, category, account, date, and notes without using AI.

### Example flows

**Income:** The user enters “I got 250 for my baon.” The app proposes ₱250 of Allowance income in Cash. After confirmation, it saves the transaction, increases Cash and monthly income by ₱250, recalculates insights, and replies: “Added. You received ₱250 in allowance.” No cloud request occurs.

**Expense:** The user enters “Gumastos ako 1,200 sa shoes.” The app proposes a ₱1,200 Shopping expense in Cash. After confirmation, the insight engine may detect that weekly Shopping spending is 45% above normal. The user can tap **Explain** for a local AI explanation of the calculated figures.

**Ambiguous input:** For “500 galing kay Mama,” ask how to categorize the money, offering Allowance, Gift, or Other. Once the user selects a category, show the final proposal for confirmation. If the transaction type itself is unclear, clarify that too.

## Finance features

This section describes the longer-term product vision. Current implementation scope is defined by the agreed MVP specification above.

### Accounts and categories

Future accounts are local representations of money: **Cash, Savings, E-wallet, and Bank**. Users can rename them to Wallet, GCash, Maya, BPI, or Emergency Fund. The app does not connect to those services.

| Category type | Defaults |
| --- | --- |
| Expenses | Food, Transportation, Shopping, Bills, Entertainment, Health, Education, Family, Subscriptions, Other. |
| Income | Salary, Allowance, Freelance, Gift, Business, Other. |

Custom categories can be added in a later release.

### Dashboard

Display monthly totals and category spending clearly. The following October example illustrates the information to show:

| Metric | Value |
| --- | ---: |
| Income | ₱30,000 |
| Expenses | ₱17,200 |
| Savings | ₱8,000 |
| Available | ₱4,800 |
| Savings rate | 26.7% |

| Expense category | Amount |
| --- | ---: |
| Food | ₱6,300 |
| Transportation | ₱2,400 |
| Shopping | ₱2,100 |
| Entertainment | ₱1,600 |
| Bills | ₱4,800 |

### Savings goals

Users can create goals such as an **Emergency Fund** with a ₱20,000 target. A current amount of ₱14,000 represents **70% progress**.

“Put ₱1,000 into my emergency fund” proposes a transfer from Cash to Emergency Fund and requires confirmation.

### Category budgets

Optional monthly category budgets show spending, remaining funds, and a suggested daily limit. Application code calculates every value.

| Food budget example | Value |
| --- | ---: |
| Monthly budget | ₱6,000 |
| Spent | ₱4,920 (82%) |
| Remaining | ₱1,080 |
| Days remaining | 9 |
| Suggested daily limit | ₱120 |

### Ask My Money

The assistant answers budgeting questions using application-generated figures. For “Can I spend ₱1,500 this weekend?”, the application might calculate:

| Metric | Amount |
| --- | ---: |
| Available cash | ₱4,800 |
| Expected upcoming bills | ₱2,100 |
| Discretionary money | ₱2,700 |

The assistant can explain that spending ₱1,500 would leave approximately ₱1,200 of recorded discretionary money, while mentioning relevant budget pressures. Present this as budgeting information rather than authoritative financial advice.

## Insights and notifications

This section describes the longer-term product vision. Current implementation scope is defined by the agreed MVP specification above.

### Deterministic insight rules

The finance engine detects conditions worth mentioning. AI can explain an insight after the rule engine identifies it.

| Insight | Example condition | Example message |
| --- | --- | --- |
| Budget warning | `foodSpent >= foodBudget * 0.80` and `daysRemaining >= 7` | “You've already used 82% of your food budget with nine days remaining.” |
| Spending spike | `thisWeekSpending > averageWeeklySpending * 1.30` | “Your spending this week is 34% above your recent average.” |
| Savings progress | `savingsGoalProgress >= 0.75` | “You're already 75% of the way toward your emergency fund.” |
| Positive spending pattern | `currentMonthExpenses < previousMonthExpenses * 0.90` | “Your spending is currently 12% lower than last month.” |
| Logging reminder | No transaction recorded for at least three days | “You haven't recorded anything for three days. Anything to add?” |

### Local notifications

Notifications run locally on Android without a server. Examples include:

- **🍔 Food budget getting high:** 82% used with nine days remaining.
- **🎯 You're almost there:** 75% of a ₱20,000 savings goal reached.
- **📊 Your week in money:** ₱2,850 spent this week, 14% less than last week; tap for a summary.
- **✏️ Anything to record?:** No transaction added in three days.

The notification flow is:

1. Financial data changes and the application recalculates totals.
2. The rule engine detects an insight and sends a local notification.
3. The user taps the notification to open the app.
4. Local AI explains the insight using calculated values.

For the Food budget example, AI receives the ₱6,000 budget, ₱4,920 spent, ₱1,080 remaining, and nine remaining days. It can explain that staying within the target allows approximately ₱120 per day.

### Background processing

Run insight checks when a transaction is added, edited, or deleted; when the app opens; or when a budget or goal changes. Avoid continuously running the model. Scheduled Android background tasks can support weekly summaries later.

## AI workflow

This section describes the longer-term product vision. Current implementation scope is defined by the agreed MVP specification above.

### Hybrid parsing strategy

| Level | Responsibility | Example |
| --- | --- | --- |
| 1. Deterministic parser | Handle clear patterns using regex, keywords, number extraction, date parsing, and category aliases. | “spent 150 on food,” “salary 30000,” “save 1000,” “500 transport.” |
| 2. Local AI | Interpret language that the simple parser cannot resolve. | “I treated my friends to samgyup yesterday and paid 1,450.” → Expense · ₱1,450 · Food · Yesterday. |
| 3. Clarification | Ask the user for missing or ambiguous information. | “Were you saying that you spent ₱500 or received ₱500?” |

### Intent detection

Classify each message before acting:

```text
ADD_INCOME
ADD_EXPENSE
TRANSFER
EDIT_PENDING_TRANSACTION
DELETE_TRANSACTION
FINANCE_QUESTION
FINANCE_EXPLANATION
UNKNOWN
```

Actions produce proposals for confirmation. Questions query local financial data and return explanations. Unknown messages prompt clarification.

### Structured output

For “I got 250 pesos for my baon,” the interpreter could return:

```json
{
  "intent": "ADD_INCOME",
  "amount": 250,
  "currency": "PHP",
  "category": "Allowance",
  "description": "Baon",
  "account": "Cash",
  "date": "2026-10-09",
  "confidence": 0.97
}
```

The date above is illustrative. The application validates the structured output before showing it to the user; the AI never writes directly to storage.

```text
User message → Interpretation → Structured data → Validation
             → User confirmation → Local storage
```

### Confidence handling

| Confidence | Example | App response |
| --- | --- | --- |
| High | “I spent ₱120 on lunch.” | Show an Expense · ₱120 · Food · Today proposal for confirmation. |
| Medium | “Mama gave me 500.” | Ask whether it is Allowance, Gift, or Other, then confirm. |
| Low | “Spent some money earlier.” | Ask “How much did you spend?” rather than guessing. |

### Confirmation state machine

```text
USER_MESSAGE → PARSING → PROPOSED_ACTION → AWAITING_CONFIRMATION
                                             │
                                             ├─ Confirm → SAVE → COMPLETE
                                             ├─ Edit → PROPOSED_ACTION
                                             └─ Cancel → Discard proposal
```

In the future conversational workflow, nothing reaches `SAVE` without proposal confirmation. Manual MVP creation uses Save as described above.

### Model selection

Build the finance app before integrating local AI. Start by evaluating models around **0.5B, 1B, 1.5B, and 3B parameters**, with quantization where appropriate, and select the smallest model that meets the task's needs.

Evaluate Android RAM usage, inference latency, APK/model size, battery consumption, Taglish understanding, and reliable structured output.

### System prompt concept

```text
You are an offline personal finance assistant.
Interpret messages about the user's financial activity.
Never invent transactions or modify financial data yourself.

For transactions, return structured data:
- Type: INCOME, EXPENSE, or TRANSFER
- Amount and currency
- Category
- Account and destination account
- Description and date

Request clarification when information is ambiguous.
Use application-generated values for financial explanations.
Do not provide authoritative investment, legal, tax, or financial advice.
```

## Technical architecture

The proposed architecture keeps storage, calculations, insight detection, language parsing, and explanations on the device.

```text
Android app (React Native + TypeScript)
├── UI and navigation
├── SQLite storage
│   ├── Accounts and transactions
│   ├── Categories and budgets
│   └── Goals, settings, and insights
├── Finance engine
│   ├── Calculated metrics
│   └── Insight rules → Local notifications
└── Language layer
    ├── Deterministic parser
    ├── Local AI interpreter
    └── Explanations of calculated results
```

### Proposed stack

| Area | Proposed approach | Notes |
| --- | --- | --- |
| Application | React Native + TypeScript | Android support, local storage ecosystem, native modules, and a possible future iOS codebase. Retain the existing Expo project and stack. |
| Navigation | Expo Router | MVP: Home, Transactions, and Settings in `src/app/`; non-route code stays outside this directory. |
| Storage | SQLite through `expo-sqlite` | A database file on the phone, supporting filtering, sorting, date/category queries, aggregation, edits, and deletion. Use versioned SQLite migrations and validated writes. |
| Notifications | Notifee or Expo Notifications | Choose according to the project architecture. Notifications are deferred beyond the MVP and will run locally. |
| Native integration | Android bindings as needed | Consider React Native bare/prebuild when local inference requires native integration. |

### Local AI options to investigate

| Option | Intended use |
| --- | --- |
| llama.cpp-compatible GGUF model with Android/native bindings | Local inference with quantized models. |
| ONNX / mobile-optimized transformer | Intent classification, entity extraction, and transaction classification. |
| Small dedicated models | A separate intent classifier and entity extractor alongside the deterministic finance engine. |

### Local data model

Use the models in the agreed MVP specification. Add budgets, goals, and insight tables only when those features enter scope.

## Privacy and backup

> Your financial data stays on your phone.

- Keep transactions out of external analytics and avoid background uploads.
- Keep prompts and AI processing local by default.
- Encrypt sensitive exports and store security keys in Android secure storage.
- Allow complete deletion of local financial data.
- Add fingerprint or device authentication in a later release.

Device loss can also mean data loss. A later release should support encrypted backups such as `mymoney-backup-2026-10-09.enc`, which users can manually store somewhere safe.

To restore: **Settings → Restore Backup → Select file → Enter password/key → Restore**. Cloud sync is outside V1 scope.

## Release plan

### V1: manual offline finance MVP

- Home, Transactions, and Settings using Expo Router.
- One Cash account and user-defined opening balance, defaulting to zero.
- Manual income/expense recording with default categories and transaction history.
- Derived Cash balance and monthly income/expenses.
- Save feedback, Undo if feasible, and confirmed edits/deletions.
- Exact centavos, validation, duplicate-save protection, and negative-balance warnings.
- SQLite persistence through `expo-sqlite`, with versioned migrations.
- Completely offline operation.

### Later releases: finance expansion and protection

Multiple-account management and archiving, transfers, savings, dedicated-account goals, budgets, category breakdowns, encrypted backup/restore, authentication, custom categories, recurring records, and local notifications. Agree on their order after the MVP is verified.

### Later releases: conversational assistant

Deterministic parsing, proposal review, pending corrections, clarification, financial questions, and eventually local AI and Taglish interpretation. Evaluate models on the target phone before selecting an inference library or model.

### Outside V1 scope

| Area | Deferred features |
| --- | --- |
| Service integrations | Bank APIs, GCash, and Maya integrations. |
| Investing and market data | Investment portfolios, stock prices, cryptocurrency, financial news, and AI investment recommendations. |
| Cloud and sharing | Cloud accounts, multi-device synchronization, and social features. |
| Advanced automation | Receipt OCR, forecasting, and autonomous financial agents. |
| Other financial tools | Credit scoring, complex tax tools, and loan recommendations. |

## Development roadmap

Build incrementally and verify each step. These are milestones rather than calendar deadlines.

| Step | Focus | Deliverable |
| --- | --- | --- |
| 1 | Align specification | Agreed financial rules, Save workflow, Expo Router, and narrow MVP scope. |
| 2 | Finance foundation | Account/transaction types, exact money parsing, validation, balance/monthly calculations, and focused tests. |
| 3 | SQLite persistence | Versioned schema, Cash initialization, validated CRUD operations, and duplicate-submission protection. |
| 4 | Basic screens | Home, Transactions, and Settings, reusing existing theme components. |
| 5 | Manual workflow | Income/expense entry, feedback, Undo if feasible, confirmed edits/deletions, and negative-balance warnings. |
| 6 | Verification | Acceptance example, invalid input, backdating, recalculation, duplicate saves, and persistence after reopening on Android. |

### First usable milestone

1. Set opening Cash to PHP 1,000.
2. Manually save PHP 500 income and a PHP 120 Food expense in the same month.
3. Verify Cash balance 1,380, monthly income 500, and monthly expenses 120.
4. Close and reopen the app; the records and calculated values remain correct.
5. Verify edits/deletions recalculate the results and canceling preserves the original record.

The conversational lunch-entry loop is a later milestone after the manual tracker is reliable.

## Success criteria

Success means the app becomes useful enough to use regularly. After one month, ask:

1. Am I actually recording my expenses?
2. Is conversational entry faster than manual entry?
3. Are the AI classifications correct?
4. Are the notifications useful?
5. Do I understand my spending better?
6. Has the application helped me save?
7. Am I opening it voluntarily?

Use these answers to guide further development.
