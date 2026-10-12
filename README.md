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

Onboarding and Settings offer optional tracking reminders and budget alerts. Notifications use `expo-notifications`, with no push server, AI, or network dependency. Kuwenta skips notification setup in Expo Go to avoid the package entry point's Android push-registration error; test reminders in an installed APK or development build. Tracking reminders are scheduled automatically at 8 AM, 2 PM, and 8 PM Philippine time, with quiet hours overnight. Schedule details are omitted from the UI; users retain opt-in and tracking/budget toggles. Entries recorded within six hours of a reminder suppress that slot, including backdated entries; balance adjustments alone do not. At most 42 reminder slots are planned 14 days ahead and refreshed on launch and record changes. Reopen the app after a prolonged absence to refresh the schedule. Legacy one-per-day reminders are replaced automatically. Phone power-saving and notification settings can delay or block delivery.

Budget alerts report 80% usage and spending above the limit, once per category/threshold/month. Existing spending is baselined when enabling alerts or restoring data. Device notifications hide category names and amounts; tapping them opens Home or Budgets. Save confirmations appear as top toasts with no Undo. Edit/delete remains available in History.

A new APK is required for the native notification module and splash changes. Device checks: permission allow/deny, enabling and disabling, quiet hours and recent-activity suppression, cancellation after a save, budget threshold deduplication after restart/edit/restore, cold-launch notification taps, and both appearance modes.

Build uploads use `.easignore` to exclude tests, local tools, unused starter artwork, and the original design export. Active mascot assets and the Kuwenta app icon remain included. Android release minification and resource shrinking are enabled. Final APK size and device behavior must be checked after building.

Accounts can be held and dragged to reorder within Spending or Savings in card or list view. Order is a local display preference, retained after reopening; resetting or restoring records clears it. Screen-reader actions can move an account earlier or later. Financial save/delete feedback uses the shared top toast, while editors and destructive confirmations remain interactive dialogs.

Account dragging previews neighboring positions and saves only on release, without a success toast. Cancelled moves restore the previous order. Field validation uses short top notices; account IDs stay internal. Transaction notices omit .00 for whole-peso amounts.

Backup export accepts passwords of 8 to 128 characters and reports reading, encryption, file writing, and sharing separately. Preparation can be cancelled and times out after two minutes; late preparation cannot open the share sheet after cancellation. Encryption retains the existing AES-256-GCM / PBKDF2 settings, so older backups remain readable. The share sheet cannot confirm whether a destination saved the file.

Android backup password derivation uses the small inline `KuwentaBackupCrypto` module and the platform PBKDF2-HMAC-SHA256 provider, off the JavaScript thread. The existing 600,000 iterations and encrypted format are unchanged. Export serializes the fully loaded financial snapshot rather than opening another SQLite transaction. Rebuild/install the APK (or development client) to enable native acceleration; Expo Go, iOS, and older builds use the compatible JavaScript fallback. No additional dependency is needed.

## Android home-screen widget

Kuwenta Quick Entry is a small green home-screen widget with Expense, Income, and Quick Entry shortcuts. Each opens its entry screen; saving still requires user approval. It stores no financial information and runs no periodic background tasks. The local config plugin generates the Android receiver, Kotlin provider, and XML resources during prebuild, with no extra dependencies.

Build and install a new APK, then hold an empty area of the phone home screen, choose Widgets, and add Kuwenta Quick Entry. Launcher sizes may vary. Expo Go and older APKs cannot display it. Test each shortcut with the app closed and already open, cancellation, and multiple widget instances on the installed build.


Budget cards use category icons and separate lines for names, amounts, and progress. Tap the feedback to see context about available spending money and remaining allowances. Historical/future budgets are not compared with today's balances; this is recorded-data feedback, not a forecast of unrecorded bills. Accounts with a balance, history, or linked goal cannot be deleted; their options menu explains the restriction and offers Archive.

In-app notices are centered below the header, leaving navigation controls accessible. Success notices dismiss after four seconds; errors allow seven seconds and can be dismissed manually. Surrounding touches pass through.

Android additionally offers My Cash and Available Money widgets. They display the last loaded balances with an update timestamp, refresh after app loads/saves/restores/resets, and open Accounts when tapped. The optional inline KuwentaWidgets module updates a small local cache; it never reads the database in the background. All widget providers have launcher labels/icons and legacy preview images. Install a newly rebuilt APK to test visibility in the phone launcher; Expo Go and older APKs cannot provide these widgets. Launcher-specific visibility remains a device check.

Foreground clock/month timers stop while the app is inactive and restart on return. No background polling, wake locks, or periodic widget updates are introduced. Local reminders are scheduled with the operating system. Actual battery consumption must be measured on the phone.


Budget dashboard uses a single limit/spent/remaining summary, month selection and Add in the header, compact category/amount rows, thin progress bars, and expandable recorded-data feedback. Edit/Delete icons share the feedback row. Spending without a budget starts collapsed. Notices use translucent green-tinted surfaces with readable theme colors and a subtle border, with an opaque fallback for reduced transparency (iOS) or high text contrast (Android). No blur dependency or background service is added.

### Encrypted local records

Native builds use SQLCipher for the financial database and a random 256-bit key in Expo SecureStore. A new APK is required; Expo Go and old builds stop with an update message instead of falling back to plaintext. On first launch, existing records are exported to a staging database, compared, integrity checked, and reopened with the stored key before deleting the legacy database and its journal files. Failed copies preserve the original for retry. Subsequent opens reuse the encrypted file without running the copy or full integrity scan.

Export a password-protected backup before upgrading, and install the APK as an update without uninstalling. Android cloud backup and device transfer are excluded because the database key cannot be restored with the database. Missing or invalid keys never trigger a silent reset. The startup recovery form lets you unlock and preview an exported backup, then explicitly confirm replacement. Recovery writes and verifies a separate encrypted database before atomically saving its key and filename in SecureStore; the inaccessible original is retained. Failed moves preserve the plaintext original, and journal cleanup is retried independently of the main file. Widgets still expose their cached balances, and this does not add an app lock or protect a running app on a fully compromised phone. Native SQLCipher migration must be tested on an updated APK before release; JavaScript mocks do not validate the native encryption engine.
