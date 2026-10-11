# Kuwenta

A local PHP money tracker built with Expo 57, React Native, Expo Router, and SQLite. Amounts use exact integer centavos.

## Features

- Home with income/expense summaries, weekly activity, recorded spending insights, recent transactions, and budget usage.
- Multiple spending and savings accounts, balance adjustments, archive and supported account deletion.
- Income and expense entry, editing, deletion, validation, and Undo.
- Account-to-account and external transfers; external movements remain separate from income/expense reports.
- Monthly category budgets and savings goals in Plans.
- Filtered transaction history and readable dates.
- Onboarding, encrypted backup export/restore, and full reset in Settings.
- Money Check: rule-based, read-only purchase previews, recurring daily/weekday costs, monthly savings scenarios, balances and budget comparisons. Explicit prices and timeframes are required where relevant. Upcoming unrecorded bills and income are excluded.
- Quick Entry recognizes supported transaction phrases and opens a draft for review before saving.

## Development

```sh
npm ci
npx expo start --go
npx tsc --noEmit
npm run test:finance
```

Expo Go requires a compatible client for the installed SDK and native dependencies. Device validation is still required. `expo-dev-client` remains available for custom development builds.

```sh
npx expo run:android --device
npx expo start --dev-client
npx eas-cli@latest build --platform android --profile development
npx eas-cli@latest build --platform android --profile preview
```

The preview profile produces an installable Android APK. Installed standalone builds need rebuilding to receive code changes unless a separate update workflow is configured.

## Verification

Finance tests cover accounting, persistence boundaries, backups, validation, Quick Entry and Money Check scenarios. The Money Check dataset includes 40 representative English, Filipino and Taglish phrases; only predefined wording and supported frequencies are recognized. ESLint is not currently configured.

Phone testing should include repeated saves, Undo, transfers, keyboard layouts, backup/restore, reset, and hypothetical checks without any record changes.
