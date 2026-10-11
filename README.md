# Kuwenta

A local PHP money tracker built with Expo 57, React Native, Expo Router, and SQLite. Amounts use exact integer centavos.

## Features

- Home with income/expense summaries, weekly activity, recorded spending insights, recent transactions, and budget usage.
- Multiple spending and savings accounts, balance adjustments, archive and supported account deletion.
- Income and expense entry, editing, deletion, and validation.
- Account-to-account and external transfers; external movements remain separate from income/expense reports.
- Monthly category budgets and savings goals in Plans.
- Filtered transaction history and readable dates.
- Onboarding, encrypted backup export/restore, and full reset in Settings.
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

Finance tests cover accounting, persistence boundaries, backups, validation, Quick Entry scenarios, including mobile load expenses and cash-in/cash-out transfers between existing accounts. ESLint is not currently configured.

Phone testing should include repeated saves, transfers, keyboard layouts, backup/restore, reset, and Quick Entry draft review before saving.

## App size

Android preview and production builds enable R8 code shrinking and unused-resource shrinking through `expo-build-properties`. Development builds include developer tools and are not representative of release size. Use the preview profile for a standalone APK; production generates an Android App Bundle for Play Store delivery.

Startup uses the native green splash screen without the Expo overlay. Unused starter components and direct device, browser, gesture, Reanimated, and Worklets dependencies have been removed. Charts, SQLite, backup encryption, and mascot assets remain. Native dependencies required transitively by Expo Router may remain installed.

Measure final size from a newly built release APK or Play-delivered app. JavaScript export measurements exclude native libraries and generated launcher resources. After changing native dependencies, regenerate local native projects using Expo prebuild before a local release build.

## Appearance

Settings offers Light, Dark, and Use device setting. Appearance saves locally using Expo SQLite key-value storage, separately from financial backups. Existing users default to Light.

## Local notifications

Onboarding and Settings offer optional daily reminders and budget alerts. Notifications use `expo-notifications`, with no push server, AI, or network dependency. Kuwenta skips notification setup in Expo Go to avoid the package entry point's Android push-registration error; test reminders in an installed APK or development build. Reminder windows use Philippine time. One stable varied time is selected per day, scheduled 30 days ahead and refreshed on launch and record changes. Recording a transaction cancels the pending reminder for that recording day, including backdated entries. If the app stays unopened longer than 30 days, reopen it to refresh reminders. Phone power-saving and notification settings can delay or block delivery.

Budget alerts report 80% usage and spending above the limit, once per category/threshold/month. Existing spending is baselined when enabling alerts or restoring data. Device notifications hide category names and amounts; tapping them opens Home or Budgets. Save confirmations appear as top toasts with no Undo. Edit/delete remains available in History.

A new APK is required for the native notification module and splash changes. Device checks: permission allow/deny, enabling and disabling, all reminder windows, cancellation after a save, budget threshold deduplication after restart/edit/restore, cold-launch notification taps, and both appearance modes.
