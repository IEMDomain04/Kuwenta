# Folder guide

Kuwenta keeps routes thin and finance code together under `src/features/finance/`. Application behavior and data formats stay the same as code is organized by responsibility.

| Location | Responsibility |
| --- | --- |
| `src/app/` | Expo Router routes and navigation layouts |
| `src/components/`, `src/hooks/`, `src/constants/` | App-wide UI, hooks, and theme |
| `src/features/finance/screens/` | Finance page layouts and screen interactions |
| `src/features/finance/components/` | UI grouped into home, accounts, budgets, transactions, savings, debts, backup, and shared |
| `src/features/finance/domain/` | Financial types, centavo calculations, validation, categories, budget periods, and workflows |
| `src/features/finance/reporting/` | Dashboard summaries, insights, spending blocks, and visualization preferences |
| `src/features/finance/backup/` | Backup files, JSON validation, Excel conversion, and legacy encrypted export support |
| `src/features/finance/integrations/` | Notification scheduling and launcher widget updates |
| `src/features/finance/storage/` | SQLite access, encryption, migrations, and transactional backup restoration |
| `src/features/finance/native/` | Android widget source used by the existing config plugin |
| `tests/finance/` | Financial and UI regression tests |

## Common starting points

- Home layout: `screens/home-screen.tsx`.
- Shared Home reporting period, selection, and calculations: `components/home/period-overview.tsx`.
- Weekly tiles and monthly calendar: `components/home/spending-activity.tsx`.
- Optional daily spending bar chart: `components/home/daily-spending-chart.tsx`. Enable it in Settings > Home visualizations.
- Compact income/expense card: `components/home/income-expense-summary.tsx`.
- Expanded daily spending details: `components/home/daily-spending-sheet.tsx`.
- Account cards and rows: `components/accounts/accounts-overview.tsx`.
- Budget dashboard: `components/budgets/budget-overview.tsx`.
- Transaction fields: `components/transactions/transaction-form.tsx`.
- Home setup checklist: `components/home/tracker-setup.tsx`; progress is saved by `storage/tracker-setup.ts`.
- Shared controls and confirmations: `components/shared/`.
- Finance state and operations: `provider.tsx` and its web counterpart.

Paths above are relative to `src/features/finance/`. Keep platform counterparts together, such as `notifications.tsx` and `notifications.web.tsx`. Keep assets in `assets/` and update relative asset references when moving components.

## Verification

Run `npx tsc --noEmit` and `npm run test:finance` after moving files. Tests compile finance TypeScript into the generated `.expo/finance-tests/` directory. An Android bundle export also checks Metro imports and bundled asset references.

## Code organization

Keep shared reporting state in `PeriodOverview` and pass values and callbacks to the focused views. Cards own their presentation, theme, and privacy formatting. Financial calculations stay in `domain/` and `reporting/`; database writes stay in the provider and storage layer. Extract a component when it represents a distinct view, rather than creating a helper for each JSX fragment.

## First-run setup

`components/shared/cash-setup.tsx` introduces Home visuals before setup finishes. Completing onboarding creates checklist progress in the existing SQLite preferences table, with accounts checked only if the user explicitly entered a balance, including zero. A blank balance leaves that step unchecked. The provider checks accounts after an account is saved, and checks transaction, budget, and goal milestones after successful saves. Home visualizations start with none selected. Users choose their own charts in Settings, where confirming no selection also completes the visuals step. Existing saved choices remain unchanged.

The Home checklist starts expanded below the mascot and hides when dismissed or when every step is completed or skipped. Only budgets and goals can be skipped. An empty tracker without saved progress also starts the checklist automatically. Users with records are not enrolled automatically, and saved dismissals are respected. Settings > Tracker setup explicitly opens the checklist, including completed steps. These local guidance preferences are separate from financial backup records.
