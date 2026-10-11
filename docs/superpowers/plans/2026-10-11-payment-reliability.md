# Payment Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Toss payment confirmation, report startup, cancellation, and retry state recoverable and idempotent.

**Architecture:** Add conditional state transitions to the SQLite payment ledger, reconcile uncertain confirmation through Toss order lookup, and recover approved payments that lack a linked job. Preserve the existing customer checkout and provider-facing contract.

**Tech Stack:** Node.js 24, Express, better-sqlite3, Toss Payments REST API, `node:test`.

**Spec:** [2026-10-11-service-audit-remediation-design.md](../specs/2026-10-11-service-audit-remediation-design.md)

## Global Constraints

- Do not change products, prices, the payment widget, Terms/refund copy, business footer, Toss MID/keys, or success/fail URLs while two card brands are reviewing the service.
- Keep the existing Toss confirmation request parameters and response shape used by `public/pay.html` and `public/pay-success.html`.
- Do not deploy or contact Toss/card issuers from this worktree.
- Never credit an unverified payment or start the same paid product twice.
- Keep pending and failed cancellation cases visible to the administrator; never record cancellation as complete before Toss confirms it.
- Keep tests hermetic: use a temporary SQLite database and stub `fetch`; never use live payment credentials.

## Review Focus

- Toss approved the payment but the confirm HTTP response was lost: matching `orderId`, `amount`, and `paymentKey` in a `DONE` lookup must lead to one paid ledger entry.
- A lookup has a wrong order, amount, key, or non-`DONE` status: do not credit or start the product; keep the order in a retryable reconciliation state.
- Two confirm requests arrive concurrently or are retried after a process restart: one credit transaction and one job start only.
- A process stops after creating an order but before linking `job_id`: recover the existing active order rather than starting a second one.
- Toss cancellation fails or its response is lost: persist an actionable manual-review status and use one stable idempotency key for retries.

---

### Task 1: Recoverable and idempotent card payments

**Files:**
- Modify: `src/db/index.js`
- Modify: `src/db/cardPayments.js`
- Modify: `src/server/routes/pay.js`
- Modify: `src/server/tossPayments.js`
- Modify: `src/server/refundPurchase.js`
- Modify: `src/server/routes/admin.js`
- Modify: `src/jobs/recoverPendingOrders.js`
- Modify: `public/admin-payments.html`
- Modify: `public/pay-success.html`
- Test: `test/payment-reliability.test.js`
- Test: `test/refund-purchase.test.js`

**Interfaces:**
- Consumes: the existing `cardPayments` ledger, `orders.findPendingByUserAndProduct`, `resolveProduct`, and Toss `confirmPayment`/`cancelPayment` behavior.
- Produces: conditional payment-claim and completion functions in `src/db/cardPayments.js`; a Toss order-lookup function that returns `{ ok, status, data }`; and startup recovery for paid rows without a job link.

- [ ] **Step 1: Write failing tests** for these named behaviors in `test/payment-reliability.test.js`: `payment confirmation reconciles a lost response only when Toss fields match`, `mismatched Toss lookup stays uncredited and retryable`, `concurrent confirmation credits and starts once`, `paid payment without job link reconnects to existing active order`, `uncertain confirmation shows a retry path without calling the payment successful`, and `ready payment form expires after thirty minutes and linked jobs clear form and attribution`. Extend `test/refund-purchase.test.js` with `failed cancellation remains cancel_failed and a retry reuses its idempotency key` and `administrator can retry only after checking provider cancellation state`.

- [ ] **Step 2: Run the focused tests and verify they fail** against current unconditional transitions and missing lookup/recovery behavior.

- [ ] **Step 3: Implement ledger state transitions and reconciliation.** Add an in-progress confirmation state and conditional SQLite updates so only one request can claim a ready row. On a lost/ambiguous confirmation response, look up the Toss payment by encoded `orderId`; accept only `DONE` with matching `orderId`, `amount`, and supplied `paymentKey`. Otherwise retain a retryable state and do not grant points. Record paid state and the one point-ledger credit in one SQLite transaction guarded by the prior state.

- [ ] **Step 4: Implement job recovery, cancellation, and customer feedback.** Before starting a paid row, reconnect a matching active order if it already exists; otherwise claim the one-time start and persist its job link. On server startup reconcile interrupted confirmations and paid rows with no job link. Record `canceling` before calling Toss, send a deterministic idempotency key derived from the payment row, and finish as `canceled` or `cancel_failed` only from the provider result. Add an authenticated administrator retry action that first checks Toss's current status, then reuses the same idempotency key if cancellation remains necessary; keep failed cases visible for manual handling. An unresolved payment response must tell the customer that confirmation is still in progress and offer a retry of the same order; it must never say the payment succeeded or failed until verified.

- [ ] **Step 5: Expire temporary payment input.** Add a bounded cleanup function for `ready` rows older than thirty minutes. Once the job link is stored, clear `form_json` and `attribution`; preserve the form only while it is required to complete recovery.

- [ ] **Step 6: Run focused and existing payment tests.** Run `node --test test/payment-reliability.test.js test/refund-purchase.test.js test/test-payment-limit.test.js test/consent.test.js`. Expected: all pass without live network access.

- [ ] **Step 7: Commit** the payment reliability change with its tests.
