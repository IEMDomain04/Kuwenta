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

Tests live in `tests/finance/`. The test command compiles only the finance modules into ignored `.expo/finance-tests/` output before running the tests. No additional test dependencies are required. Tests cover the finance foundation and the storage operations described below. The native app now loads these modules through the finance provider and basic screens.

### Implemented SQLite persistence

`src/features/finance/storage/` contains:

- `database.ts`: opens `kuwenta.db` through `expo-sqlite`, enables foreign keys and WAL, initializes the schema, and closes failed connections. Callers own the returned connection and close it when finished.
- `migrations.ts`: atomically creates schema version 1 and one Cash account with zero opening balance. Reopening preserves data; databases from newer schema versions are rejected.
- `accounts.ts`: retrieves Cash and updates its separate opening balance without recording income. Archived accounts reject changes.
- `transactions.ts`: creates submission IDs and provides validated create, read, edit, and delete operations. History sorts by Philippine transaction date/time with stable tie-breakers. Edits preserve creation timestamps. Writes bind user input as SQL parameters.

Create a submission ID once with `createTransactionId`, then reuse it for every retry of `createTransaction`. The unique database ID prevents duplicate records. Retrying an already saved ID returns its current record without overwriting it. Separate IDs allow legitimate identical expenses. A deleted record is not a durable submission tombstone; the later UI must retire that submission after deletion or Undo.

The schema includes optional transfer/adjustment fields, but constraints and storage validation allow only income/expense records. A future migration is required to enable the deferred types. No running balance is stored; feed retrieved records to the existing calculation functions. Call edit/delete operations only after UI confirmation (or explicit creation Undo).

`npm run test:finance` also runs `storage.test.cjs` against real SQLite using Node 24's built-in `node:sqlite` module and a small test adapter for Expo's async methods. Tests cover persisted records after reopening, repeated initialization/submissions, updates/deletion, backdating/sorting, constraints, and rollback. The adapter serializes transactions; it does not validate Expo's native connection behavior or Android concurrent-write locking. Test that integration on the phone when wiring up the app. Exclusive SQLite transactions target native mobile; web integration is outside this MVP.

No additional dependencies were installed. App lifecycle integration and the basic screens are described below.

### Basic screens and app integration

The native root stack wraps the `(tabs)` group and the separate `/transaction` form route in `FinanceProvider`, which owns a dedicated SQLite connection, loads Cash/history, and derives the dashboard summary. It closes its connection on unmount, refreshes when the app returns to the foreground, and checks for a Philippine reporting-month change while active. Loading/error states provide Retry. Opening-balance writes refresh all screens, and a failed refresh after a committed write is reported separately from a failed save.

Expo Router now has Home (`src/app/(tabs)/index.tsx`), Transactions, and Settings routes. Screen code lives in `src/features/finance/screens/`; shared screen/button/transaction-row UI lives in `components/ui.tsx` within that feature. Existing light/dark theme components are reused.

- Home: Cash balance, monthly income/expenses, a negative-balance warning, recent records, and navigation to Transactions/Settings.
- Transactions: date/time-sorted history with amounts, categories, optional notes, empty state, and pull-to-refresh.
- Settings: PHP and Philippine-time information, an editable opening balance, confirmation before changing it, validation, and save feedback. Opening balance does not create income.

Manual transaction creation, Undo, editing, and deletion are implemented as described below. Web shows a native-app notice; financial SQLite workflows target Android and are not simulated in the browser.

For Android verification, run `npx expo start`, open the app on your phone, switch between the three tabs, set an opening balance of 1000, and verify Home shows PHP 1,000 with zero monthly income/expenses. Cancel an opening-balance change to verify the stored value stays unchanged. Restart the app to check persistence, and try a negative opening balance to check the warning. Invalid monetary input must not save. These manual checks need to be performed on the phone; automated storage tests do not validate the native UI.

### Manual transaction management

Home and Transactions have an Add transaction shortcut. `/transaction` opens outside the tabs with a shared income/expense form (`components/transaction-form.tsx`) and workflow screen (`screens/transaction-screen.tsx`). The form includes positive peso amount, matching category, fixed Cash account, editable Philippine date/time, and optional notes. Validation and failed writes preserve the draft. Creation uses Save without a separate confirmation dialog.

The provider exposes transaction actions, refreshes summaries after committed writes, and displays success feedback. Saves use a stable submission ID and disable repeated actions while pending. Successful drafts retire their IDs. Undo is available for 10 seconds after creation and removes only that new record; starting another write replaces the previous notification. Edit and Delete actions are available in transaction history and require confirmation. Cancel leaves records unchanged. Edits preserve the creation timestamp. A committed write followed by a read failure shows a separate refresh error with Retry and does not report the save as failed.

