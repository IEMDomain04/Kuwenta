# UX workflow improvements

## Implemented

- New entries focus the amount and remember the last eligible account. Account choices show current balances; transfer previews show balances after saving and replace the original record during edits.
- Accounts and Goals have dedicated overview routes while retaining the three existing bottom tabs. Home shows compact previews with links to all records.
- Account details expose transfer and balance adjustment actions. Account options include editing, correcting the opening balance, and confirmed archiving or unarchiving.
- New goals can link an eligible savings account or create a dedicated zero-balance savings account inline. Creation requires review, and a new account and goal are saved atomically.
- Home separates current Available Money and Total Money from monthly reports, retains five recent transactions, and uses the shared Add Transaction button.
- Settings groups account management, encrypted backups, appearance, and application information. History makes active filters visible and offers reset actions.

## Storage and scope

SQLite schema version 6 adds a local last-used-account preference. Successful transaction creation updates it atomically; restore clears it. Financial backup payload version 5 and encryption remain unchanged. Existing financial calculations, integer-centavo amounts, transfer rules, and Undo are retained. No dependencies were added.

## Phone verification checklist

1. Add an expense: amount receives focus, account balance is visible, save succeeds, and Undo removes only that record within ten seconds.
2. Add income and reopen entry: the last eligible account is selected. Archive it and verify a valid fallback.
3. Open an account from Home, transfer to another account, and compare the preview with both resulting balances.
4. Edit a transfer: preview replaces the original amount rather than applying both transfers.
5. Open Accounts, edit settings, adjust current balance, correct the opening balance, and cancel confirmations without changing records.
6. Archive and unarchive an account; verify history and funds are preserved.
7. Create a goal with a new dedicated account: cancel review first, then confirm; verify only one account and goal exist.
8. Link a goal to an existing eligible savings account; verify no funds are moved by creating or deleting the goal.
9. Change Home month and history filters; verify monthly totals, five recent transactions, empty states, and filter reset behavior.
10. Export and restore an encrypted backup, restart the app, and verify records. Check navigation, keyboard visibility, safe areas, large text, and long amounts on the phone.

Automated finance and storage tests cover financial regressions and atomic writes. A successful Android export verifies bundling, not on-device layout or keyboard behavior. ESLint is not configured in the existing project.

## Reset all data

Settings > Start fresh > Reset all data opens a destructive confirmation. Cancel keeps data unchanged. Confirm atomically clears all accounts, transactions, goals, and local preferences, then creates an active PHP Cash account with a zero opening balance. Reporting month and mounted drafts reset; the old Undo action is replaced. Exported backup files are retained. Reset has no Undo; export a backup first. This action affects Kuwenta only, not other Expo Go projects.

## Starting Cash setup

Fresh installs and full resets ask for starting Cash before Home. Start tracking accepts a nonnegative peso amount with two decimal places; Start with zero skips entry. SQLite schema 7 saves completion and opening balance atomically, without income records. Existing databases are marked complete on upgrade without changing balances. Restored backups skip setup. Test keyboard visibility and repeated taps on a phone; closing before setup completes should show it again.

## Delete an unused account

Account details > Account options > Delete account requires confirmation. Only non-Cash accounts with zero balance, no transaction history (including transfer destinations), and no linked goal can be deleted. Archived unused accounts can also be deleted. SQLite checks eligibility atomically and clears the remembered account preference when applicable. Cancel makes no writes; accounts with history should be archived.

## Monthly category budgets

Home > View budgets opens monthly budgets using the shared month selector. Add an expense category and a positive limit. Spent, remaining, and progress derive from all accounts' expenses in the selected Philippine transaction month; transfers, income, and balance adjustments do not count. Remaining can be negative; progress bars cap visually at 100%, while labels report overspending. Expenses without a budget are listed separately. Budgets never change account balances.

Edits and deletions require confirmation; cancellation preserves data. Deleting a budget keeps expenses. Copy previous month fills only missing categories atomically and keeps existing limits. No rollover or automatic monthly copying is implemented.

SQLite schema 8 adds budgets keyed by month and category. Financial backup payload 6 includes them; encryption is unchanged. Versions 1-5 remain readable and restore with empty budgets. Full reset clears budgets.

Phone checks: add a Food limit of PHP 5,000 and expense of PHP 1,200 (PHP 3,800 remaining, 24%); edit/backdate/delete the expense; reach and exceed the limit; switch months; cancel edits/deletion; copy previous month twice and verify existing limits; restart; export/unlock/restore a backup with budgets; test reset using disposable records. Check the keyboard, large text, and small-screen scrolling.
