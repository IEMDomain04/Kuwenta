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

Home and Accounts insights use short facts and everyday wording. Home covers daily/weekly/monthly and overall budgets, matched-date spending changes, income sources, goals, separate money moved into/out of savings, and outstanding debts. Students without recorded income receive neutral feedback. Account insights distinguish actual spending, transfers, cash-in/out fees, service-exchange earnings, borrowing/repayments, and balance corrections. Transfers with a fee explain the reduction in total money. Archived and excluded balances remain explained through insights and the existing question-mark help.

Each page shows one main insight and up to four others, with issues first and milestones next. Empty records receive a setup prompt. Future activity is excluded from period feedback, and comparisons use equally long date ranges. Insight calculations are read-only, memoized by records/date, and respect amount privacy. Ordinary spending alone does not produce a concerned mascot.

Income choices include Savings Interest for actual bank interest credits, plus Gifts and Other Income, with Gift and Other retained for old records/backups. Editing an old income uses its current category label; saved history is not rewritten in bulk. Income insights combine the equivalent labels. Expense Gifts has its own icon and works in budgets, reports, and JSON/Excel exports. Quick Entry distinguishes received gifts from bought/given gifts, and asks for clarification on phrases such as "gift 500".

Account creation and editing offer Default, Green, Blue, Teal, Plum, and Amber card colors, with a live preview and light/dark variants. Existing accounts retain purpose-based default colors. Database schema 10 adds only an optional color column; version 8 backups preserve custom colors and still accept all older backup versions. Card colors do not affect balances or reports.

Expense pickers use separate categories for meals, snacks, drinks, groceries, personal care, cleaning supplies, mobile load/data, games/entertainment, tech/accessories, and school supplies/personal items. Quick Entry maps toothbrush and toothpaste to Personal Care, and detergent or dish soap to Cleaning Supplies. Retired broad or combined categories remain supported on existing transactions, budgets, and imported backups; new entries show only the updated choices. Existing history is not automatically recategorized.

External movements remain separate from ordinary transaction History and income/expense reports. Tap a movement under Account details to edit its account, direction, amount, external name, date/time or note, or delete it after reviewing the resulting balance. Editing replaces its original balance effect; ID and creation timestamp are kept. Archived accounts require unarchiving for edits, while deletion remains available. Existing JSON and Excel backup formats retain these records without a schema change.

Budgets support Overall spending as well as category limits for daily, weekly and monthly periods. Overall spending counts all recorded expenses, including fees, and excludes income, transfers and external movements. When both exist, the period summary uses the overall limit; category limits are displayed separately and are not added to it. JSON and Excel backups preserve overall budgets using the existing budget fields.

The eye button beside the Home greeting hides or reveals financial amounts across Home, Accounts, budget summaries and Savings. Amounts are visible by default; the preference is saved locally and applied before rendering. Hidden amounts use a fixed mask in chart details, insights and accessibility labels too. Entry/edit fields, transaction History, exported backups, phone notifications and widgets retain their existing behavior.

Plans displays Debts below Savings and Goals, with separate I owe and Owed to me sections and outstanding totals. The When did this happen? dropdown after the person's name offers Just now or Already happened. Just now records the actual account movement. Already happened tracks the amount still owed without an initial money movement or account selection; correct inaccurate account balances separately. Actual repayments always update the selected account, reducing the debt until settled, without entering income, expense or budget totals. Interest and fees stay separate normal transactions. Deleting a debt reverses only the money movements actually recorded for it. Debt details provides Add borrowed amount for later borrowing, keeping the original entry and repayments intact. Edit original amount corrects a mistaken first entry and updates only its linked account movement after confirmation. Additions also support Already happened without moving money. Invalid corrections or deletions that would leave repayments above the amount borrowed at that date are rejected. Schema 17 preserves existing records and stores additions separately. JSON backup version 14 and Excel workbook version 6 include added borrowing; earlier backups remain supported. Privacy masking also applies to debt summaries.

New debt forms use Notes for agreed repayment dates instead of a separate due-date field. Due dates from existing records and imported backups remain readable and preserved.


## Build an APK with GitHub Actions

The manually triggered **Build Kuwenta APK** workflow compiles on a standard GitHub Ubuntu runner. It uses `eas build --local` with the existing `preview` profile, so compilation does not consume EAS cloud build credits. Expo authentication remains necessary to download the existing signing credentials and increment the remotely managed Android version code.

One-time setup: create an Expo personal access token at https://expo.dev/accounts/iemdomain04/settings/access-tokens and add it as the repository Actions secret `EXPO_TOKEN`. Never commit the token, keystore, or `credentials.json`.

Open **Actions > Build Kuwenta APK > Run workflow**, use the workflow from `main`, and leave **Branch or commit to build** as `staging` for the latest staged changes (or enter `main` for a release from main). After success, download the **kuwenta-apk** artifact and extract `kuwenta.apk`. Artifacts expire after seven days. Install as an update rather than uninstalling the current app. Keep an exported backup before updating.

The workflow runs TypeScript and finance regression checks, uses actions pinned to commit revisions, and exposes the Expo token only to authentication/build steps. Gradle dependencies/task caches are reused between runs; signing credentials and the EAS working directory are not cache paths. Gradle and CMake compilation are limited to two workers, parallel Gradle projects are disabled, and Kotlin compiles inside the Gradle process with a 4 GB Java heap limit. During APK compilation, memory, disk, process usage, and available cgroup memory-event counters are reported every minute. These reports show runner activity, not compiler progress. Compilation is limited to 90 minutes (the overall job remains limited to 120 minutes). The first run with an empty cache can still be slow; these changes do not establish the cause of a previous stall. Workflow changes must reach the branch selected under **Use workflow from** (normally `main`); pushing only to the app's `staging` build input does not update the workflow definition for a run launched from `main`. GitHub's own usage and storage allowances still apply. No phone database or exported financial backup is required for building.

The Home spending-by-category chart shows at most the ten largest categories as proportional, tappable blocks with existing category colors. Its list starts with five categories; Others reveals the remaining five at most, and Show less collapses it. Percentages and block sizes refer to the displayed categories only. Categories outside the top ten remain saved and included in the other financial reports and totals. A tappable list keeps small categories accessible; selecting a category immediately expands its transactions below its list row; tapping it again collapses the list. Selecting a block reveals its category row when needed. Switching the report period clears selection, and the chart omits the duplicate spending total. Amount visibility also masks percentages and transaction amounts. No additional chart dependency is required.

Saved-item editors use the same upper-right destructive trash button for transactions, accounts, budgets, goals, debts, and external movements. Creation forms have no trash action; deletion keeps the existing confirmation and linked-record safeguards. Account Archive/Unarchive stays in its options menu, and individual borrowing/repayment history actions remain attached to their own records.

In-app notices use a compact translucent pill with a subtle gradient highlight and native-driven slide/fade transitions. No additional toast or blur dependency is installed. Notices retain the existing four-second success and seven-second error timing, privacy masking, manual dismissal, and placement below the header. Reduced motion disables transitions; reduced transparency or Android high-text-contrast settings select a solid surface.
