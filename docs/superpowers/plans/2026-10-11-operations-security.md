# Operations Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Protect backups and make insecure or incomplete production configuration fail visibly before serving requests.

**Architecture:** Encrypt compressed SQLite backups using AES-256-GCM and a separately managed key. Validate production secrets and writable persistent output storage at startup, add account/IP request limits, make the test command run only deterministic tests, and update vulnerable dependencies only when the supported runtime and browser/PDF workflow pass.

**Tech Stack:** Node.js 24, Express, SQLite, Node `crypto`, npm, `node:test`.

**Spec:** [2026-10-11-service-audit-remediation-design.md](../specs/2026-10-11-service-audit-remediation-design.md)

## Global Constraints

- Do not change products, prices, the payment widget, Terms/refund copy, business footer, Toss MID/keys, or success/fail URLs while two card brands are reviewing the service.
- Do not deploy or change any production dashboard secret, persistent disk, or email configuration from this worktree.
- Never email or otherwise fall back to a plaintext database backup.
- Production must not start with the development session secret, a missing/short `SESSION_SECRET`, or absent/unwritable `OUTPUT_DIR`. A missing backup key must fail the backup operation before email is sent.
- Do not force a major dependency upgrade until startup, tests, PDF generation, and image processing are verified against the declared Node runtime.

## Review Focus

- Backup key is absent, malformed, or not 32 bytes: fail closed before sending any email or attachment.
- Backup creation or email send fails: remove database snapshot and encrypted temporary files in `finally`; do not report success.
- Production secret or output path is missing or unwritable: fail at startup with the setting name and no secret value in logs; local development still starts with local defaults.
- Requests share a proxy IP or rotate accounts: payment preparation and verification resend limits must independently cap both the user and the source IP.
- Dependency updates change Puppeteer/Chrome APIs or native package ABI: run the explicit deterministic unit suite and PDF/image smoke checks on the declared Node runtime before accepting the lockfile.

---

### Task 1: Secure backups and fail-fast production configuration

**Files:**
- Modify: `src/jobs/backupDb.js`
- Modify: `src/server/app.js`
- Modify: `src/config/outputDir.js`
- Modify: `src/server/middleware/rateLimit.js`
- Modify: `src/server/routes/pay.js`
- Modify: `src/server/routes/auth.js`
- Modify: `server.js`
- Modify: `package.json` and `package-lock.json` only for tested dependency/runtime updates
- Create: `src/config/validateRuntimeConfig.js` if a separate validator is useful
- Create: `docs/security-operations.md`
- Test: `test/operations-security.test.js`
- Test: `test/rate-limit.test.js`

**Interfaces:**
- Consumes: `OUTPUT_ROOT`, current session/auth middleware, email sender, SQLite online backup, and current rate limiter.
- Produces: encrypted attachment metadata sufficient for authorized restore, production configuration validation, explicit account/IP limits, and a deterministic `npm test` command covering `*.test.js` files only.

- [ ] **Step 1: Write failing tests** in `test/operations-security.test.js`: `backup is encrypted and decryptable with the configured key`, `missing or malformed backup key prevents email and deletes temporary files`, `email failure also removes temporary files`, `production refuses insecure session secret and missing or unwritable OUTPUT_DIR`, and `development defaults remain available`. In `test/rate-limit.test.js`, add `payment preparation is bounded by both user and IP` and `verification resend is bounded by both user and IP`.

- [ ] **Step 2: Run the focused tests and verify they fail** on plaintext email attachments, fallback production session secret, and missing endpoint limits.

- [ ] **Step 3: Encrypt the backup.** Gzip the online SQLite snapshot, encrypt with AES-256-GCM using a validated 32-byte hex or base64 `BACKUP_ENCRYPTION_KEY`, and email only a versioned envelope containing IV, auth tag, and ciphertext. Put every temporary file cleanup in `finally`. Export a small decrypt/format helper for tests and document key generation, storage, restoration, and rotation in `docs/security-operations.md`.

- [ ] **Step 4: Validate production startup.** In production require a non-default `SESSION_SECRET` of at least 32 random bytes and an explicit writable `OUTPUT_DIR`. Keep local defaults for non-production. Validate before accepting traffic, log only the missing setting name, and do not print secret contents. Do not assert that a filesystem path is a persistent volume; document that operators must verify persistence across redeploys.

- [ ] **Step 5: Add request limits.** Extend the in-memory limiter so `/pay/prepare` and `/auth/resend-verification` enforce separate user and IP buckets. Return HTTP 429 with `Retry-After`; keep existing route parameters and payment page flow unchanged.

- [ ] **Step 6: Make default tests deterministic and address dependency audit.** Set the package test command to `node --test --test-concurrency=1 "test/**/*.test.js"`, excluding `manual-*.js`; this avoids both manual scripts and a reproduced Node test-runner IPC failure under parallel file execution. Run safe lockfile audit fixes first; upgrade Puppeteer only to a supported release after Node 24, browser installation, PDF generation, and image processing smoke checks pass. Set the package runtime to Node 24.x and keep CI/deployment guidance aligned. Do not use `npm audit fix --force` without proving those checks.

- [ ] **Step 7: Run focused and full verification.** Run `node --test test/operations-security.test.js test/rate-limit.test.js`, then `npm test`, `npm audit --omit=dev`, `node test/manual-visual-samples.js` (Puppeteer/PDF smoke), and `node --test test/webtoon.test.js` (Sharp image metadata smoke). Expected: deterministic tests and render/image checks pass; audit has no Critical/High production findings, and any remaining advisory is explicitly documented with its dependency path and fix availability.

- [ ] **Step 8: Commit** the operations security and tested dependency changes.
