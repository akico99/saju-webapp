# Browser Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop private URL values from reaching analytics and make administrator data render strictly as text.

**Architecture:** Remove analytics from password-reset pages and strip payment credentials from the browser URL before analytics initializes. Build administrator rows using DOM nodes and validated attributes, and tighten signup email validation at the server boundary.

**Tech Stack:** Static HTML/JavaScript, Express, Node.js `node:test`.

**Spec:** [2026-10-11-service-audit-remediation-design.md](../specs/2026-10-11-service-audit-remediation-design.md)

## Global Constraints

- Do not change products, prices, the payment widget, Terms/refund copy, business footer, Toss MID/keys, or success/fail URLs while two card brands are reviewing the service.
- Do not change `public/track.js` behavior.
- The existing payment confirmation request must continue sending the same `paymentKey`, `orderId`, and `amount` values.
- Do not deploy or contact Toss/card issuers from this worktree.
- Treat database, OAuth provider, query-string, and API response values as untrusted text.

## Review Focus

- Password-reset tokens and payment credentials are present in initial query strings: none may be sent in a request referrer, analytics event, or third-party pixel.
- A URL has extra query parameters, fragments, percent-encoding, or an invalid payment amount: preserve only required in-memory confirmation values, remove the full query before analytics, and reject invalid confirmation as before.
- Administrator data contains `<img onerror>`, quotes, ampersands, or a crafted status: it must appear only as text and must not alter markup, attributes, or classes.
- An OAuth name or email has non-ASCII characters or is excessively long: valid UTF-8 names remain readable; email length and format are bounded before persistence.
- A page contains an unexpected payment state: render a safe fallback label/class instead of interpolating it into HTML or a CSS class.

---

### Task 1: Sensitive URL handling and safe administrator rendering

**Files:**
- Modify: `public/reset-password.html`
- Modify: `public/pay-success.html`
- Modify: `public/admin-users.html`
- Modify: `public/admin-orders.html`
- Modify: `src/server/routes/auth.js`
- Test: `test/browser-security.test.js`
- Test: `test/consent.test.js` or a focused auth validation test

**Interfaces:**
- Consumes: current payment success query names `paymentKey`, `orderId`, and `amount`, existing administrator API response shapes, and the current signup flow.
- Produces: unchanged payment confirmation payload and existing visible page behavior, with query removal before analytics and no untrusted HTML interpolation.

- [ ] **Step 1: Write failing tests** in `test/browser-security.test.js`: `reset password page loads no analytics or advertising scripts and has a no-referrer policy`, `pay success copies required parameters and removes query before loading analytics`, `admin users and orders do not interpolate API values into HTML`, and `signup rejects overlong or malformed email but accepts valid internationalized names`. Use representative injection strings such as `<img src=x onerror=alert(1)>` and quotes in status/provider fields.

- [ ] **Step 2: Run the focused tests and verify they fail** on current script order, raw templates, and permissive email validation.

- [ ] **Step 3: Fix the reset and payment success pages.** Add a `no-referrer` policy before any network resource on both pages. Remove analytics/advertising scripts from `reset-password.html`. In `pay-success.html`, copy the three required values into a closure-local object in the first inline script, immediately call `history.replaceState` with the same pathname and hash but no query, then load existing analytics scripts and use only the saved values for confirmation. Keep the current API path and JSON keys unchanged.

- [ ] **Step 4: Render admin tables with safe DOM APIs.** Replace data-bearing `innerHTML` templates with `createElement`, `textContent`, and `setAttribute` for known-safe values. Select status text and CSS classes from explicit allowlists; unknown values use a neutral fallback. Preserve sorting, pagination, and action controls.

- [ ] **Step 5: Validate signup email.** Trim email input, reject values longer than 254 characters, and apply the existing practical email format check to the normalized value before lookup and persistence. Keep OAuth display names as text at every rendering site.

- [ ] **Step 6: Run focused tests.** Run `node --test test/browser-security.test.js test/consent.test.js test/ui-pages.test.js`. Expected: all pass and the page contract still retains the existing payment URL and payload.

- [ ] **Step 7: Commit** the browser security change with its tests.
