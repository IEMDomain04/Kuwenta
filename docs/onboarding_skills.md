Metadata
name
mobile-first-run-guidance
description
Plan, design, and implement mobile-first guidance after signup or onboarding when users must create their first in-app account before recording a transaction. Use for Home activation cards, Accounts empty states, progress checklists, and first-transaction handoffs in iOS, Android, or cross-platform apps.
Mobile First-Run Guidance — UX Skill

1. Purpose and scope
   Act as a senior mobile UX designer and product-minded implementation partner. Help a newly onboarded user understand what to do next, then complete the smallest meaningful sequence:

Create the user's first in-app financial account (for example, Cash, Bank, or Wallet).
Record the first eligible transaction against that account (for example, Expense or Income).
Working assumption: “Account” means an account that holds or organizes transactions, not a login/user profile. Validate this against the actual product and adapt labels and prerequisites if the domain differs.

This skill covers the post-onboarding Home and Accounts screens, transitions to account creation and transaction creation, progress tracking, and completion. It does not redesign the initial signup flow or build a separate tutorial.

2. UX diagnosis
   User problem
   An onboarding flow can end successfully while leaving a new user on an empty Home or Accounts screen. A blank dashboard may not explain:

Why creating an account is necessary.
Which action should happen first.
Why transactions are unavailable before setup.
What success looks like after the first action.
Product objective
Reduce ambiguity and help users reach first useful value: an account created and a transaction recorded. Optimize for task completion, not merely tutorial completion or button clicks.

Design decision
Use progressive, contextual guidance rather than a forced guided tour.

Home: A compact Getting Started card with a two-step checklist and only one prominent primary CTA for the current step.
Accounts with zero accounts: A dedicated empty state with one explanation and a Create account CTA.
After an account exists: Shift the primary Home guidance to Add first transaction.
After the first transaction: Retire the first-run checklist; show the regular product experience.
Keep both screens synchronized to the same underlying user state. Do not stack duplicate walkthroughs, modals, coach marks, and banners.

3. Core interaction flow
   Onboarding completed
   |
   v
   Home: Getting Started (0 of 2)
   [ ] Create your first account <-- Primary CTA: Create account
   [ ] Record your first transaction (upcoming)
   |
   v
   Account creation form
   |
   +-- Cancel / error --> Preserve accurate 0-of-2 state
   |
   +-- Successfully saved --> Confirmation + explicit next-step CTA
   |
   v
   Home: Getting Started (1 of 2)
   [x] Create your first account
   [ ] Record your first transaction <-- Primary CTA: Add transaction
   |
   v
   Transaction creation (eligible account preselected when appropriate)
   |
   +-- Cancel / error --> Stay 1 of 2
   |
   +-- Successfully saved --> Regular Home
   (checklist retired)
   Alternative entry: If the user opens Accounts before creating an account, show the Accounts empty state and route its CTA into the same account-creation flow. Never create a second onboarding path with inconsistent logic.

Do not automatically launch transaction creation immediately after saving an account. Show the user a clear, optional next action.

4. Screen-by-screen requirements
   A. Home — No account yet
   Placement: Within the primary scroll area, high enough to be discoverable on a typical phone. Respect safe areas and existing hierarchy. Do not cover navigation or essential content.

Recommended copy

Eyebrow (optional): GETTING STARTED
Title: Start tracking your money
Supporting line: First, create an account for your cash, bank, or wallet.
Progress label: 0 of 2 steps completed
Current step: 1. Create your first account
Upcoming step: 2. Record your first transaction
Primary button: Create account
The second step must be visually identified as upcoming, not an unexplained disabled control. If the user taps it, offer a short explanation or route them to account creation; do not lead to a dead end.

B. Accounts — No account yet
Use a focused empty state instead of replicating the entire Home checklist:

Title: No accounts yet
Supporting line: Create an account to organize your money and record transactions.
Primary button: Create account
Optional visual: a simple, nonessential illustration consistent with the product's visual system.
Keep the existing Accounts navigation and app shell intact. If other actions exist, maintain a clear visual hierarchy with Create account as the primary next step.

C. Account successfully created, no transaction yet
On Home, update the checklist from real saved data:

Progress label: 1 of 2 steps completed
Step 1: Create your first account — complete.
Step 2: Record your first transaction — current.
Title: Your account is ready
Supporting line: Add an expense or income to see your activity here.
Primary button: Add transaction
The Accounts page should now show the real account list, not the empty state. Do not overwrite normal account-management controls with onboarding UI.

D. First transaction successfully created
Mark step 2 complete only when a valid transaction is successfully persisted.
Remove or gracefully collapse the Getting Started card; do not show it repeatedly.
Show the transaction in the appropriate list and update Home summaries from actual data.
Optional lightweight confirmation: First transaction added.
Avoid a celebratory full-screen interstitial that slows the user's next task.

5. Component specifications
   GettingStartedCard
   Two ordered steps maximum for this flow; avoid expanding the checklist just to expose unrelated features.
   One primary button representing the currently actionable step.
   Clear status for each step: completed, current, or upcoming.
   Textual progress (0 of 2 or 1 of 2); do not rely on color or an icon alone.
   Optional Not now dismissal on Home if the card interferes with exploration. Persist dismissal per user. Crucial actions must remain accessible in normal navigation and Accounts empty states.
   If the checklist is dismissible, do not automatically reshow it every launch or on every tab switch; use a deliberate re-entry point or meaningful lifecycle event.
   AccountsEmptyState
   Concise heading, value-oriented description, one primary CTA.
   No false success metrics, sample financial balances presented as real, or gratuitous empty cards.
   Helpful even if the Home checklist was dismissed.
   Transition and success feedback
   Use the app's existing navigation, forms, feedback components, and design tokens.
   Preserve Back navigation and unsaved work behavior.
   After an account is saved, offer Add first transaction as the next action, and an option to return to Home/Accounts.
   Prefill the newly created account in transaction entry where safe, visible, and user-editable.
   Only offer transaction types supported by the user's account setup; for example, a transfer may require two accounts.
6. State model and rules
   Derive progression from persisted product records, not solely a local checklist toggle.

const hasAccount = activeAccounts.length > 0;
const hasFirstTransaction = eligibleSavedTransactions.length > 0;

const activationStep = !hasAccount
? 'create-account'
: !hasFirstTransaction
? 'create-transaction'
: 'complete';
This is conceptual pseudocode; adapt it to the app's real entities, offline model, sync logic, and eligibility rules. Do not assume an imported transaction, a pending request, a deleted record, or a placeholder qualifies for completion without product validation.

Condition Home guidance Accounts page Primary next action
No account, no transaction Two-step card, 0/2 Empty state Create account
Account exists, no transaction Two-step card, 1/2 Account list Add transaction
Account and first valid transaction exist Normal Home, checklist retired Account list Normal product actions
Checklist dismissed, no account Hide Home card according to preference Empty state remains Create account in Accounts
Save pending or failed Do not advance progress Preserve accurate existing state Retry or fix form
State precedence: Source-of-truth records override a stale local progress value. Separate guidanceDismissed from business state. Support restoring progress after app relaunch, sign-in on another device, or navigating between tabs.

If existing records already satisfy the steps, skip completed guidance; do not treat a returning user as a beginner simply because they have just finished a new onboarding screen.

7. Mobile design rules
   Design for narrow phones first (including roughly 320–430 pt/dp content widths); allow fluid layouts and larger text.
   Use platform-appropriate minimum interactive targets: 44×44 pt on iOS and 48×48 dp on Android where feasible.
   Keep the main CTA visible and reachable without awkward thumb stretching, but avoid floating controls that collide with bottom navigation, keyboard, or system gestures.
   Respect native safe areas, keyboard insets, screen readers, focus order, and dynamic text sizing.
   Meet WCAG AA contrast guidance where applicable: 4.5:1 for regular text, 3:1 for large text and essential non-text UI.
   Pair icons/checkmarks with text states for color-vision accessibility.
   Avoid animation-dependent instructions. Honor reduced-motion preferences.
   Support VoiceOver/TalkBack announcements such as Step 1 of 2, Create your first account, current step.
   Use the product's existing typography, spacing, colors, button styles, and localization conventions; do not introduce a new visual language unnecessarily.
8. UX writing principles
   Use action labels: Create account, Add transaction.
   Explain the why in one short sentence; do not explain every app feature.
   Call steps upcoming, not locked, unless the product truly has an authorization or eligibility lock.
   Do not say the user has finished until the underlying data confirms completion.
   Avoid wording that confuses a finance account with signing up. If confusion is likely, use Add cash or bank account or the domain's established terminology.
   Keep the current step obvious, and avoid competing CTAs such as Learn more, Explore, and Get started all styled as primary.
