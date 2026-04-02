# DEV 1 Backend PRD + SRS — Part 3: Flows, Logic, Systems, NFRs, Roadmap

---

# 6. CRITICAL FLOWS (Step-by-Step)

## 6.1 Registration Flow (Atomic + Transactional)

```
┌─ CLIENT ─────────────────────────────────────────────────────────────┐
│  User fills multi-step form → clicks "Submit Registration"          │
│  POST /api/events/:slug/register { type, teamName, members, ... }  │
└──────────────────────────────────────────────────┬───────────────────┘
                                                    │
┌─ SERVER ─────────────────────────────────────────▼───────────────────┐
│                                                                      │
│  Step 1: LOAD EVENT                                                  │
│    → Find event by slug                                              │
│    → 404 if not found                                                │
│                                                                      │
│  Step 2: VALIDATE REGISTRATION WINDOW                                │
│    → event.registrationOpen must be true                             │
│    → now < event.registrationDeadline (if set)                       │
│    → 403 REGISTRATION_CLOSED if either fails                        │
│                                                                      │
│  Step 3: VALIDATE PARTICIPATION MODE                                 │
│    → If SOLO_ONLY and type="team" → 422 INVALID_PARTICIPATION_TYPE  │
│    → If TEAM_ONLY and type="solo" → 422 INVALID_PARTICIPATION_TYPE  │
│    → If BOTH → either type accepted                                  │
│                                                                      │
│  Step 4: VALIDATE CAPACITY                                           │
│    → Count existing registrations + teams for this event             │
│    → If count >= maxParticipants → 422 EVENT_FULL                   │
│                                                                      │
│  Step 5: VALIDATE PAYLOAD                                            │
│    → Required fields present (name, email, etc.)                     │
│    → Team: teamSize within [teamSizeMin, teamSizeMax]                │
│    → Team: members.length === teamSize                               │
│    → Team: exactly one isLead=true                                   │
│    → All emails valid format                                         │
│    → All phones 10 digits (if required)                              │
│    → trackId valid if hasTracks=true                                 │
│    → 422 VALIDATION_ERROR with field-level details                  │
│                                                                      │
│  Step 6: VALIDATE UNIQUENESS (pre-transaction quick check)           │
│    → Check rollNos unique within payload                             │
│    → Check no duplicate rollNo in TeamMember where eventId matches   │
│    → Check no duplicate userId+eventId in Registration               │
│    → 409 DUPLICATE_ROLLNO or ALREADY_REGISTERED                     │
│                                                                      │
│  Step 7: BEGIN TRANSACTION (prisma.$transaction)                     │
│    ┌──────────────────────────────────────────────────────────────┐  │
│    │                                                              │  │
│    │  7a. Generate registrationId (sequential, padded)            │  │
│    │      → COUNT where eventId, +1, pad to 4 digits              │  │
│    │      → Format: {PREFIX}-{S|T}-{NNNN}                        │  │
│    │                                                              │  │
│    │  7b. Determine initial status                                │  │
│    │      → OPEN_ACCESS → SHORTLISTED                            │  │
│    │      → APPLICATION_REVIEW → PENDING                         │  │
│    │      → INVITE_ONLY → should not reach here                  │  │
│    │                                                              │  │
│    │  7c. Create Registration/Team record                         │  │
│    │                                                              │  │
│    │  7d. For each member (team) or the user (solo):              │  │
│    │      → Find User by email                                    │  │
│    │      → If NOT found AND isLead:                              │  │
│    │          • Create User (random password, PARTICIPANT)        │  │
│    │          • Create SetupPasswordToken (48hr expiry)           │  │
│    │          • Queue setup-password email                        │  │
│    │      → If found: link userId                                │  │
│    │      → Create TeamMember record (team only)                  │  │
│    │                                                              │  │
│    │  7e. Generate QR code token (if requiresCheckIn=true)        │  │
│    │      → crypto.randomUUID() or cuid                          │  │
│    │      → Store in qrCode field                                │  │
│    │                                                              │  │
│    │  7f. Create EmailLog entry                                   │  │
│    │                                                              │  │
│    └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  Step 8: SEND EMAILS (outside transaction — non-blocking)            │
│    → Registration confirmation to lead                               │
│    → Setup-password email (if new user created)                      │
│    → Update EmailLog status to SENT or FAILED                        │
│                                                                      │
│  Step 9: RETURN RESPONSE                                             │
│    → { registrationId, type, teamName?, qrCode?, message }          │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

## 6.2 Submission Flow

```
1. Client: POST /api/participant/:slug/submit/:roundId
2. Server: requireAuth middleware → extract user
3. Server: requireShortlisted middleware → check eligibility
4. Server: Load event + round
5. Validate:
   a. round exists and belongs to event
   b. round.submissionRequired = true
   c. round.isActive = true
   d. EventSettings.submissionsOpen = true
   e. now < round.submissionDeadline (if set)
   f. Submission type matches round.submissionType
