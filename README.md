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

Build uploads use `.easignore` to exclude tests, local tools, unused starter artwork, and the original design export. Active mascot assets and the Kuwenta app icon remain included. Android release minification and resource shrinking are enabled. Final APK size and device behavior must be checked after building.

Accounts can be held and dragged to reorder within Spending or Savings in card or list view. Order is a local display preference, retained after reopening; resetting or restoring records clears it. Screen-reader actions can move an account earlier or later. Financial save/delete feedback uses the shared top toast, while editors and destructive confirmations remain interactive dialogs.

Account dragging previews neighboring positions and saves only on release, without a success toast. Cancelled moves restore the previous order. Field validation uses short top notices; account IDs stay internal. Transaction notices omit .00 for whole-peso amounts.

Backup export accepts passwords of 8 to 128 characters and reports reading, encryption, file writing, and sharing separately. Preparation can be cancelled and times out after two minutes; late preparation cannot open the share sheet after cancellation. Encryption retains the existing AES-256-GCM / PBKDF2 settings, so older backups remain readable. The share sheet cannot confirm whether a destination saved the file.

Android backup password derivation uses the small inline `KuwentaBackupCrypto` module and the platform PBKDF2-HMAC-SHA256 provider, off the JavaScript thread. The existing 600,000 iterations and encrypted format are unchanged. Export serializes the fully loaded financial snapshot rather than opening another SQLite transaction. Rebuild/install the APK (or development client) to enable native acceleration; Expo Go, iOS, and older builds use the compatible JavaScript fallback. No additional dependency is needed.