The existing Home, Transactions, and Settings routes now live under `src/app/(tabs)/` while keeping their URLs. No dependency or database migration was added for this increment. Full change-history tracking remains deferred.

Manual Android checks:

1. Set opening Cash to PHP 1,000, save PHP 500 income and PHP 120 expense, and verify balance 1,380 with monthly income 500 and expenses 120.
2. Tap Save repeatedly and verify one record. Try invalid amount/date/time and confirm no record is saved and the draft is preserved.
3. Save an expense, tap Undo, and verify only that record disappears and totals return to their previous values.
4. Edit amount, type/category, date/time, and notes; cancel first, then confirm, and check the resulting reports.
5. Cancel a deletion, then confirm it, and verify history and balances.
6. Add a backdated record, create a negative balance, restart the app, and verify reporting and persistence.

The automated finance/storage tests cover the underlying writes and calculations. Form taps, confirmation dialogs, navigation, notification timing, and Expo's native binding still require phone verification.

### Faster entry and form input protections

Home has Expense and Income shortcuts that preselect the shared form's type and initial category. Selected type/category buttons have a visible border, check mark, and accessibility selected state. Save continues to return to the originating screen through stack navigation.

Transaction amounts use a decimal keypad and accept only digits and one decimal point, with up to two fractional digits. Opening balance uses the same input rule plus an optional leading minus sign; a Make negative/Make positive button makes the sign accessible on mobile keypads. Invalid typing/paste is rejected with an explanation and preserves the previous input. It is never silently converted by removing letters. Correct or re-enter the field before saving after a rejected input.

Date/time fields use numeric keypads and insert separators automatically: `20261009` becomes `2026-10-09`, and `143500` becomes `14:35:00`. Correctly separated pasted values are accepted too. Final validation still checks real calendar dates, clock times, positive amounts, and safe integer ranges. Notes remain ordinary text. Field-specific errors appear beside amount/date/time; keyboard Next actions move between inputs where supported by the device keyboard.

Success feedback is a compact, dismissible notification. Creation feedback retains the 10-second Undo window; other success messages disappear after four seconds. Database schema and dependencies are unchanged.

Phone checks for this increment: open both Home shortcuts; verify selected type/category; paste `12abc34`, extra decimals, and letters into every numeric field; enter date/time as digits; try impossible dates and times; test negative opening balance through the sign toggle; verify keyboard navigation, failed-input correction, Save return navigation, and Undo.

### Reporting months and history filters

Home and Transactions share a reporting-month selector with Previous, Next, and Current month controls. Selection defaults to the current Philippine month, survives tab changes and record refreshes, and resets to current month when the app restarts. While following current month, the selector updates at a Philippine month boundary; explicitly selected historical months stay selected. Supported navigation range is 1900-01 through 9999-12.

Home income/expense totals and recent records use the selected month. Current Cash balance always includes the opening balance and all transactions regardless of month. Transactions additionally offers All, Income, and Expenses filters; these affect only displayed history, not dashboard totals. Filtering preserves the Philippine date/time order from storage and shows a month/type-specific empty state.

New transaction forms still default to Philippine today, even when browsing a historical month. Saving does not silently change the selected report; creation feedback includes the saved date. Editing a transaction date moves its history/report membership after refresh.

Added `reporting.ts`, `components/month-selector.tsx`, and focused reporting tests. Database schema and dependencies are unchanged. Phone checks: change month on Home and switch to Transactions; toggle all three filters; navigate December/January; backdate and edit records across months; verify current Cash balance stays the same between reports; create a new entry while viewing a past month and confirm its default date remains today.

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

## Backup foundation (first increment)

The internal version-1 backup payload is implemented in src/features/finance/backup.ts.
It preserves the Cash account, opening balance, integer-centavo income/expense records,
Philippine transaction dates/times, IDs, notes, and UTC creation/update timestamps.
Metadata identifies the Kuwenta format, version, PHP currency, Asia/Manila timezone,
and export timestamp. Balances are recalculated rather than stored.

Serialization, parsing, and a summary preview share validation. Invalid shapes,
unsupported versions/fields, duplicate IDs, unknown account references, invalid
financial records, and unsafe totals are rejected. The MVP format supports exactly
one Cash account. The test suite covers round trips and rejected payloads.

This is an internal plaintext JSON format, not an encrypted backup file.
File export/import, encryption, Settings controls, and atomic database restore
are subsequent increments. No database schema or screen behavior changes here.