9. Failure modes and edge cases
   Check all of the following before shipping:

The account creation form is abandoned, cancelled, or fails validation.
A transaction is drafted but not saved, or fails a network request.
The app is reopened mid-onboarding, including offline or partially synced states.
An account already exists from import, migration, or another device.
A user deletes, archives, or deactivates their only eligible account.
A first transaction is deleted or reversed after creation; decide whether the checklist should stay retired based on product policy, and avoid repetitive onboarding loops.
Creating a transaction requires a selected account, supported transaction type, and any necessary permissions.
A user dismisses Home guidance but later visits Accounts.
System text size, dark mode, translation, and small screens produce wrapping or clipping.
Never show transaction creation as the primary next action when the user's actual prerequisite is not satisfied.

10. Research and measurement
    Before implementation, verify whether this sequence is mandatory or only a recommended workflow. If the app supports alternative value paths (such as importing accounts or exploring read-only content), the guidance must not incorrectly block them.

Recommended metrics:

Primary: percentage of eligible new users who successfully create an account and save a first transaction.
Funnel: Home checklist viewed → Create account clicked → Account created → Add transaction clicked → Transaction saved.
Usability: time and taps to first valid transaction, task success in moderated tests, failed attempts, and confusion about the word account.
Guardrails: checklist dismissal, premature exits, accidental account creation, and support requests.
If experimenting, compare contextual guidance with the existing experience; do not claim the checklist improves activation until measured.

11. Implementation workflow for an AI coding/design agent
    When invoked on a codebase:

Inspect first: Identify Home, Accounts, account-create, transaction-create, routing, design system, analytics, accessibility patterns, data source-of-truth, and existing onboarding logic.
Summarize the current experience: Describe where users land, whether the screens are empty, and what blocks first transaction creation. State any assumptions.
Propose screen-level changes: Show the two-step flow, compact checklist placement, Accounts empty-state design, CTA destinations, and state matrix. Favor minimal change to established UI.
Implement in small pieces: Prefer a reusable GettingStartedCard, an AccountsEmptyState, a derived activation selector, and integration with existing success handlers. Do not duplicate account or transaction business logic.
Test state transitions: Cover the cases in Section 9 and the acceptance criteria below, including persistence and screen-reader labels.
Report outcomes: State edited files, final UX copy, behavior by user state, tests run, and unresolved product assumptions. Never claim testing you did not perform.
Do not fabricate endpoints, data, analytics events, screens, or platform components. Adapt the specifics to the actual repository/framework.

12. Acceptance criteria
    A new user with zero eligible accounts sees one obvious primary action on Home: Create account.
    The Accounts screen has a meaningful zero-account empty state with the same CTA destination.
    A successfully created account completes step 1 without manual checklist ticking.
    The next Home CTA changes to Add transaction only when eligible.
    The first successfully saved eligible transaction completes step 2.
    Completed users do not see first-run guidance on every launch.
    Cancelled and failed saves never advance progress.
    Home, Accounts, and success states agree after refresh/relaunch.
    Users can navigate normally, go back, and access essential features without forced modals.
    Touch targets, contrast, larger text, screen-reader labels, and safe-area layout are verified on mobile.
13. Do not do
    Do not automatically show a multi-screen tutorial, blocking modal, or repeated coach-mark overlay after onboarding.
    Do not present transactions as available when the setup prerequisite is unmet.
    Do not use a three-to-six-step checklist for a journey whose actual activation path has two steps.
    Do not tie completed progress only to local UI state or button presses.
    Do not duplicate full onboarding instructions on both Home and Accounts.
    Do not change unrelated flows, terminology, or design-system primitives without a clear need.
14. Output contract
    For a design or implementation request using this skill, deliver:

Brief UX diagnosis and recommendation.
Home / Accounts / post-account / completed screen behavior.
User flow and state matrix.
Exact concise mobile microcopy and primary CTA labels.
Minimal component or wireframe specification.
Implementation plan and accessibility/edge-case QA checklist.
If code was requested and a repository is available: actual changes and tested results.
Principle: Guide users toward their first meaningful action inside the interface they already use, then get out of their way.
