# Kuwenta

A local PHP money tracker built with Expo 57, React Native, Expo Router, and SQLite. Amounts use exact integer centavos.

## Features

- Home with income/expense summaries, weekly activity, recorded spending insights, recent transactions, and budget usage.
- Multiple spending and savings accounts, balance adjustments, archive and supported account deletion.
- Income and expense entry, editing, deletion, and validation.
- Account-to-account and external transfers; external movements remain separate from income/expense reports.
- Monthly category budgets and savings goals in Plans.
- Filtered transaction history and readable dates.
- Onboarding, password-free backup export/restore, and full reset in Settings.
- Quick Entry recognizes supported transaction phrases and opens a draft for review before saving.

## Development

```sh
npm ci
npx expo start --go
npx tsc --noEmit
npm run test:finance
```

For ordinary UI and financial tracking tests, run `npx expo start --go` and scan with an SDK-compatible Expo Go client. Expo Go uses a separate, unencrypted `kuwenta-expo-go-test.db`; test records persist across reloads but do not automatically transfer to the installed app. Use sample data, or deliberately import a backup if needed. Notifications, launcher widgets, and database encryption still require an installed APK or development build. `expo-dev-client` remains available for custom development builds.

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

Startup uses the native green splash screen without the Expo overlay. Unused starter components and direct device, browser, gesture, Reanimated, and Worklets dependencies have been removed. Charts, encrypted SQLite, legacy backup import, and mascot assets remain. Native dependencies required transitively by Expo Router may remain installed.

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

Backup export saves a portable, password-free JSON or Excel (.xlsx) file through the phone's share/save options. Export serializes the fully loaded financial snapshot; it does not derive a password key or open another SQLite read transaction. Backups contain accounts, transactions, transfers, adjustments, budgets, and savings goals. Backups do not include the profile name, appearance, notification settings, or display-order preferences. The file is readable, so keep saved copies private. The share sheet cannot confirm whether a destination saved the file; temporary export files are removed when sharing closes.

Excel exports contain readable Transactions, Accounts, Budgets, and Goals sheets, plus Kuwenta format/version metadata. Both JSON and Excel restore the same financial data. Dates and stable IDs stay as text, amounts preserve exact centavos, and formulas, incompatible workbooks, missing sheets, and invalid records are rejected. File input remains limited to 10 MB; Excel also limits rows and expanded archive size.

Import reads a temporary local copy, tolerating missing Android provider size metadata, and validates the selected file before showing a compact preview of its date, accounts, records, budgets, goals, and balances. Explicit confirmation replaces all financial records in one transaction; failures roll back and preserve current records. Existing encrypted .kuwenta backups are detected automatically and still require their original password. Only this compatibility path retains AES-256-GCM, the existing 600,000 PBKDF2 iterations, and optional native key derivation.

## Android home-screen widget

Kuwenta Quick Entry is a small green home-screen widget with Expense, Income, and Quick Entry shortcuts. Each opens its entry screen; saving still requires user approval. It stores no financial information and runs no periodic background tasks. The local config plugin generates the Android receiver, Kotlin provider, and XML resources during prebuild, with no extra dependencies.

Build and install a new APK, then hold an empty area of the phone home screen, choose Widgets, and add Kuwenta Quick Entry. Launcher sizes may vary. Expo Go and older APKs cannot display it. Test each shortcut with the app closed and already open, cancellation, and multiple widget instances on the installed build.

Budget cards use category icons and separate lines for names, amounts, and progress. Tap the feedback to see context about available spending money and remaining allowances. Historical/future budgets are not compared with today's balances; this is recorded-data feedback, not a forecast of unrecorded bills. Non-Cash accounts can be deleted whether active or archived, after a confirmation describing their balance, related records, linked goal, and affected transfer accounts. Deletion removes these records atomically and recalculates reports and balances; failed operations roll back. Archive keeps records and supports later unarchiving. The default Cash account cannot be deleted.