6. If FILE type:
   a. multer middleware receives file
   b. Validate extension against round.acceptedFileTypes
   c. Validate size against round.maxFileSize (MB)
   d. Upload to Cloudinary (folder: events/{eventSlug}/submissions/{roundOrder})
   e. Get back URL, size
7. If LINK type:
   a. Validate URL format (starts with http/https)
8. If FORM type:
   a. Validate formData is valid JSON
9. Upsert Submission:
   → Unique key: (teamId OR registrationId) + roundId
   → If exists: update file/link fields + submittedAt = now
   → If new: create
10. Send confirmation email (if settings.notifyOnSubmission = true)
11. Return submission details
```

## 6.3 Shortlisting Flow

```
Admin action: PATCH or POST bulk status update

1. Admin selects registrations → sets status per entry
2. POST /api/admin/events/:slug/registrations/bulk
   Body: { ids: [...], status: "SHORTLISTED" }
3. Server validates:
   a. All IDs belong to this event
   b. Status is a valid RegistrationStatus value
   c. Event registrationMode = APPLICATION_REVIEW (shortlisting only makes sense here)
4. Transaction:
   a. Update all Registration/Team records with new status
   b. For each affected record, create EmailLog entry
5. After transaction: batch send emails
   → SHORTLISTED: "You're In!" + submission link (if submission round active) + QR (if check-in)
   → WAITLISTED: "You're on the waitlist"
   → REJECTED: "Thank you for applying"
6. If autoOpenSubmissions = true AND status = SHORTLISTED:
   → Check if submissionsOpen should be toggled (if all shortlisting is done)
7. Return { updated: count, emailsSent: count }
```

## 6.4 Judge Scoring Flow

```
1. Judge logs in (role=JUDGE) → views /judging/:eventSlug
2. GET /api/judging/:slug/submissions
   → Returns submissions assigned to this judge (by track or all)
   → Each submission includes: team/participant info, file/link, existing scores by this judge
3. Judge opens a submission, reviews the deliverable
4. POST /api/judging/:slug/scores
   Body: {
     submissionId: "...",
     scores: [
       { criteriaId: "c1", score: 8, comment: "Strong innovation" },
       { criteriaId: "c2", score: 6, comment: "Feasibility concerns" },
       { criteriaId: "c3", score: 9 }
     ]
   }
5. Server validates:
   a. EventSettings.judgingOpen = true
   b. Judge is assigned to this event
   c. Submission belongs to this event
   d. Each score <= criteria.maxScore
   e. All criteria for the round are scored
6. Upsert JudgeScore records (unique: submissionId + judgeId + criteriaId)
7. Return saved scores

SCORE AGGREGATION (triggered when admin views scores or publishes results):
  For each submission:
    rawScore = Σ(criterionScore × criterionWeight) / Σ(weights)
  If normalization enabled:
    Per judge: zScore = (score - judgeAvg) / judgeStdDev
    normalizedScore = mean(zScores across all judges for this submission)
  Rank = sort by finalScore DESC