## Encrypted backup export

Settings now offers Export backup on the native app. Enter and confirm a strong
12-128 character password/passphrase, then choose Encrypt and share backup.
The complete Cash account and transaction history are read from SQLite in one
transaction. Only encrypted data is written to a temporary cache file; the file
is removed when sharing completes or fails. Save the shared .kuwenta file to
your chosen location. Closing the share sheet cannot prove that a file was saved.

The version-1 encrypted envelope uses AES-256-GCM, PBKDF2-HMAC-SHA256 with
600,000 iterations, a fresh random 16-byte salt, a 12-byte nonce, and a 16-byte
authentication tag. Envelope metadata is authenticated as additional data.
The sealedData field is base64 containing nonce, ciphertext, and tag in that order.
Passwords are used exactly as entered (UTF-8, without normalization).
The password is never written to the database or backup. Keep it safe: forgotten
passwords cannot be recovered. Password fields clear when export begins or is canceled.

Dependencies: expo-crypto for native encryption/randomness, expo-file-system for
the encrypted temporary file, expo-sharing for the system share sheet, and
@noble/hashes 2.4.0 for asynchronous password key derivation that yields to the
event loop. The finance test setup uses Node 24, which supports this ESM library.
The Expo modules are included in SDK 57 Expo Go. Reference: [Expo Crypto](https://docs.expo.dev/versions/v57.0.0/sdk/crypto/), [FileSystem](https://docs.expo.dev/versions/v57.0.0/sdk/filesystem/), and [Sharing](https://docs.expo.dev/versions/v57.0.0/sdk/sharing/).

Import, password entry for decryption, preview, and confirmed atomic restore
remain the next increments. Automated tests use standard Node AES-GCM at the
Expo boundary; native crypto and sharing still need phone verification.

Phone checks:
1. Restart Expo after installing the new packages and open the app in Expo Go.
2. In Settings, try a short password and mismatched confirmation; no file should be shared.
3. Enter matching strong passphrases and export; repeated taps should start one export.
4. Save the .kuwenta file using the share sheet and verify it exists at the chosen destination.
5. Export again, then cancel sharing; financial records should remain unchanged.
6. Check that Home totals and transaction history remain correct after reopening the app.

## Backup import preview

Settings now includes Choose backup file and Unlock and preview. File selection
reuses expo-file-system's SDK 57 picker; no additional dependency is needed.
Supported encrypted files are limited to 10 MiB. Both file metadata and bounded
reads enforce the limit. Export sharing enforces the same limit so files produced
by this app can be selected for preview.

The encrypted envelope must use the existing version-1 AES-256-GCM format and
exactly 600,000 PBKDF2-HMAC-SHA256 iterations. Unsupported versions, algorithms,
salt/base64 data, and unknown fields are rejected before password derivation.
Authenticated decryption rejects incorrect passwords or altered files; all
decrypted financial records then pass the existing backup validation.

The preview shows account name, opening balance, total/income/expense record
counts, recalculated Cash balance, and export date/time in Philippine time.
Negative balances display a warning. Preview is read-only and does not call
SQLite write operations. No restore control is provided in this increment.

Password fields clear when unlocking begins or the preview is canceled.
Canceling during processing discards the eventual result; it does not interrupt
the underlying crypto operation. Repeated taps are blocked while processing.
Decrypted transaction details are used to calculate the summary and are not
retained by the preview component. The selected source file is never deleted.

Phone checks:
1. Export a backup, then select the saved .kuwenta file from Settings.
2. Enter a wrong password; verify the error and that Home/history stay unchanged.
3. Enter the correct password; verify counts, opening balance, and Cash balance.
4. Check the export timestamp is labeled Philippine time.
5. Close the preview and cancel file selection; no records should change.
6. Try a damaged/unsupported file and repeat unlock taps.
7. Check empty and negative-balance backups; confirm the negative warning appears.

Confirmed, atomic database restore is the next increment.

## Confirmed backup restore

After unlocking and reviewing a backup, Settings offers Restore this backup.
Confirmation explains that the current Cash account details and ALL transactions
will be replaced, recommends exporting the current records first, and states
that restore cannot be undone. Cancel leaves the database and preview unchanged.

Restore revalidates and detaches the backup before writing. One exclusive SQLite
transaction deletes old transactions, updates the existing Cash account row,
and inserts backup records with their original IDs, integer centavos, Philippine
transaction dates/times, notes, and audit timestamps. No account row is deleted.
Any failure rolls back all changes. Unsupported multi-account databases are
rejected before deletion. Repeating a restore replaces records without duplicates.

The provider locks financial operations during restore, clears stale Undo
notifications after commit, resets reports to the current Philippine month, and
reloads all screens. Existing forms/previews reset when the restored snapshot
loads. If restore commits but refresh fails, the app explicitly reports that the
backup was restored and offers Retry; stale records are not displayed for editing.

The unlocked backup is now held in memory while the preview is open so Restore
can use exactly the previewed data. Closing the preview clears it. No password
is retained, and no dependency or database schema change was added.

Phone checks:
1. Export current records before testing replacement.
2. Unlock a backup, choose Restore this backup, then Cancel: records must stay unchanged.
3. Confirm restore of opening PHP 1,000 + PHP 500 income - PHP 120 expense:
   Cash balance should be PHP 1,380, income PHP 500, and expenses PHP 120.
4. Confirm old transactions are gone and PH date/time, notes, and counts match the backup.
5. Restore the same file again: transaction counts must not increase.
6. Check an empty backup, negative balance warning, and a backdated reporting month.
7. Close/reopen Expo Go: restored records should remain.
8. Create a transaction before restoring and verify its old Undo option disappears after restore.

Automated SQLite tests cover replacement, invalid payloads, mid-write rollback,
repeated/concurrent storage restores, empty/archived records, backdating, and
persistence. Confirmation, provider locking/refresh, and screen reset still need
native phone verification.

## Home and transaction interface improvements

Home emphasizes the Cash balance and explains that it includes all months.
Add Expense and Add Income appear immediately below it. The monthly selector,
income, and expenses are grouped into a monthly overview. Recent transactions
follow, with View all transactions beneath them. Opening balance remains in Settings.
Transaction rows now emphasize signed amounts before category and PH date/time.

The transaction form has a larger amount field, compact category choices with
selected indicators, and shorter date/time hints. Fields scroll independently of
Save/Review changes and Cancel, which remain below the scrolling area.
Non-tab form screens use their bottom safe area instead of tab-bar spacing.
The current theme, validation, PH defaults, confirmations, and persistence are reused.
No dependencies, financial rules, or database changes were added.

Phone checks: verify light/dark appearance, narrow screens and larger text,
both quick-entry types, category selection, invalid numeric input, and reaching
Save with the keyboard open. Verify date/time and notes remain reachable by
scrolling. Check edit confirmation, canceled edits, and failed-save draft preservation.

## Calendar, time picker, and live money formatting

Transaction date and time are selected through native pickers instead of typing.
Android uses a calendar dialog and clock dialog; iOS uses an inline calendar/time
wheel with explicit Confirm/Cancel controls. Pickers are configured for Asia/Manila,
and stored values remain YYYY-MM-DD and HH:mm:ss. Existing seconds survive date
changes and unchanged hour/minute selections. Changing the time sets seconds to 00.

Transaction amounts and opening balances now group thousands while typing:
1000 becomes 1,000, and 12345.67 becomes 12,345.67. Partial decimal entries remain
editable, and letters, extra decimals, and malformed grouped pastes are rejected.
Cursor mapping supports insertion, selected-range replacement, and deletion
beside a separator. Only display commas are removed before the existing exact
centavo parser; database and financial calculations remain unchanged.

One dependency was added through expo install: @react-native-community/datetimepicker.
It is included in Expo Go: https://docs.expo.dev/versions/v57.0.0/sdk/date-time-picker/

Phone checks: restart Expo; open each picker, confirm and cancel selections, edit
a backdated transaction, and verify unchanged seconds. Try a phone timezone outside
the Philippines. Type 1000, 12345.67, and 1000.; edit the middle of a grouped number,
delete beside commas, replace a selected range, and paste grouped/invalid amounts.
Check negative opening balance sign changes and verify saved centavos and totals.

## Dashboard visual refresh
Shared light/dark colors now use a teal accent, readable income/expense colors,
and subtle borders. Primary buttons use the accent. Home emphasizes Current Cash
Balance across all recorded months; monthly reporting remains separately labeled.
Selected-month spending is grouped by category, sorted by total, and displayed
with exact amounts and simple proportional bars. The five recent records, month
navigation, entry shortcuts, warnings, and financial workflows remain in place.
No dependency or database change was required. Verify both themes, large text,
large/negative balances, empty months, and category updates after editing/deleting
on the phone before continuing the screen redesign.
## Reference-inspired Home styling
Home uses a teal gradient balance panel, category icons, a compact spending donut
with an adjacent exact total, category percentages/bars, and five recent records
inside one panel. Local SVG drawings render through existing expo-image; there
are no new dependencies or remote assets. Selected native tabs use teal.
All expense categories remain visible. Percentages are rounded display values;
financial calculations, persistence, backups, confirmations and Undo are unchanged.
Verify SVG rendering in Expo Go, both themes, larger text, long notes, and empty,
large or negative amounts before continuing with other screen layouts.
## Fixed light reference layout
Kuwenta now uses a fixed pale-blue/white light palette with navy text, teal-to-mint
balance styling, and green/coral income/expense indicators. It does not follow
device dark mode. Home uses tighter spacing, a compact expandable reporting-month
control, a wrapping donut/category layout, five recent records, and bottom quick
actions. Ionicons replaces hand-drawn category/wallet icons; only this icon pack
was added. Native tab icons retain their existing platform implementation.
The config requests light appearance; restart Expo Go to load the new icon package.
Verify on the phone with dark system settings, larger text, all categories, empty
months, negative/large balances, and month navigation. Existing calculations,
SQLite records, encrypted backup workflows, confirmations and Undo are unchanged.
## Home usability refinement
Home now has an upper-right reporting month selector with a twelve-month grid,
a directly selectable year list (1900-9999), Current month, and Cancel. Choosing
a month applies immediately; dismissing without selection does not change reports.
The existing provider updates monthly income, expenses, category totals and five
recent records, while current Cash Balance stays across all months.
A single fixed Add transaction FAB replaces the two entry buttons; extra scroll
padding and safe-area/tab spacing keep the final records reachable.
Light/dark system themes are restored. Home summary gradients use green and blue
accents. The existing SVG donut remains dependency-free and shows its exact total
in the center, or below for large amounts/larger text. Category percentages are
rounded display values; centavo calculations and database workflows are unchanged.
Verify both themes, direct year/month selection, cancellation, empty months,
negative balances, chart updates after edits/deletions, larger text, and FAB
placement/navigation on an Android phone. Earlier fixed-light instructions above
are superseded by this increment.
## Chart rendering, timestamps and scrolling
The spending donut now uses react-native-gifted-charts with expo-linear-gradient
and the SDK-compatible react-native-svg instead of an SVG image URI. Existing
integer-centavo category totals, category colors, center total and empty states
remain; large totals/text use the existing below-chart fallback. No chart
animations are enabled. Phone verification is required to confirm rendering.
Home/history/edit/delete summaries display dates and twelve-hour times such as
Oct 10, 2026 · 1:39 AM · PH time. Stored seconds and reporting/sorting stay unchanged.
Shared screens no longer add hard-coded tab height on top of native automatic
bottom insets. Home reserves only FAB clearance; Settings keeps a small end
margin and Transactions uses the available list height. Scroll bounce/overscroll
is disabled, while history retains pull-to-refresh. Verify the last item/button,
empty/short lists, expanded backups, keyboard and FAB on the phone.
## Readable reporting labels and transaction form
Home section labels now show October 2026 rather than 2026-10. Internal reporting
keys remain unchanged. Transaction entry uses a prominent peso input, icon category
grid, readable date/time controls, fixed Cash field, notes, and gradient Save.
Income/Expense selection changes the entry heading; all existing categories remain.
Back/Cancel, validation, draft handling and confirmed edits are retained.
Creation success appears in a rounded nonblocking floating banner with Undo,
keeping its existing ten-second expiry. It is placed above tab/FAB controls.
No dependencies were added. Verify keyboard/scroll reachability, larger text,
both themes, category switching, picker cancellation, saving/edit confirmation,
and banner placement/Undo on the phone.
## Compact category picker and date/time controls
The transaction category grid moved into a bottom-sheet modal opened beside the
amount. Selecting applies immediately; close, outside tap and Android Back retain
the original selection. Names truncate to one line with ellipses while accessible
labels retain full names. The modal respects bottom safe areas and scrolls.
Date/time controls now share 22px Ionicons, 13px labels, matching heights/borders,
and readable PH date/time. The raw JSX whitespace between the control row and
conditional native picker was removed to address the Text-component runtime error.
Storage, category defaults, validation, native picker behavior, saving and Undo
remain unchanged. Verify modal cancellation/selection, long labels, system text
scaling, both themes, native picker dismissal and Save on the phone.
### Multiple PHP accounts

Settings now supports adding and editing accounts, signed opening balances, spending/savings purpose, and the future Available Money inclusion setting. Archive/unarchive preserves account records and balances; no permanent account deletion is offered. Archived accounts cannot receive new records or have existing records edited until unarchived.

Income and expenses can be assigned to an active account. Editing an account assignment recalculates both balances atomically. Home retains the current Cash balance and shows monthly reports across all accounts, including archived history. Transactions can be filtered by account, including archived accounts.

Opening balances retain the existing separate adjustment field; they are never income transactions. Balances derive from that opening adjustment plus the account's recorded income and expenses. No manually maintained current balance is stored.

SQLite schema v2 adds a combined-history index without rewriting existing Cash records. Encrypted export now includes all accounts in finance payload v2; the encryption format is unchanged. Cash-only payload v1 backups remain importable. Confirmed restore replaces ALL accounts and transactions atomically, including when restoring an old Cash-only backup.

Transfers, savings metrics, goals, and budgets remain subsequent steps. The savings purpose and Available Money flag are supported account settings, without implementing those overviews yet.

Phone checks: add Bank/GCash/Savings accounts; record income and expenses in different accounts; edit a transaction's account and confirm or cancel; verify balances and all-account monthly totals; archive/unarchive and inspect filtered history; restart the app; export and restore a multi-account encrypted backup. Check old Cash-only restore only after exporting your current records, since it intentionally replaces every account.
### Home current-money overview

Home now prioritizes Available Money (balances of accounts marked included) and separately displays Total Money (all account balances), plus Cash balance for reference. These figures include opening adjustments and all transaction months; selected-month reports remain separate. Archived balances stay included according to the same inclusion flag, and negative accounts show a warning. Account rows and the Add Account shortcut on Home are the next UI increment.
### Home account shortcuts

Home now lists current balances for all accounts with spending/savings purpose, Available Money inclusion, archived status, and negative-balance warnings. Add Account and pressable account rows open a dedicated Expo Router screen that reuses the Settings account editor. Successful saves return to Home after records refresh; cancel/back leaves stored data unchanged. Archived accounts offer confirmed unarchiving before editing. Account navigation is blocked during an active save.
### Account balance corrections

Tapping an account on Home opens its current balance and account details. Adjust balance starts with that current amount and requires confirmation; the difference is stored as a dated PHP balance adjustment, excluded from income, expenses and spending charts. Repeated saves use one submission ID; stale balances are rejected. Editing account settings preserves the opening balance unless Correct opening balance is explicitly selected. That separate correction changes the historical starting amount. SQLite schema and financial backup payload are version 3; version 1 and 2 backups remain importable.

### Transfers

Choose Transfer in transaction entry, then choose different active source and destination accounts. One positive centavo record debits the source and credits the destination atomically. Transfers appear once in history, under either account, with a dedicated filter. They never count as income, expenses or category spending; Total Money stays unchanged while Available Money follows account inclusion flags. Negative balances remain allowed and visibly warned on Home/account details. Save feedback and 10-second Undo remain available; edits and deletions require confirmation. Archived endpoints prevent creation/editing, while existing history is preserved. SQLite and financial backup payloads now use version 4; versions 1?3 remain importable, and the encrypted envelope is unchanged.

### Savings reporting and goals

Home shows the current combined savings balance (including archived accounts), selected-month Saved This Month, and Savings Rate. Saved This Month counts spending-to-savings transfers minus savings-to-spending transfers; openings, adjustments, expenses, income, and savings-to-savings transfers do not count. The rate is net saved divided by monthly income, allows negative rates, and displays an em dash when income is zero. New transfers capture source/destination purposes at save time. Editing their amount/date preserves these snapshots; changing endpoints captures new purposes. Older transfers use current account purposes and display a note, since historical purposes were never recorded.

One goal links to one dedicated savings account, with a positive target and optional calendar-picked target date. Progress uses the actual current account balance, including opening amounts and corrections; it clamps the bar to 0-100%, preserves signed balances, and shows the remaining amount or Target reached. Goals support confirmed edits/deletion; deleting a goal keeps account money and transactions. Linked accounts cannot become spending accounts until the goal is deleted or relinked. Archived accounts retain goals and balances but cannot receive goal funding or goal edits until unarchived or relinked.

Account details includes Transfer money with the source preselected. Goal Add money preselects its destination. Add savings account in the goal form defaults to savings and exclusion from Available Money.

SQLite schema and financial backup payload are version 5. Goals and transfer-purpose snapshots are included in encrypted backups; versions 1-4 remain importable. Restoring an older backup replaces and clears current goals as part of full replacement. The encryption envelope and password handling are unchanged. No new dependencies were added.

Phone verification: create a savings account with zero opening, create a PHP 1,000 goal, then use Add money to transfer PHP 200 from Cash. Savings balance should be PHP 200, goal progress 20%, and remaining PHP 800. Monthly income/expenses and Total Money should not change. Test month switching, a return transfer, cancellation of goal edits/deletion, optional calendar date, restart, and encrypted backup restore. Confirm Add Account no longer crashes before entering its name.


### Dashboard and navigation

- Bottom tabs: Home, Accounts, History, Settings. Account creation/details remain separate screens above Accounts.
- Home shows a Philippine date and time-based greeting, current Available Money and Total Money, and a local budget insight.
- Day reports use Philippine today; Week uses Monday through today; Month uses the selected reporting month. Income and expense totals exclude transfers and adjustments. Monthly bars cover consecutive seven-day groups within the month.
- Budgets, spending breakdown, savings, and five recent transactions continue to use the selected month independently of the Day/Week selector. Current money is not filtered by month.
- Budget usage shows remaining/overspent money, with a bounded progress bar and the actual percentage even above 100%. Expenses/income shows a dash when income is zero.
- No additional dependencies, cloud AI, or financial storage changes were introduced for this dashboard.

Phone checks: switch all four tabs; add/edit an account and return; change the reporting month; compare Day/Week/Month totals; save/edit/delete an expense and check chart/budget refresh; try a zero-income and over-budget month; check large text and narrow screens; open Quick Entry and the transaction FAB.


### Phase 1: focused Home refinement

Home now follows greeting, a larger local insight card, and a compact chart beside income/expense totals. Activity is hidden until an income or expense exists; opening balances, adjustments, and transfers do not activate it. Day is the default; Week and Month retain the existing Philippine reporting ranges. The selected-month picker appears with Month. Empty periods show a clear empty state. Charts reuse the installed Gifted Charts library.

Current Available Money and Total Money are in Accounts. Settings > Planning opens Budgets or Savings & Goals (including the existing savings summary). History retains transaction browsing and editing. Home keeps the transaction FAB and Quick Entry in its insight card. No storage or financial calculation changes.

Phone checks: fresh/reset Home has no chart; an opening balance or transfer alone keeps it hidden; saving an income/expense reveals it; deleting the last income/expense hides it; Day/Week/Month and the month picker update totals; zero-activity periods show an empty state; narrow screens and larger text reflow; Settings opens both planning screens and Back returns correctly.


Home compact layout: insight icon and text share a row; the Home Quick Entry button is removed. Expense chart and totals use two columns, stacking for larger accessibility text. Day/Week/Month controls live inside the totals card. Day chart shows the last seven days while totals show today; Week chart shows Monday-Sunday with future days empty; Month chart shows daily expenses for the selected month. Weekday labels are M, T, W, TH, F, S, Sun; tap a bar for the full date and exact amount. Income and expense calculations remain unchanged.


Home now keeps its expense chart fixed to the current Philippine Monday-Sunday week. Day/Week/Month switches only the adjacent totals; Month always uses the current Philippine month and has no picker. History retains historical month selection. Recent transactions shows the five newest by transaction date/time across all months, including transfers and adjustments. Tap to edit, or view the account for an adjustment; See all opens History.


### Phases 2 and 3: Accounts and transaction interfaces

Accounts leads with Total Money and secondary Available Money, with Add Account in the heading. A local balance insight sits beside the current-week recorded-balance chart. Card/list controls change presentation without changing records. Spending/savings accounts have consistent purpose-based icons and colors; archived accounts remain behind the existing visibility toggle. No account styling fields or forecast model were added.

The weekly balance chart reconstructs end-of-day aggregate balances using current undated opening balances plus transactions through each date. It includes archived balances and adjustments, cancels internal transfers across the aggregate, and leaves future days blank. It is not a snapshot of historical account creation, past opening-balance edits, or cash-flow forecasting. Tap a bar for the exact recorded amount.

Account details show five recent account transactions, including both transfer endpoints. See all opens History filtered to that account (and all transaction types), where the visible month can be selected. Edit account details and Adjust balance remain separate, with existing confirmations and account-deletion restrictions.

Transaction entry retains its fixed Save/Cancel footer, with a compact amount/category panel and matching source/destination selectors. Android keyboard avoidance now uses height adjustment; verify this on-device with the keyboard open. History uses compact shared transaction rows, readable date headings, existing filters, and separate confirmed deletion.

Checks on phone: card/list switching, large balances and system text, account creation/editing/adjustment/archive/delete restrictions, negative-balance chart, cross-month week, account history navigation (source and destination), transfer preview, keyboard-visible Save/Cancel, repeat-save prevention, editing confirmation and cancellation, 10-second Undo, History filters and delete confirmation. Phase 4 Settings/budget/savings refinements remain next.


Accounts visual refinement: Add Account lives inside the balance summary; the insight/chart row uses a 60/40 split and stacks on narrow screens or larger system text. Wallet cards retain their card width for an odd final account, with icon/name at the top and balance near the bottom. Compact typography is the default design direction: small supporting labels with clear headings and larger primary amounts, preserving system text scaling and comfortable touch targets.


### Compact workflows (phases 4-6)
- Account details use an options menu for edit, archive, delete, and advanced opening-balance correction. Normal editing changes name and purpose; saving sets Available Money inclusion from purpose. Existing account flags remain unchanged until an edit is saved.
- Transaction notes appear below the amount, with date/time and account selectors following. Existing category selection, transfer previews, confirmations, sticky save actions, and Undo are retained.
- Settings groups Profile, Budgets & Goals, Backup & Restore, and Reset App. Budget overspending is highlighted; goals show percentage and remaining money.
- Onboarding keeps the five-step flow and explains Home, Accounts, History, and Settings. Blank starting Cash defaults to zero; setup values survive Back/Continue within the session.
- Phone checks: account menu cancel/save, transfer previews and Undo, long History labels, budget and goal updates, onboarding with zero Cash, backup/restore cancellation, and reset confirmation. A full restart during unfinished onboarding starts the walkthrough again; no draft persistence was added.


### Offline assistance and reliability (phases 7-8)
Home insights run locally from recorded transactions: current-month budget usage, highest expense category, matched month-to-date spending comparisons (days 1-28 with records in both periods), net savings funding, and current goal progress. Up to three insights appear; they are summaries, not forecasts. Quick Entry shows an active account choice and prepares a review draft; an explicit account clause overrides the selection. No model, network request, or automatic financial write is used.

Device verification still required:
- In airplane mode, review Quick Entry and save/Undo an income, expense, and transfer; reopen the app and confirm records persist.
- Try ambiguous phrases, repeated Save taps, backdated entries, very large amounts, negative balances, and changing the selected account.
- Test small-screen layout, largest system text, TalkBack labels, keyboard visibility, long names, and money-input cursor movement.
- Export/restore an encrypted backup, try a wrong password, cancel replacement, and cancel reset before testing full reset with backed-up test data.
- The reported standalone APK crash after Save remains unconfirmed. With Android platform tools available, clear logs with `adb logcat -c`, reproduce the crash, then capture `adb logcat -b crash -d`. Record device/Android version, APK build, transaction type, and whether the record persists. Do not publish logs containing personal financial details.
- Lint is blocked until ESLint is installed/configured; TypeScript and finance tests provide the current automated checks.


### Kuwenta light palette
Shared theme tokens define navy text, blue spending cards, teal actions, green income/savings, red expenses/errors, amber warnings, white surfaces, and pale backgrounds. Success notices use green; transfers and record replacement use blue information styling. Undo timing remains unchanged. Small white button labels use darker teal for contrast. Verified primary text/button/account/notification pairs meet 4.5:1; category visuals retain distinct colors.


### Entry action menu, transfers, and offline chat
The floating plus opens Income, Expense, Transfer, and Chat actions. Account and goal transfer shortcuts use a dedicated internal-transfer route with account selection before amount entry. External/held funds and receipt attachments are not enabled.

Chat uses the existing offline phrase parser and displays an inline draft. Users can change type, amount, category, account, date/time, and note before explicitly saving. Cancel writes nothing; successful creation uses the existing 10-second Undo notification. Ambiguous phrases receive guidance to resend a corrected complete phrase. Chat history and unsaved drafts are temporary; no chat model or remote service is used.

Phone checks: action-menu dismissal and navigation; account/goal transfer preselection; both transfer balances and Undo; chat ambiguous input, change-details, cancel, repeated Save taps, wrong amounts, and persistence after reopening. Large system text and keyboard layout need device verification.


### External transfers
Transfer allows My accounts or External on either side; choosing External keeps the other side a tracked account. External incoming increases that balance, outgoing decreases it, and neither counts as income, expense, or internal savings funding. External records are hidden from History and Home recent transactions but listed under account details. Use Income for salary/gifts and Expense for purchases. This does not model custody liabilities or money held for another person.
SQLite schema 9 and backup payload 7 preserve external names, direction, amount, date/time, and notes. Older backups remain supported. External saves require confirmation and retain the existing creation Undo.
Income/Expense entry no longer offers Transfer or Quick Entry. Dedicated Transfer and Chat remain in the plus menu. Stray fragment whitespace in the transaction form was removed.