In-app notices are centered below the header, leaving navigation controls accessible. Success notices dismiss after four seconds; errors allow seven seconds and can be dismissed manually. Surrounding touches pass through.

Android additionally offers My Cash and Available Money widgets. They display the last loaded balances with an update timestamp, refresh after app loads/saves/restores/resets, and open Accounts when tapped. The optional inline KuwentaWidgets module updates a small local cache; it never reads the database in the background. All widget providers have launcher labels/icons and legacy preview images. Install a newly rebuilt APK to test visibility in the phone launcher; Expo Go and older APKs cannot provide these widgets. Launcher-specific visibility remains a device check.

Foreground clock/month timers stop while the app is inactive and restart on return. No background polling, wake locks, or periodic widget updates are introduced. Local reminders are scheduled with the operating system. Actual battery consumption must be measured on the phone.

Budget dashboard uses a single limit/spent/remaining summary, month selection and Add in the header, compact category/amount rows, thin progress bars, and expandable recorded-data feedback. Edit/Delete icons share the feedback row. Spending without a budget starts collapsed. Notices use translucent green-tinted surfaces with readable theme colors and a subtle border, with an opaque fallback for reduced transparency (iOS) or high text contrast (Android). No blur dependency or background service is added.

### Encrypted local records

Native builds use SQLCipher for the financial database and a random 256-bit key in Expo SecureStore. A new APK is required for encryption; old native builds stop with an update message instead of falling back to plaintext. Expo Go alone uses the separate unencrypted test database described above, without opening the encrypted database or accessing its key. On first launch, existing records are exported to a staging database, compared, integrity checked, and reopened with the stored key before deleting the legacy database and its journal files. Failed copies preserve the original for retry. Subsequent opens reuse the encrypted file without running the copy or full integrity scan.

Export a backup before upgrading, and install the APK as an update without uninstalling. Android cloud backup and device transfer are excluded because the database key cannot be restored with the database. Missing or invalid keys never trigger a silent reset. The startup recovery form lets you choose and preview an exported backup (older encrypted files require their original password), then explicitly confirm replacement. Recovery writes and verifies a separate encrypted database before atomically saving its key and filename in SecureStore; the inaccessible original is retained. Failed moves preserve the plaintext original, and journal cleanup is retried independently of the main file. Widgets still expose their cached balances, and this does not add an app lock or protect a running app on a fully compromised phone. Native SQLCipher migration must be tested on an updated APK before release; JavaScript mocks do not validate the native encryption engine.

## Recorded-data insights

Home prioritizes negative recorded balances, budget warnings, and available money versus remaining positive budget allowances. Having no recorded income or spending more than recorded income does not trigger a warning. Ordinary spending uses a friendly mascot; near-budget reminders, higher spending over matched elapsed days, and savings withdrawals use a neutral thinking expression. Concern is reserved for budget overruns, negative balances, and budget funding gaps. Staying within budget, adding savings, and goal progress receive encouraging feedback; reached goals receive a celebrating expression. Savings funding, goal progress, and largest income/expense categories follow; tapping the mascot shows all relevant messages rather than only three. Future-dated entries are excluded from period feedback. These are recorded facts, not predictions or permission to spend.

Accounts keeps balance definitions behind the question-mark help button, including every account's contribution and inclusion in Available Money. A separate insight card highlights negative balances, limited spending funds alongside savings, budget allowance gaps, and balance declines of at least 25% over the last 30 days. When none apply, it shows a short savings or current-month spending summary, or a starting-balance prompt for an empty account. The smaller help icon sits above the mascot at the upper-left of the money summary card. Balance changes may include transfers and adjustments. Current totals preserve existing accounting rules, including archived accounts. Insight results are memoized until records or the Philippine calendar date change. No AI, polling, or new dependency is introduced.