```

## 6.5 Check-in Flow (QR-based)

```
1. QR codes generated at registration time (stored in Registration.qrCode or Team.qrCode)
2. Event day: Admin opens Check-In Tab → activates camera
3. Camera scans QR → decodes token string
4. POST /api/admin/events/:slug/checkin/scan { qrToken: "decoded_string" }
5. Server:
   a. Find Registration where qrCode = token OR Team where qrCode = token
   b. If not found → 404 INVALID_QR
   c. If already checkInStatus = true → 409 ALREADY_CHECKED_IN (return name + time)
   d. Validate status is SHORTLISTED (or PENDING for OPEN_ACCESS events)
   e. Update: checkInStatus = true, checkInTime = now(), status = CHECKED_IN
   f. Return { name, registrationId, teamName?, checkInTime }
6. Manual check-in: same endpoint with search-based ID lookup instead of QR

WALK-IN FLOW (if allowWalkIns = true):
  POST /api/admin/events/:slug/registrations/checkin/:id { type: "walkin" }
  → Creates a new Registration with status=CHECKED_IN directly
  → Skips normal registration validation
```

## 6.6 Email Trigger Flow

```
AUTOMATED TRIGGERS (fire-and-forget, logged in EmailLog):

  On Registration Submit:
    → IF registrationMode = OPEN_ACCESS:
        template: REGISTRATION_CONFIRMED
    → IF registrationMode = APPLICATION_REVIEW:
        template: APPLICATION_RECEIVED
    → IF new User created:
        template: SETUP_PASSWORD (includes one-time link)

  On Status Change:
    → IF notifyOnStatusChange = true:
        → SHORTLISTED: template SHORTLISTED_CONFIRMED + submission link + QR (if check-in)
        → WAITLISTED: template WAITLISTED
        → REJECTED: template REJECTED

  On Submission:
    → IF notifyOnSubmission = true:
        template: SUBMISSION_RECEIVED

  On Schedule (cron or manual trigger):
    → reminderHoursBefore hours before deadline:
        To: all eligible who haven't submitted
        template: SUBMISSION_REMINDER
    → Day before event:
        To: all SHORTLISTED/CHECKED_IN
        template: EVENT_DAY_REMINDER + QR code

  On Results Publish:
    → To all registered participants
    → template: RESULTS_ANNOUNCED

  On Judge Invite:
    → template: JUDGE_INVITATION + portal link

ADMIN MANUAL SEND:
  POST /api/admin/events/:slug/emails/send → resolve audience, replace variables, batch send

EMAIL SENDING IMPLEMENTATION:
  1. Build recipient list
  2. For each recipient:
     a. Replace template variables: {{name}}, {{teamName}}, {{registrationId}}, etc.
     b. Call Resend API
     c. Create EmailLog { recipient, type, subject, status: "SENT"|"FAILED", error? }
  3. If Resend batch API available, use it (up to 100 per batch)
  4. On failure: log error in EmailLog, do NOT retry automatically (admin can resend)
