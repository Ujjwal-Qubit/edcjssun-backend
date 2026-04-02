# EDC Backend — Gap Analysis & Execution Plan

> **Source Documents:** DEV1_Backend_PRD_SRS_Part1-3  
> **Current Codebase Snapshot:** `e:\Newfolder\Project2O\Projects\edcjssun-backend\src\`  
> **Date:** April 2026

---

## 1. SYSTEM UNDERSTANDING (SHORT)

- **Config-driven event management platform** with RESTful JSON API (Node.js + Express + Prisma + PostgreSQL)
- **Four user roles:** PARTICIPANT, JUDGE, EVENT_ADMIN, SUPER_ADMIN
- **Dual registration model:** Solo (new `Registration` table) + Team (existing `Team` + `TeamMember`)
- **Three consumer apps:** Participant portal (`events.edcjssun.com`), Admin portal, standalone Auction module
- **Multi-round submission system** with per-round file/link/form submission types and Cloudinary file hosting
- **Judging system:** Multi-criteria weighted scoring with optional normalization, dedicated judge portal + role
- **QR-based check-in** with walk-in support, manual override, and attendance export
- **Email system:** 13 templated email types via Resend, automated triggers + admin-initiated, full audit log
- **Auction module:** Standalone auth, point-based bidding for problem statements
- **Key modules:** Auth, Events, Registration, Participant Dashboard, Submissions, Admin CRUD, Judging, Check-In, Communications, Auction

---

## 2. COMPLETENESS ANALYSIS

| Area | Defined? | Gaps | Risk |
|---|---|---|---|
| **Auth system** | Yes | Implementation deviates from PRD: cookie config wrong (`sameSite: lax` vs `None`), no `domain` set, no `isVerified` check on login, bcrypt rounds 10 vs 12, `verifyOtp` doesn't return `resetToken`, `resetPassword` uses OTP re-check instead of resetToken, `setupPassword` doesn't auto-login, JWT payload uses `id` not `userId` | **High** |
| **Event system** | Yes | PRD defines `registrationMode`, `participationMode`, `mode`, `requiresCheckIn`, `hasJudging`, `hasTracks`, `maxParticipants` — **none exist in current schema**. `getAllEvents` has no pagination, no filters, no sort. `getEventBySlug` leaks internal settings to public | **High** |
| **Registration (solo)** | Partial | `Registration` model **doesn't exist** in current schema. PRD mandates solo registration support — zero implementation exists. No `SOLO_ONLY` or `BOTH` mode handling | **High** |
| **Registration (team)** | Yes | Implemented but incomplete: no `trackId`, no `qrCode` generation, no `registrationMode` checks (OPEN_ACCESS/APPLICATION_REVIEW status mapping), `hearAboutUs` not saved, no check for user already registered solo for same event, `maxTeams` field doesn't match PRD's `maxParticipants` | **High** |
| **Submission system** | Partial | Implemented as simple create (no upsert), no Cloudinary integration (accepts pre-uploaded URLs), no round-level validation (submissionType, acceptedFileTypes, maxFileSize), checks v1 `pptSubmissionOpen` instead of v2 `submissionsOpen`, no `registrationId`-based submissions for solo | **High** |
| **Judging system** | No | Zero implementation. Models (`JudgeAssignment`, `JudgingCriteria`, `JudgeScore`) not in schema. No controller, routes, or service. `JUDGE` role not in enum | **High** |
| **Check-in system** | No | Zero implementation. No QR generation, no scan endpoint, no check-in dashboard, no export | **High** |
| **Email system** | Partial | Only 3 of 13 templates exist (OTP, Registration Confirmed, Setup Password). No SHORTLISTED/REJECTED/WAITLISTED/SUBMISSION_RECEIVED/REMINDER/RESULTS/JUDGE_INVITATION emails. No batch send. `EmailLog.body` and `EmailLog.error` fields missing from schema | **Med** |
| **File upload system** | No | Zero implementation. No `multer` installed, no Cloudinary SDK installed, no `upload.service.js`. Submissions accept raw URLs from client — no server-side upload or validation | **High** |
| **Admin APIs** | No | **Zero admin routes, controllers, or endpoints exist.** This is approximately 40% of the entire API surface (stats, event CRUD, registration management, bulk operations, exports, settings, communications, submissions management) | **Critical** |
| **Participant APIs** | Partial | 4 endpoints exist but: no slug-based routing (PRD uses `:slug`), no solo registration support, `getMyRegistration` finds any team not specific event, `submitParticipantFile` doesn't use roundId, `updateMyRegistration` allows rollNo/email changes (PRD forbids) | **High** |
| **Database schema** | Partial | Current schema is **v1**. Missing: `Registration` model, `Track` model, `JudgeAssignment`, `JudgingCriteria`, `JudgeScore`, `JUDGE` role. `Event` missing 8+ v2 fields. `Round` missing 6 v2 fields. `Submission` missing `registrationId`, `formData`, `trackId`, `reviewedBy`, `track` label. `EventSettings` is completely v1 shape. `TeamStatus` should be `RegistrationStatus` | **Critical** |
| **Edge cases** | Partial | Documented extensively in PRD but barely enforced: no cross-table duplicate check (solo+team for same event), no MIME type validation, no status transition validation, no race condition handling beyond retry loop | **High** |
| **Non-functional requirements** | Partial | Rate limiting exists on auth + registration but not general 200/min. No morgan logging. No health check beyond `GET /`. `express-rate-limit` installed but only used on 3 routes | **Med** |
| **Deployment & infra** | Partial | Railway/Supabase mentioned. `.env` exists. No Dockerfile, no backup scripts, no CI/CD, no migration workflow documented | **Med** |

---

## 3. MISSING / UNCLEAR THINGS

### Missing Endpoints (vs PRD)

| PRD Endpoint | Status |
|---|---|
| `GET /api/admin/stats` | ❌ Missing |
| `GET /api/admin/events` | ❌ Missing |
| `POST /api/admin/events` | ❌ Missing |
| `GET /api/admin/events/:slug` | ❌ Missing |
| `PATCH /api/admin/events/:slug` | ❌ Missing |
| `PATCH /api/admin/events/:slug/settings` | ❌ Missing |
| `GET /api/admin/events/:slug/registrations` | ❌ Missing |
| `GET /api/admin/events/:slug/registrations/:id` | ❌ Missing |
| `PATCH /api/admin/events/:slug/registrations/:id` | ❌ Missing |
| `POST /api/admin/events/:slug/registrations/bulk` | ❌ Missing |
| `GET /api/admin/events/:slug/registrations/export` | ❌ Missing |
| `POST /api/admin/events/:slug/registrations/checkin/:id` | ❌ Missing |
| `GET /api/admin/events/:slug/submissions` | ❌ Missing |
| `PATCH /api/admin/events/:slug/submissions/:id` | ❌ Missing |
| `GET /api/admin/events/:slug/submissions/export` | ❌ Missing |
| `GET /api/admin/events/:slug/judges` | ❌ Missing |
| `POST /api/admin/events/:slug/judges` | ❌ Missing |
| `DELETE /api/admin/events/:slug/judges/:judgeId` | ❌ Missing |
| `GET /api/admin/events/:slug/scores` | ❌ Missing |
| `POST /api/admin/events/:slug/results/publish` | ❌ Missing |
| `GET /api/admin/events/:slug/checkin` | ❌ Missing |
| `POST /api/admin/events/:slug/checkin/scan` | ❌ Missing |
| `GET /api/admin/events/:slug/checkin/export` | ❌ Missing |
| `GET /api/admin/events/:slug/emails` | ❌ Missing |
| `POST /api/admin/events/:slug/emails/send` | ❌ Missing |
| `GET /api/admin/events/:slug/emails/templates` | ❌ Missing |
| `GET /api/judging/:slug/submissions` | ❌ Missing |
| `POST /api/judging/:slug/scores` | ❌ Missing |
| `PATCH /api/judging/:slug/scores/:id` | ❌ Missing |
| `GET /api/judging/:slug/progress` | ❌ Missing |
| `GET /api/auction/:slug/init` | ❌ Missing |
| `GET /api/auction/:slug/leaderboard` | ❌ Missing |
| `POST /api/auction/:slug/bid` | ❌ Missing |
| `POST /api/auction/:slug/adjust` | ❌ Missing |
| `POST /api/auction/:slug/assign` | ❌ Missing |
| `POST /api/auction/:slug/undo` | ❌ Missing |
| `POST /api/auction/:slug/reset` | ❌ Missing |
| `GET /api/auction/:slug/transactions` | ❌ Missing |
| `GET /api/auction/:slug/export` | ❌ Missing |
| Solo registration (`type: "solo"` in `/register`) | ❌ Missing |
| `POST /api/participant/:slug/submit/:roundId` (with `:slug` and `:roundId`) | ❌ Partially exists but wrong route shape |
| Email verification endpoint (`GET /api/auth/verify-email?token=...`) | ⚠️ Undefined — signup says "send verification email" but no verify endpoint exists |

**Total: ~39 endpoints missing out of ~48 total defined in PRD. Only ~9 partially implemented.**

### Missing Validations

1. **`isVerified` check on login** — PRD says `403 NOT_VERIFIED` if email not verified. Current code skips this entirely
2. **Password minimum 8 chars** — No length validation on signup/reset/setup password
3. **`registrationMode` enforcement** — OPEN_ACCESS → SHORTLISTED, APPLICATION_REVIEW → PENDING, INVITE_ONLY → 403. None implemented
4. **Cross-registration check** — User in solo Registration AND TeamMember for same event. Not checked
5. **Status transition validation** — No state machine enforcement (e.g. REJECTED → SHORTLISTED not blocked)
6. **File MIME type validation** — PRD says validate actual bytes, not just extension. Zero implementation
7. **Submission upsert** — PRD says use Prisma `upsert` keyed on teamId/registrationId + roundId. Current code uses `create` (will throw on resubmission)
8. **Team edit restrictions** — Current code allows rollNo/email changes. PRD explicitly forbids this

### Undefined Behaviors

1. **Email verification flow** — Signup says "send verification email" but there is no `GET /api/auth/verify-email` endpoint. How does a user verify?
2. **`INVITE_ONLY` registration** — PRD says "form not shown" but what if someone POSTs directly? No API-level guard defined or implemented
3. **EVENT_ADMIN scoping** — PRD mentions "EVENT_ADMIN sees only assigned events" but there is no `EventAdmin` relation or assignment mechanism in the schema
4. **Scheduled emails** — `scheduledFor` field mentioned in admin email send endpoint. PRD says "initially just send immediately, scheduled = future scope" — ambiguous whether to build or not
5. **Auction auth** — "Separate password-based auth, Header: `X-Auction-Password`" — where is this password stored? Is it per-event? `.env`? No clarity
6. **QR code image generation** — PRD says `qrcode npm` for QR but the `qrCode` field stores a token string. When/where is the actual QR image generated? Client-side from the token?

### Conflicting Logic

1. **JWT payload shape** — PRD says `{ userId, role }`, current code uses `{ id, role }`. Frontend/middleware will break if inconsistent
2. **`requireAuth` loads user from DB** — PRD says middleware should "load user from DB by userId in token". Current code just trusts the decoded JWT payload without DB lookup — stale role data risk
3. **`resetPassword` flow** — PRD says: verify-otp → get resetToken → use resetToken in reset-password. Current code: reset-password re-validates OTP directly (bypasses resetToken step entirely)
4. **`TeamStatus` vs `RegistrationStatus`** — Schema has `TeamStatus` enum but PRD uses `RegistrationStatus` for both solo and team. Also missing `DISQUALIFIED` status
5. **Cookie `sameSite`** — PRD says `None` (cross-subdomain). Current code uses `Lax`. This will break cookie flow between `events.edcjssun.com` and `api.edcjssun.com`
6. **`maxTeams` vs `maxParticipants`** — Schema uses `maxTeams` (default 24). PRD uses `maxParticipants` (includes solo + team count)
7. **Participant route structure** — PRD: `/api/participant/:slug/registration`. Code: `/api/participant/registration` (no slug parameter)
8. **Registration ID format** — PRD: `{PREFIX}-{S|T}-{NNNN}`. Known bug: current code generates random IDs like `FP26-9438`
9. **Duplicate `generateRegistrationId` files** — Two files exist: `generateRegisterationId.js` (typo) and `generateRegistrationId.js`

### Hidden Edge Cases That Will Break

1. **`getMyRegistration` without slug** — Finds ANY team the user is in. If user is in multiple events, returns wrong/random one
2. **No `onDelete: Cascade`** on several relations — Current schema has `Team → Event` without cascade. Deleting events will leave orphan records or throw FK errors
3. **Bcrypt rounds 10 vs 12** — PRD specifies 12 rounds. Code uses 10. Users created with 10 rounds will still work (bcrypt is compatible) but not meeting spec
4. **Missing `year`, `branch`, `rollNo` on `User` model** — Current schema has only `phone` and `institution`. PRD adds `year`, `branch`, `rollNo` to User
5. **`PointTransaction` → `Event` relation exists** in current schema but not in v2 PRD schema (uses `Team` → `PointTransaction` only). Minor but may cause migration issues

---

## 4. WHAT IS LEFT TO BUILD (ACTIONABLE)

### 🔹 Backend Implementation Tasks

#### Schema Migration (v1 → v2) — **BLOCKER for everything else**
- [ ] Add `JUDGE` to `Role` enum
- [ ] Add `Registration` model (solo registrations)
- [ ] Add `Track` model
- [ ] Add `JudgeAssignment`, `JudgingCriteria`, `JudgeScore` models
- [ ] Add v2 fields to `Event`: `registrationMode`, `participationMode`, `mode`, `requiresCheckIn`, `hasJudging`, `hasTracks`, `maxParticipants`
- [ ] Add v2 fields to `Round`: `submissionRequired`, `submissionType`, `submissionDeadline`, `maxFileSize`, `acceptedFileTypes`, `resultsPublished`
- [ ] Add v2 fields to `Submission`: `registrationId`, `trackId`, `formData`, `reviewedBy`, `track` label
- [ ] Rewrite `EventSettings` model to v2 shape (toggles/deadlines/communications/automation)
- [ ] Add `trackId`, `qrCode`, `checkInTime` to `Team`
- [ ] Add `body`, `error` fields to `EmailLog`
- [ ] Add `year`, `branch`, `rollNo` to `User`
- [ ] Rename `TeamStatus` → `RegistrationStatus`, add `DISQUALIFIED`
- [ ] Rename `maxTeams` → `maxParticipants` on `Event`
- [ ] Update `SubmissionType` enum: `FILE`, `LINK`, `FORM`, `MIXED` (replace PPT/PDF/DOCUMENT/IMAGE)
- [ ] Add `WORKSHOP`, `NETWORKING` to `RoundType` enum
- [ ] Add `onDelete: Cascade` to all Event child relations
- [ ] Add `@@index([email])` to `Otp`
- [ ] Remove duplicate `generateRegisterationId.js` file
- [ ] Add `trackId` to `Prize` model

#### Controllers/Routes — NOT YET STARTED
- [ ] `admin.controller.js` — Platform stats, event CRUD
- [ ] `admin.registration.controller.js` — Registration list/detail/status/bulk/export/checkin
- [ ] `admin.submission.controller.js` — Submission list/review/export
- [ ] `admin.judge.controller.js` — Judge CRUD + scores + results publish
- [ ] `admin.checkin.controller.js` — Check-in dashboard/scan/export
- [ ] `admin.email.controller.js` — Email history/send/templates
- [ ] `judging.controller.js` — Judge portal (submissions/scores/progress)
- [ ] `auction.controller.js` — All 9 auction endpoints
- [ ] `admin.routes.js` — Mount all admin routes
- [ ] `judging.routes.js` — Mount judge portal routes
- [ ] `auction.routes.js` — Mount auction routes
- [ ] Update `events.routes.js` — Solo registration support in register endpoint

#### Services — NOT YET STARTED
- [ ] `upload.service.js` — Cloudinary upload/validate/delete
- [ ] `qr.service.js` — QR token generation (UUID + optional image)
- [ ] `scoring.service.js` — Weighted aggregation + z-score normalization
- [ ] Expand `email.service.js` — Add remaining 10 email templates + batch send + template variable replacement

#### Middleware — INCOMPLETE
- [ ] Fix `requireAuth` — Add DB user lookup, fix JWT payload key (`userId` not `id`)
- [ ] Fix `requireShortlisted` — Add solo registration support, slug-based lookup, OPEN_ACCESS handling
- [ ] Add `requireAuctionAuth` — `X-Auction-Password` header validation
- [ ] Add global error handler middleware with error code standardization
- [ ] Add request logging (`morgan`)
- [ ] Add global rate limiting (200/min general)

### 🔹 Logic Gaps

| Gap | Impact |
|---|---|
| No `registrationMode` logic anywhere | OPEN_ACCESS/APPLICATION_REVIEW/INVITE_ONLY have identical behavior — status always defaults to PENDING |
| No `participationMode` enforcement | Solo/Team type not validated against event config |
| No status transition state machine | Admin can set any status from any status — data integrity risk |
| No deadline auto-enforcement | `autoCloseRegistration` and `autoOpenSubmissions` not implemented (needs cron or lazy-check) |
| No submission re-submission (upsert) | Participants can't update their submission — create throws unique constraint error |
| No cross-table registration check | User can register solo AND be in a team for same event |
| Participant routes not scoped to event | All participant endpoints operate on "some team" not "team for specific event" |

### 🔹 Integrations Pending

| Integration | Status | What's Needed |
|---|---|---|
| **Cloudinary** | ❌ Not installed | `npm install cloudinary multer`, create `upload.service.js`, multer middleware config, stream upload logic |
| **Resend (expand)** | ⚠️ Basic only | 10 more email templates, batch send via `resend.batch.send()`, template variable engine, EmailLog write-through |
| **QR system** | ❌ Not installed | `npm install qrcode`, create `qr.service.js`, generate tokens on registration, convert to image for emails |
| **CSV/ZIP exports** | ❌ Not installed | `npm install json2csv archiver`, create export utilities for registrations, check-in, submissions, auction |
| **Auth cookie (production)** | ⚠️ Wrong config | Fix `sameSite: 'None'`, add `domain: '.edcjssun.com'`, ensure `secure: true` |

---

## 5. EXECUTION ROADMAP (DEV PLAN)

### Phase 1 — Foundation Repair (Days 1-2)

> **Goal:** Fix schema, fix auth contract, establish solid base

| # | Task | Priority | Dependency |
|---|---|---|---|
| 1.1 | Write v2 Prisma schema migration | P0 | None |
| 1.2 | Run migration, verify clean state | P0 | 1.1 |
| 1.3 | Create comprehensive seed script (multiple event modes, solo/team, tracks) | P0 | 1.2 |
| 1.4 | Fix JWT payload shape (`userId` not `id`) | P0 | None |
| 1.5 | Fix `requireAuth` to load user from DB | P0 | 1.4 |
| 1.6 | Fix cookie config (sameSite, domain, secure) | P0 | None |
| 1.7 | Fix `verifyOtp` to return `resetToken` JWT | P1 | None |
| 1.8 | Fix `resetPassword` to use `resetToken` instead of re-validating OTP | P1 | 1.7 |
| 1.9 | Fix `setupPassword` to auto-login (return accessToken + set cookie) | P1 | None |
| 1.10 | Add `isVerified` check on login | P1 | None |
| 1.11 | Add password length validation (min 8) to signup/reset/setup | P1 | None |
| 1.12 | Add `morgan` request logging | P2 | None |
| 1.13 | Standardize `response.js` to match PRD error format (code, message, field, details) | P1 | None |
| 1.14 | Delete duplicate `generateRegisterationId.js` | P0 | None |

**Deliverable:** Schema v2 applied. Auth matches PRD contract exactly. Dev 2/3 can safely wire login.

---

### Phase 2 — Core Features (Days 2-5)

> **Goal:** Registration (solo+team), public events, participant APIs working

| # | Task | Priority | Dependency |
|---|---|---|---|
| 2.1 | Refactor `registerTeam` → `register` supporting both `type: "solo"` and `type: "team"` | P0 | Phase 1 |
| 2.2 | Implement `registrationMode` logic (OPEN_ACCESS→SHORTLISTED, APPLICATION_REVIEW→PENDING, INVITE_ONLY→403) | P0 | 2.1 |
| 2.3 | Implement `participationMode` validation (SOLO_ONLY, TEAM_ONLY, BOTH) | P0 | 2.1 |
| 2.4 | Fix registration ID generation: `{PREFIX}-{S\|T}-{NNNN}` sequential | P0 | 2.1 |
| 2.5 | Add cross-table duplicate check (solo Registration + TeamMember) | P0 | 2.1 |
| 2.6 | Install `qrcode`, create `qr.service.js`, generate QR on registration | P1 | 2.1 |
| 2.7 | Add `trackId` validation + storage on registration | P1 | Phase 1 |
| 2.8 | Refactor `getAllEvents` — add pagination, filters (status, mode, search), sort options | P0 | Phase 1 |
| 2.9 | Refactor `getEventBySlug` — add includes for tracks, filter internal settings | P0 | Phase 1 |
| 2.10 | Update `checkRollNo` — also check `Registration` table for solo registrations | P1 | Phase 1 |
| 2.11 | Refactor participant routes to use `:slug` pattern | P0 | Phase 1 |
| 2.12 | Refactor `getMyRegistration` — slug-scoped, solo+team support, type discriminator | P0 | 2.11 |
| 2.13 | Fix `updateMyRegistration` — block rollNo/email/teamSize changes, allow partial updates | P1 | 2.11 |
| 2.14 | Install `cloudinary` + `multer`, create `upload.service.js` | P0 | None |
| 2.15 | Refactor `submitParticipantFile` → support `:roundId`, file upload via multer, Cloudinary stream, upsert, type/size/extension validation | P0 | 2.14 |
| 2.16 | Fix `requireShortlisted` — solo support, OPEN_ACCESS bypass, slug-scoped | P0 | Phase 1 |

**Deliverable:** Full registration + participant dashboard + submission. Dev 2 can replace all mock data.

---

### Phase 3 — Admin & Advanced Systems (Days 5-9)

> **Goal:** All admin APIs, judging, check-in, communications

| # | Task | Priority | Dependency |
|---|---|---|---|
| 3.1 | `GET /api/admin/stats` — platform aggregates | P1 | Phase 1 |
| 3.2 | `GET/POST/PATCH /api/admin/events` — event CRUD + nested relations | P0 | Phase 1 |
| 3.3 | `PATCH /api/admin/events/:slug/settings` — structured payload ↔ flat DB mapping | P0 | 3.2 |
| 3.4 | `GET /api/admin/events/:slug/registrations` — unified solo+team, filters, pagination, search | P0 | Phase 2 |
| 3.5 | `GET /api/admin/events/:slug/registrations/:id` — detail view with members/submissions/email history | P0 | 3.4 |
| 3.6 | `PATCH /api/admin/events/:slug/registrations/:id` — status change + email trigger | P0 | 3.4 |
| 3.7 | `POST /api/admin/events/:slug/registrations/bulk` — batch status + batch email | P0 | 3.4 |
| 3.8 | `GET /api/admin/events/:slug/registrations/export` — CSV download | P1 | 3.4 |
| 3.9 | `POST /api/admin/events/:slug/registrations/checkin/:id` — manual check-in | P1 | 3.4 |
| 3.10 | `GET/PATCH /api/admin/events/:slug/submissions` + export (ZIP) | P1 | Phase 2 |
| 3.11 | `GET/POST/DELETE /api/admin/events/:slug/judges` — judge CRUD + invite email | P1 | Phase 1 |
| 3.12 | `GET /api/admin/events/:slug/scores` — aggregated scores + ranking | P1 | 3.11 |
| 3.13 | `POST /api/admin/events/:slug/results/publish` — publish + email all | P1 | 3.12 |
| 3.14 | `GET /api/admin/events/:slug/checkin` — dashboard with stats | P1 | Phase 1 |
| 3.15 | `POST /api/admin/events/:slug/checkin/scan` — QR scan validation | P0 | 2.6 |
| 3.16 | `GET /api/admin/events/:slug/checkin/export` — CSV attendance | P2 | 3.14 |
| 3.17 | `GET/POST /api/admin/events/:slug/emails` — history + manual send | P1 | Phase 1 |
| 3.18 | `GET /api/admin/events/:slug/emails/templates` — built-in templates list | P2 | 3.17 |
| 3.19 | Judge portal: `GET/POST/PATCH /api/judging/:slug/*` — 4 endpoints | P1 | 3.11 |
| 3.20 | `scoring.service.js` — weighted aggregation + z-score normalization | P1 | 3.19 |
| 3.21 | Expand `email.service.js` — all 13 templates + template variable engine + batch | P0 | 3.6 |
| 3.22 | Install `json2csv`, `archiver` for exports | P1 | None |

**Deliverable:** Full admin API set. Dev 3 can wire all admin screens. Judging operational.

---

### Phase 4 — Auction, Hardening & Edge Cases (Days 9-11)

> **Goal:** Auction module, production readiness

| # | Task | Priority | Dependency |
|---|---|---|---|
| 4.1 | All 9 auction endpoints + `requireAuctionAuth` middleware | P1 | Phase 1 |
| 4.2 | Status transition state machine enforcement | P1 | Phase 3 |
| 4.3 | MIME type validation (magic bytes, not extension) | P2 | 2.14 |
| 4.4 | `autoCloseRegistration` deadline enforcement (lazy check on each request) | P2 | Phase 2 |
| 4.5 | Global rate limiting (200/min general, 100/min auth) | P1 | None |
| 4.6 | Production CORS whitelist config | P1 | None |
| 4.7 | Add `onDelete: Cascade` audit across all relations | P1 | Phase 1 |
| 4.8 | Comprehensive error handler middleware | P2 | None |
| 4.9 | Production cookie config (domain, secure, sameSite) | P0 | Phase 1 |
| 4.10 | Health check endpoint improvements | P2 | None |
| 4.11 | Prisma connection pool tuning | P2 | None |
| 4.12 | Pre-event backup procedure | P2 | None |
| 4.13 | Full Postman collection with all endpoints | P1 | All phases |
| 4.14 | Delete seed data from production DB script | P2 | None |
| 4.15 | Integration test suite for critical flows (registration, auth, submission) | P1 | All phases |

**Deliverable:** Production-ready backend. All PRD endpoints implemented. Full Postman collection.

---

## 6. WHAT SHOULD GO INTO A SEPARATE DEV DOCUMENT

- [ ] **API Contracts Sheet** — Final request/response shapes for every endpoint, shared with Dev 2/3 (Google Sheet or Postman docs)
- [ ] **DB Migration Plan** — Step-by-step v1 → v2 migration commands, rollback procedure, data preservation strategy
- [ ] **Environment Variables** — Complete `.env.example` with all required keys: `DATABASE_URL`, `DIRECT_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `FRONTEND_URL`, `CORS_ORIGINS`, `AUCTION_PASSWORD`, `NODE_ENV`
- [ ] **Setup Guide** — Clone, install, env config, DB setup, migrate, seed, run dev server — for Dev 2/3 onboarding
- [ ] **Postman Collection** — Organized by: Auth, Public Events, Registration, Participant, Admin Platform, Admin Registrations, Admin Submissions, Admin Judging, Admin Check-In, Admin Communications, Judge Portal, Auction
- [ ] **Testing Checklist** — Registration flow (solo + team + all 3 modes), auth full cycle, submission with file, admin bulk operations, judge scoring, check-in scan, auction bid flow
- [ ] **Deployment Steps** — Railway deploy commands, environment variable setup, DB migration on production, seed removal, CORS config, SSL verification
- [ ] **Email Template Reference** — All 13 templates with HTML mockup, variable list, trigger conditions
- [ ] **Status Transition Diagram** — Visual state machine for registration states with allowed transitions
- [ ] **Handoff Protocol** — API group notification template, Postman share flow, integration testing checklist for Dev 2/3

---

## 7. RISK ANALYSIS

### Top 5 Implementation Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | **Schema migration breaks existing data** — v1 → v2 is a major restructure (new models, renamed enums, added fields). Existing registrations/teams may become orphaned or inconsistent | High | Critical | Write migration in stages. Back up DB before each migration. Test on a clone first. Use `prisma migrate dev` in dev, manual SQL review for prod |
| 2 | **Admin unified registrations query is complex** — Union of `Registration` (solo) and `Team` (team) tables into a single paginated, filterable, searchable API is non-trivial with Prisma | High | High | Consider using raw SQL (`$queryRaw`) for the union query. Build and test with large datasets (100+ registrations). Ensure indexes are correct |
| 3 | **Concurrent registration race conditions** — 50+ simultaneous registrations with overlapping roll numbers, sequential ID generation, and capacity checks | Medium | High | Serializable transaction isolation (already used). Retry loop (already exists). Add DB-level unique constraints as safety net. Load test before event day |
| 4 | **Cloudinary integration under load** — File uploads streamed from memory to Cloudinary during event-day submission surges. If Cloudinary rate-limits or fails, submissions are lost | Medium | High | Implement retry with exponential backoff. Store file temporarily in memory buffer. Set reasonable multer limits. Have fallback: accept link submissions if upload fails |
| 5 | **Email system as bottleneck** — 13 email types, batch sends to 100+ recipients, Resend API limits. If emails block the main operation, registration/shortlisting will be slow | Medium | Medium | Emails MUST be fire-and-forget (outside DB transaction). Log failures. Never await email before returning HTTP response. Use Resend batch API. Consider a simple queue for >50 recipients |

### Where Things Can Fail in Production

1. **Event day registration surge** → DB connection pool exhaustion (default 10 connections). Monitor and increase if needed
2. **Cookie not being set** → `sameSite: Lax` will fail cross-subdomain. Must be `None` + `secure` + `domain`
3. **JWT payload mismatch** → `id` vs `userId` between token and middleware/frontend will cause silent auth failures
4. **File upload timeout** → Large files (25MB) + slow Cloudinary upload > Express default timeout. May need to increase timeout for upload routes
5. **CSV/ZIP export memory** → Streaming large exports (1000+ registrations) into memory will OOM. Use streaming response (`res.write` chunks)
6. **Stale `requireAuth` data** → Not loading user from DB means role changes won't take effect until token refresh (15 min window)
7. **Email template rendering** → Unescaped user input in email templates (team names, etc.) could break HTML or enable XSS in email clients

---

## 8. FINAL VERDICT

### Completeness: **~25%**

| Dimension | Score | Notes |
|---|---|---|
| Schema | 40% | Base models exist but missing v2 features, new models, updated enums |
| Auth | 60% | All 9 endpoints exist but 6+ implementation gaps vs PRD |
| Public Events | 30% | Endpoints exist but no pagination/filters/sort, missing v2 fields |
| Registration | 35% | Team-only, no solo, no mode handling, no QR, known bugs |
| Participant | 25% | Endpoints exist but wrong route structure, no solo, no round support |
| Admin | 0% | Zero implementation |
| Judging | 0% | Zero implementation |
| Check-In | 0% | Zero implementation |
| Communications | 10% | 3 of 13 email templates, no admin send |
| Auction | 0% | Zero implementation |
| File Upload | 0% | No Cloudinary/multer integration |
| NFRs | 15% | Basic rate limiting + CORS only |

### Readiness: **NOT READY FOR DEVELOPMENT HANDOFF**

> [!CAUTION]
> The backend is in early-alpha state. The schema is still v1, the admin API surface (which is ~40% of total functionality) has zero implementation, and critical integrations (Cloudinary, QR, expanded email) are completely missing. 
>
> **Dev 2 and Dev 3 are blocked** on approximately 70% of the APIs they need.

### Recommendation

1. **Do NOT restructure** the existing code — it's directionally correct
2. **Prioritize the schema migration** — everything downstream depends on it
3. **Fix auth deviations immediately** — Dev 2 is likely already integrating against the wrong contract
4. **Attack admin APIs next** — Dev 3 is fully blocked
5. **11-day timeline in PRD roadmap is aggressive but feasible** if developer works focused, full-time
6. The PRD itself is **exceptionally well-written** — the spec quality is not the issue; execution velocity is