Account creation and editing offer Default, Green, Blue, Teal, Plum, and Amber card colors, with a live preview and light/dark variants. Existing accounts retain purpose-based default colors. Database schema 10 adds only an optional color column; version 8 backups preserve custom colors and still accept all older backup versions. Card colors do not affect balances or reports.

Expense pickers use separate categories for meals, snacks, drinks, groceries, personal care, cleaning supplies, mobile load/data, games/entertainment, tech/accessories, and school supplies/personal items. Quick Entry maps toothbrush and toothpaste to Personal Care, and detergent or dish soap to Cleaning Supplies. Retired broad or combined categories remain supported on existing transactions, budgets, and imported backups; new entries show only the updated choices. Existing history is not automatically recategorized.

External movements remain separate from ordinary transaction History and income/expense reports. Tap a movement under Account details to edit its account, direction, amount, external name, date/time or note, or delete it after reviewing the resulting balance. Editing replaces its original balance effect; ID and creation timestamp are kept. Archived accounts require unarchiving for edits, while deletion remains available. Existing JSON and Excel backup formats retain these records without a schema change.

Budgets support Overall spending as well as category limits for daily, weekly and monthly periods. Overall spending counts all recorded expenses, including fees, and excludes income, transfers and external movements. When both exist, the period summary uses the overall limit; category limits are displayed separately and are not added to it. JSON and Excel backups preserve overall budgets using the existing budget fields.

The eye button beside the Home greeting hides or reveals financial amounts across Home, Accounts, budget summaries and Savings. Amounts are visible by default; the preference is saved locally and applied before rendering. Hidden amounts use a fixed mask in chart details, insights and accessibility labels too. Entry/edit fields, transaction History, exported backups, phone notifications and widgets retain their existing behavior.

Plans displays Debts below Savings and Goals, with separate I owe and Owed to me sections and outstanding totals. The When did this happen? dropdown after the person's name offers Just now or Already happened. Just now records the actual account movement. Already happened tracks the amount still owed without an initial money movement or account selection; correct inaccurate account balances separately. Actual repayments always update the selected account, reducing the debt until settled, without entering income, expense or budget totals. Interest and fees stay separate normal transactions. Deleting a debt reverses only the money movements actually recorded for it. Schema 16 preserves earlier debt records while allowing tracking-only entries. JSON backup version 13 and Excel workbook version 5 support existing debts, and earlier backups remain supported. Privacy masking also applies to debt summaries.

New debt forms use Notes for agreed repayment dates instead of a separate due-date field. Due dates from existing records and imported backups remain readable and preserved.


## Assistant chat feedback

Chat shows one thinking mascot with subtle native-driver motion and status dots inside the pending reply. The streamed answer replaces it in the same card, without a duplicate avatar or Assistant header. Reduced-motion settings disable animation. Validated model text and calculated fallback replies appear in small word groups; Stop, navigation, backgrounding, and record changes cancel pending display timers. Scrolling up pauses automatic following until the user returns near the bottom. Financial calculations and the model remain unchanged. EAS uploads include the bundled model required by the native plugin, excluding partial downloads.


Assistant guidance is scoped to balance, spending, income, budgets, savings, goals, or purchase questions. Short follow-ups use the latest topic and price; singular peso and k prices are recognized. Calculated fallbacks remain specific to the question, repeated model sentences are rejected, and supporting figures are collapsed behind View figures used. The current model, sampling settings, and financial storage are unchanged. Test actual generated wording on a phone; regression tests check the context, fallback calculations, guards, streaming, and UI behavior.


Assistant what-if replies can offer one app-calculated comparison: an illustrative cheaper price, fewer purchases per week, keeping an amount untouched, a conditional savings-goal schedule, or a possible category reduction. Scenario assumptions are labeled and never saved as transactions, budgets, goals, or reserved cash. Followups distinguish product prices from frequency and reserve amounts. Illustrative prices are not market quotes, schedules do not predict income, and reducing food or transport is not assumed appropriate. The existing model and native runtime are unchanged.