```

---

# 7. BUSINESS LOGIC RULES

## 7.1 Registration Rules

| Rule | Enforcement |
|---|---|
| Registration requires event to be public | API check: `event.isPublic = true` |
| Registration requires window to be open | API check: `registrationOpen = true AND now < deadline` |
| Solo not allowed for TEAM_ONLY events | API check on `participationMode` |
| Team not allowed for SOLO_ONLY events | API check on `participationMode` |
| User cannot register twice for same event | DB unique constraint: `@@unique([userId, eventId])` on Registration + cross-check TeamMember |
| User cannot be in two teams for same event | API check across TeamMember table |
| Roll number unique per event | DB check + API validation |
| INVITE_ONLY hides registration form entirely | Frontend hides form; API returns `403 REGISTRATION_NOT_AVAILABLE` if someone tries |

## 7.2 Team Constraints

| Constraint | Rule |
|---|---|
| Team size | Must be between `event.teamSizeMin` and `event.teamSizeMax` |
| Team lead | Exactly one member with `isLead=true` (required) |
| Member count | `members.length` must equal declared `teamSize` |
| Duplicate roll numbers | Not allowed within same event (cross-team) |
| Edit permissions | Only team lead can edit. Only while status=PENDING |
| Editable fields | teamName, member names, phones. NOT rollNo, email, teamSize |

## 7.3 Submission Eligibility

```
Eligible to submit IF:
  1. Event has a round with submissionRequired = true
  2. That round isActive = true
  3. EventSettings.submissionsOpen = true
  4. now < round.submissionDeadline (if set)
  5. AND one of:
     a. registrationMode = OPEN_ACCESS (all registered can submit)
     b. status = SHORTLISTED or CHECKED_IN (for APPLICATION_REVIEW / INVITE_ONLY)
```

## 7.4 Deadline Enforcement

| Deadline | Where Enforced | Behavior |
|---|---|---|
| registrationDeadline | API layer + EventSettings | `now < deadline` check. Also: if `autoCloseRegistration=true`, set `registrationOpen=false` when deadline passes |
| round.submissionDeadline | API layer per round | Hard cutoff. `now < deadline`. No grace period |
| SetupPasswordToken expiry | 48 hours | Token becomes invalid after 48h |
| OTP expiry | 15 minutes | OTP record deleted or ignored after 15min |
| RefreshToken expiry | 7 days | Token invalid after 7d, must re-login |

## 7.5 Status Transitions

```
Registration/Team Status State Machine:

  PENDING ──→ SHORTLISTED ──→ CHECKED_IN
    │              │
    ├──→ WAITLISTED ──→ SHORTLISTED (if spot opens)
    │
    ├──→ REJECTED
    │
    └──→ DISQUALIFIED (admin-only, exceptional)

  OPEN_ACCESS events: registration starts at SHORTLISTED directly

  Valid transitions:
    PENDING → SHORTLISTED, WAITLISTED, REJECTED
    SHORTLISTED → CHECKED_IN, DISQUALIFIED
    WAITLISTED → SHORTLISTED, REJECTED
    CHECKED_IN → DISQUALIFIED
    REJECTED → (terminal, no further transitions unless admin overrides)
    DISQUALIFIED → (terminal)
```

## 7.6 Participation Mode Behavior

| Mode | Registration Model | Dashboard Label | API behavior |
|---|---|---|---|
| SOLO_ONLY | `Registration` table | "My Registration" | Only `type: "solo"` accepted in register endpoint |
| TEAM_ONLY | `Team` + `TeamMember` tables | "My Team" | Only `type: "team"` accepted |
| BOTH | Either table based on user choice | Depends on choice | Both types accepted, frontend asks user to choose first |

---

# 8. FILE UPLOAD SYSTEM

## 8.1 Cloudinary Integration

```js
// Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Storage structure
events/
  {eventSlug}/
    submissions/
      round-{order}/
        {registrationId}_{timestamp}.{ext}
    assets/
      cover_{timestamp}.{ext}
      logo_{timestamp}.{ext}
