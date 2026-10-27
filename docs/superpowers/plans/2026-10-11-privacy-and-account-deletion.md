# Privacy and Account Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a verified user delete service data and generated results while retaining only legally required, time-limited transaction facts.

**Architecture:** Require password re-entry for local accounts and a one-time verified-email confirmation for social accounts. Refuse deletion while a payment, refund, or report job is active; then atomically move minimal payment facts to an identity-free retention table, delete account-linked records, and remove generated files. Update public privacy copy in a separately deployable commit for use after the two pending card reviews.

**Tech Stack:** Node.js, Express, SQLite, filesystem cleanup under `OUTPUT_ROOT`, HTML, `node:test`.

**Spec:** [2026-10-11-service-audit-remediation-design.md](../specs/2026-10-11-service-audit-remediation-design.md)

**Current legal references:** [Personal Information Protection Act, Article 21](https://law.go.kr/LSW/lsSideInfoP.do?docCls=jo&joBrNo=00&joNo=0021&lsiSeq=283839&urlMode=lsScJoRltInfoR) requires destruction when data is no longer needed, except legally retained data, which must be stored separately. [E-Commerce Act Enforcement Decree, Article 6](https://www.law.go.kr/LSW/lsLawLinkInfo.do?chrClsCd=010202&lsJoLnkSeq=900619372) currently sets 5 years for contract/payment/supply records and 3 years for consumer complaint/dispute records. Apply only the categories that actually exist in this service; do not preserve unrelated personal data by default.

## Global Constraints

- Do not change products, prices, the payment widget, Terms/refund copy, business footer, Toss MID/keys, or success/fail URLs while two card brands are reviewing the service.
- Do not publish the privacy-policy or account-deletion UI before both card-brand approvals; keep this plan's privacy commit separable from the review-safe changes.
- Do not delete records needed for a pending payment, refund, or active report job; explain the blocking order and allow a later retry.
- Retain only the minimum identity-free transaction facts required by law, with an explicit retention deadline and automatic expiration.
- Never log deletion tokens, passwords, email addresses, report input, or report contents.

## Review Focus

- Unauthenticated requests, wrong local password, expired/reused email confirmation code, or an unverified social email: account data must remain untouched.
- A pending/generating report or any unresolved `ready`, `confirming`, `reconcile_pending`, `refunding`, `canceling`, or `cancel_failed` payment blocks deletion. A `paid` payment is eligible only when its linked report is terminal and its job link exists.
- A deleted account's result files, report text/visuals, saved profiles, form inputs, attribution, sessions, reset/verification/deletion tokens, and OAuth provider ID must be removed.
- Retained transaction records must have no user ID, email, name, birth data, form, result, or raw payment key; records past their deadline must be deleted.
- Filesystem paths from stored records must not permit deletion outside `OUTPUT_ROOT`, including `..` paths and symlinks.

---

### Task 1: Verified account deletion, data purge, and privacy disclosure

**Files:**
- Modify: `src/db/index.js`
- Modify: `src/db/users.js`
- Create or modify: `src/db/accountDeletion.js`
- Modify: `src/server/routes/auth.js`
- Modify: `src/server/app.js` or route registration as needed
- Modify: `public/mypage.html`
- Modify: `public/privacy.html`
- Modify: `server.js` or a retention job so expired retained rows are purged
- Test: `test/account-deletion.test.js`
- Test: `test/privacy-retention.test.js`

**Interfaces:**
- Consumes: existing account/session, card payment, order, saved profile, consent, email token, and `OUTPUT_ROOT` modules.
- Produces: authenticated delete request/confirm routes; a transaction-safe deletion function; an identity-free `retained_transactions` table with `retention_until`; and scheduled/startup expiry cleanup.

- [ ] **Step 1: Write failing tests** in `test/account-deletion.test.js`: `local account deletion requires the current password`, `social account deletion requires an unexpired one-time verified-email token`, `active orders or unresolved payments block deletion without partial changes`, `successful deletion removes all account-linked data and report files`, and `retained payment facts contain no direct account or report data`. In `test/privacy-retention.test.js`, add `retained transactions expire at their configured legal deadline` and `stored paths cannot escape OUTPUT_ROOT`.

- [ ] **Step 2: Run the focused tests and verify they fail** because deletion/retention endpoints and tables do not exist.

- [ ] **Step 3: Implement identity verification and blocking rules.** Local accounts must re-enter their password. Social accounts with a verified email receive a cryptographically random, hashed, one-time confirmation code with a short expiry; the user enters it in mypage rather than placing it in a URL. Require an authenticated session for both steps. Before mutation, reject any active report order or unresolved payment/refund state; return a stable error code and the blocking order/payment status.

- [ ] **Step 4: Implement transactional purge and minimal retention.** Add a retention table with no `user_id` or other account identifier; retain only order reference, product key, amount, payment/refund state, timestamps, and a digest/reference needed for later transaction lookup. Set contract/payment retention to five years from transaction time and complaint/dispute retention to three years where applicable; re-check the official current statutory periods before coding. Within one SQLite transaction copy retained facts, delete account-linked rows/sessions/tokens/profiles/orders/point records, and delete the user. Remove generated files only after proving each resolved path is a descendant of `OUTPUT_ROOT`; reject symlink or traversal escapes. Run an expiry cleanup at startup and on the existing maintenance cadence.

- [ ] **Step 5: Add a pending-review UI and update privacy disclosure.** Add an explicit deletion request/confirmation flow in mypage. Make error and success messages clear, including how to retry after an active order finishes. Correct the policy's statements about form and report storage, account deletion, retention periods, and all actual processors including email delivery. Keep the policy/UI changes in their own commit so operators can wait until both card reviews finish.

- [ ] **Step 6: Run focused tests.** Run `node --test test/account-deletion.test.js test/privacy-retention.test.js test/consent.test.js`. Expected: all pass using temporary databases and temporary output directories.

- [ ] **Step 7: Commit** the privacy/account-deletion change separately from review-safe changes.