```

## 8.2 File Validation

| Check | Rule | Error |
|---|---|---|
| File type | Must match `round.acceptedFileTypes` (e.g., ".pptx,.pdf,.zip") | `422 INVALID_FILE_TYPE` |
| File size | Must be ≤ `round.maxFileSize` MB (default: 25MB if null) | `422 FILE_TOO_LARGE` |
| File presence | Required for FILE and MIXED submission types | `422 FILE_REQUIRED` |
| Mime type | Validate actual mime type, not just extension | Prevents spoofed extensions |

## 8.3 Security

- Files uploaded via multer (memory storage) → streamed to Cloudinary → never stored on disk
- Cloudinary URLs are not guessable but are not access-controlled — acceptable for this scale
- File size limit enforced both in multer config AND in controller validation
- No executable file types accepted (block .exe, .sh, .bat etc.)

## 8.4 Upload Implementation

```js
// multer config
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB hard cap
  fileFilter: (req, file, cb) => {
    // Allow common document/image types
    const allowed = ['.pptx', '.pdf', '.zip', '.png', '.jpg', '.jpeg', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Invalid file type'), false);
  }
});
```

---

# 9. EMAIL SYSTEM

## 9.1 All Email Types

| Type ID | Template Name | Trigger |
|---|---|---|
| `REGISTRATION_CONFIRMED` | Registration Confirmed | Solo/team registration (OPEN_ACCESS) |
| `APPLICATION_RECEIVED` | Application Received | Solo/team registration (APPLICATION_REVIEW) |
| `SETUP_PASSWORD` | Set Your Password | Auto-created user account |
| `SHORTLISTED` | You're In! | Status → SHORTLISTED |
| `REJECTED` | Thank You for Applying | Status → REJECTED |
| `WAITLISTED` | You're on the Waitlist | Status → WAITLISTED |
| `SUBMISSION_RECEIVED` | Submission Confirmed | File/link submitted |
| `SUBMISSION_REMINDER` | Reminder: Deadline Approaching | N hours before submission deadline |
| `EVENT_DAY_REMINDER` | See You Tomorrow! | Day before event |
| `RESULTS_ANNOUNCED` | Results Are Out | resultsPublished set to true |
| `JUDGE_INVITATION` | You're Invited to Judge | Judge added to event |
| `CHECKIN_INSTRUCTIONS` | Check-In Instructions | Shortlisted + check-in required |
| `CUSTOM` | (admin writes) | Admin sends from Communications panel |

## 9.2 Template Variables

| Variable | Source |
|---|---|
| `{{name}}` | User.name or TeamMember.name (lead) |
| `{{teamName}}` | Team.teamName |
| `{{registrationId}}` | Registration.registrationId or Team.registrationId |
| `{{eventName}}` | Event.title |
| `{{eventDate}}` | Event.eventDate (formatted) |
| `{{venue}}` | Event.venue |
| `{{submissionDeadline}}` | Round.submissionDeadline (nearest) |
| `{{statusMessage}}` | Context-specific (e.g., "You've been shortlisted!") |
| `{{qrCodeUrl}}` | Generated QR image URL |
| `{{dashboardUrl}}` | `events.edcjssun.com/{eventSlug}/dashboard` |
| `{{setupPasswordUrl}}` | `events.edcjssun.com/auth/setup-password?token={token}` |

## 9.3 Failure Handling

- Email send failures are logged in EmailLog with `status: "FAILED"` and `error` field
- No automatic retry — admin can manually resend from Communications panel
- Email failures NEVER block the primary operation (registration, status change, etc.)
- Emails sent AFTER the database transaction commits (never inside transaction)

## 9.4 EmailLog Model Usage

Every email sent creates an `EmailLog` record:
```json
{
  "eventId": "event_cuid",
  "recipient": "student@jss.edu",
  "type": "SHORTLISTED",
  "subject": "You're In! — Founder's Pit 2026",
  "body": "rendered HTML",
  "status": "SENT",
  "sentAt": "2026-04-12T10:30:00Z"
}
```

---

# 10. ERROR HANDLING & EDGE CASES

## 10.1 Error Response Standard

```json
{
  "success": false,
  "error": {
    "code": "DUPLICATE_ROLLNO",
    "message": "Roll number 22BCE1234 is already registered for this event",
    "field": "members[1].rollNo",
    "details": {}
  }
}
```

## 10.2 Edge Cases Catalogue

| Scenario | Handling |
|---|---|
| Two users submit registration with same rollNo simultaneously | DB unique constraint catches the second. Transaction rolls back. Return `409 DUPLICATE_ROLLNO` |
| User tries to register after deadline passes (clock skew) | Server time is authoritative. 30-second grace period if needed |
| Team lead's email already has SUPER_ADMIN account | Link the TeamMember.userId but do NOT change user's role |
| Submission uploaded but Cloudinary fails | Return `500 UPLOAD_FAILED`. Email not sent. User retries |
| Admin bulk-updates 100 teams but email fails for 3 | DB updates succeed. Return `{ updated: 100, emailsSent: 97, emailsFailed: 3 }`. Failed emails logged |
| Judge scores a submission, then judging is closed | Existing scores preserved. New scores and edits blocked with `403 JUDGING_CLOSED` |
| User accesses dashboard for event they're not registered for | `404 REGISTRATION_NOT_FOUND` — frontend shows "not registered" state |
| Event deleted while teams exist | `onDelete: Cascade` removes all related records. Only SUPER_ADMIN can delete. Double confirmation |
| Same user tries to be in two teams for one event | Check TeamMember table for userId+eventId before creating. Return `409 ALREADY_IN_TEAM` |
| File type spoofing (.exe renamed to .pdf) | Validate MIME type from file buffer magic bytes, not just extension |
| QR code scanned twice | Second scan returns `409 ALREADY_CHECKED_IN` with check-in time |

---

# 11. NON-FUNCTIONAL REQUIREMENTS

| Requirement | Target | Implementation |
|---|---|---|
| **Response time** | < 200ms for reads, < 500ms for writes | Efficient Prisma queries with selective includes. Proper indexes |
| **Concurrent registrations** | Handle 50+ simultaneous submissions | DB-level uniqueness + transactions. No in-memory locks |
| **File upload** | Up to 25MB, reliable | Multer memory storage → stream to Cloudinary. No disk I/O |
| **API rate limiting** | 100 req/min per IP for auth, 200/min general | express-rate-limit middleware |
| **Security** | No SQL injection, XSS, CSRF | Prisma (parameterized queries), HTTP-only cookies, CORS whitelist, input sanitization |
| **CORS** | Only allowed origins | Whitelist: `events.edcjssun.com`, `www.edcjssun.com`, `localhost:5173` |
| **Logging** | Request logging + error tracking | morgan (request logs), console.error (errors), EmailLog (email audit) |
| **DB connections** | Pool management | Prisma connection pooling (default: 10 connections) |
| **Availability** | 99.9% during event day | Railway auto-restart. Health check endpoint: `GET /` |
| **Backup** | Pre-event full backup | Manual DB export at 8:30 AM event day. Automated daily backups via Railway/Supabase |

---

# 12. API CONTRACT RULES

## 12.1 Naming Conventions

- Routes: lowercase, kebab-case for multi-word resources: `/api/admin/events/:slug/registrations`
- Query params: camelCase: `?teamSize=3&registrationId=FP26-T-0001`
- Request body: camelCase: `{ teamName, hearAboutUs }`
- Response body: camelCase: `{ registrationId, checkInStatus }`
- Error codes: UPPER_SNAKE_CASE: `DUPLICATE_ROLLNO`, `REGISTRATION_CLOSED`
- Enum values: UPPER_SNAKE_CASE: `OPEN_ACCESS`, `SHORTLISTED`

## 12.2 Response Format Standardization

Every response (success and error) uses the wrapper:
```json
{ "success": true|false, "data": {}|null, "error": {}|null }
```

Paginated responses include: `{ items, total, page, limit }`

## 12.3 Versioning Strategy

- No URL versioning for MVP (`/api/` prefix only)
- Breaking changes documented in changelog
- Future: `/api/v2/` if needed

---

# 13. INTEGRATION CONTRACT WITH FRONTEND

## 13.1 Frontend Expectations

| Expectation | Backend Responsibility |
|---|---|
| **Auth state** | Frontend stores accessToken in memory (Zustand). Backend returns it in login/refresh responses. Frontend sends as `Authorization: Bearer <token>` |
| **Cookie handling** | Backend sets/clears refreshToken cookie. Frontend uses `withCredentials: true`. Frontend NEVER reads the cookie directly |
| **401 handling** | Frontend interceptor catches 401, calls `/api/auth/refresh`, retries original request. If refresh fails, clears auth and redirects to login |
| **Error display** | Frontend reads `error.message` for user-facing text and `error.field` for inline form errors |
| **Loading states** | Frontend manages loading. Backend returns as fast as possible. No long-polling except auction leaderboard |
| **Pagination** | Frontend sends `?page=1&limit=20`. Backend returns `{ items, total, page, limit }` |
| **File uploads** | Frontend sends `multipart/form-data`. Backend responds with uploaded file URL |

## 13.2 Settings Payload Contract

Frontend (Dev 3) sends/receives settings in structured format. Backend maps this to/from flat DB columns:

```
Frontend payload                    →  DB column
toggles.registrationOpen            →  EventSettings.registrationOpen
toggles.submissionsOpen             →  EventSettings.submissionsOpen
deadlines.registrationDeadline      →  EventSettings.registrationDeadline
limits.teamSizeMin                  →  Event.teamSizeMin
limits.teamSizeMax                  →  Event.teamSizeMax
limits.maxParticipants              →  Event.maxParticipants
limits.maxTeamsPerProblem           →  EventSettings.maxTeamsPerProblem
communications.notifyOnRegistration →  EventSettings.notifyOnRegistration
automation.autoCloseRegistration    →  EventSettings.autoCloseRegistration
```

## 13.3 Registration Response Contract

Frontend expects these exact fields after successful registration:
```json
{
  "success": true,
  "data": {
    "registrationId": "FP26-T-0001",
    "type": "team",
    "teamName": "Team Alpha",
    "qrCode": "unique-token-string",
    "message": "Registration successful"
  }
}
```

---

# 14. DEVELOPMENT ROADMAP (DEV 1 ONLY)

## Phase A: Foundation + Auth (Days 1–2)

- [ ] Update Prisma schema to v2 (add all new models, fields, enums)
- [ ] Run migration: `npx prisma migrate dev --name v2_schema_update`
- [ ] Create seed script with test event data (multiple participation/registration modes)
- [ ] Implement all 9 auth endpoints
- [ ] Write `requireAuth`, `requireRole`, `requireShortlisted` middleware
- [ ] Write `jwt.js` utility (sign, verify)
- [ ] Write `response.js` utility (sendSuccess, sendError)
- [ ] Test auth flow end-to-end via Postman
- [ ] Share Postman collection: Auth group

**Deliverable:** Working auth system. Dev 2/3 can wire real login immediately.

## Phase B: Events + Registration (Days 2–4)

- [ ] `GET /api/events` with filters, pagination
- [ ] `GET /api/events/:slug` with full includes
- [ ] `GET /api/events/:slug/check-rollno`
- [ ] `POST /api/events/:slug/register` (BOTH solo and team, full validation, transactional)
- [ ] `generateId.js` — registration ID generator
- [ ] `qr.service.js` — QR token generation
- [ ] `email.service.js` — Registration confirmation + setup-password templates
- [ ] Test: registration flow with mock + real DB

**Deliverable:** Registration works end-to-end. Dev 2 can swap mock registration for real.

## Phase C: Participant APIs (Days 4–6)

- [ ] `GET /api/participant/:slug/registration`
- [ ] `PATCH /api/participant/:slug/registration`
- [ ] `POST /api/participant/:slug/submit/:roundId` + Cloudinary integration
- [ ] `GET /api/participant/:slug/submissions`
- [ ] `upload.service.js` — Cloudinary wrapper
- [ ] Submission validation (type, size, deadline)

**Deliverable:** Participant dashboard + submission working. Dev 2 wires up real data.

## Phase D: Admin APIs (Days 5–8)

- [ ] `GET /api/admin/stats`
- [ ] `GET/POST/PATCH /api/admin/events` (CRUD)
- [ ] `PATCH /api/admin/events/:slug/settings` (structured payload mapping)
- [ ] `GET /api/admin/events/:slug/registrations` (unified solo+team, filters, search, pagination)
- [ ] `GET /api/admin/events/:slug/registrations/:id`
- [ ] `PATCH /api/admin/events/:slug/registrations/:id` (status change + email trigger)
- [ ] `POST /api/admin/events/:slug/registrations/bulk` (batch update + batch email)
- [ ] `GET /api/admin/events/:slug/registrations/export` (CSV)
- [ ] `POST /api/admin/events/:slug/registrations/checkin/:id` (manual check-in)
- [ ] `GET/PATCH /api/admin/events/:slug/submissions` + export
- [ ] All email templates (SHORTLISTED, REJECTED, WAITLISTED, REMINDER, etc.)

**Deliverable:** Full admin API set. Dev 3 wires all admin screens.

## Phase E: Judging + Check-in + Communications + Advanced (Days 8–11)

- [ ] Judge CRUD: `GET/POST/DELETE /api/admin/events/:slug/judges`
- [ ] Scores: `GET /api/admin/events/:slug/scores`
- [ ] Results: `POST /api/admin/events/:slug/results/publish`
- [ ] Judge portal: `GET/POST/PATCH /api/judging/:slug/*`
- [ ] `scoring.service.js` — aggregation + normalization
- [ ] Check-in: `GET /api/admin/events/:slug/checkin`, scan, export
- [ ] Communications: email history, send, templates
- [ ] Auction: all 9 endpoints under `/api/auction/:slug/*`
- [ ] Rate limiting middleware
- [ ] Final API review + fix integration issues

**Deliverable:** All APIs complete. Full Postman collection shared.

---

# 15. ACCEPTANCE CRITERIA

## When is Backend "Done"?

| Criterion | Requirement |
|---|---|
| **All endpoints implemented** | Every endpoint listed in PRD v2 Section 14 returns correct data |
| **Auth hardened** | All `/api/admin/*` return 401 for unauthenticated. All `/api/judging/*` check judge role + event assignment. No route accessible without proper authorization |
| **Registration atomic** | 50 concurrent registration requests with overlapping roll numbers: zero duplicates, zero partial records |
| **Settings contract** | `GET/PATCH settings` matches Dev 3's structured payload shape exactly |
| **Unified registrations** | Admin registrations endpoint returns both solo and team with `type` discriminator |
| **Email system** | All 13 email types fire correctly. All logged in EmailLog. No email failure blocks a primary operation |
| **File upload** | Submissions upload to Cloudinary successfully. All validation rules enforced. Re-submission replaces previous |
| **QR check-in** | QR token generated on registration. Scan correctly updates check-in status. Duplicate scan returns error |
| **Judging** | Judge invited, scores, normalization, results publish — full cycle works |
| **CSV/ZIP exports** | All export endpoints generate correct files |
| **Error responses** | Every error returns standardized `{ success: false, error: { code, message } }` format |
| **Postman collection** | Shared with Dev 2 and Dev 3. All endpoints tested and documented |
| **Deployment** | Running on Railway. DB on Railway/Supabase. `.env` configured for production |
| **Zero hardcoding** | No event-specific logic. Everything driven by event config |

## Definition of Production-Ready

1. All endpoints pass integration tests
2. Auth middleware enforced on every protected route
3. CORS configured for production origins
4. Environment variables set for production
5. DB migrations applied to production
6. Seed data removed from production
7. Error logging active
8. Rate limiting configured
9. Pre-event DB backup procedure documented and tested
10. Hotfix protocol documented (who can deploy, when, how)

---

*End of DEV 1 Backend PRD + SRS Document*
*Canonical source: EDC_Platform_PRD_v2.md*
*All three parts together constitute the complete specification*
