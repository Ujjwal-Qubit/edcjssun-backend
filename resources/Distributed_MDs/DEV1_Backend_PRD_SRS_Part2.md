# DEV 1 Backend PRD + SRS — Part 2: API Design

---

# 5. API DESIGN (COMPLETE)

## Standard Response Format

All endpoints MUST return this shape:

```json
// Success
{ "success": true, "data": { ... } }

// Error
{ "success": false, "error": { "code": "ERROR_CODE", "message": "Human readable", "field": "optional" } }

// Paginated
{ "success": true, "data": { "items": [...], "total": 47, "page": 1, "limit": 20 } }
```

**HTTP Status Codes Used:**
- `200` — Success
- `201` — Created
- `400` — Bad request / validation error
- `401` — Not authenticated
- `403` — Not authorized / not eligible
- `404` — Resource not found
- `409` — Conflict (duplicate)
- `422` — Unprocessable entity (business rule violation)
- `500` — Internal server error

---

## 5.1 Auth APIs

### POST `/api/auth/signup`

| Field | Detail |
|---|---|
| **Body** | `{ name: string, email: string, password: string }` |
| **Validation** | name: required, 2-100 chars. email: required, valid format, unique. password: required, min 8 chars |
| **Response 201** | `{ message: "Account created. Please verify your email." }` |
| **Errors** | `409 EMAIL_EXISTS` — email already registered. `422 VALIDATION_ERROR` — field-level errors |
| **Logic** | 1. Validate fields → 2. Check email uniqueness → 3. Hash password (bcrypt, 12 rounds) → 4. Create User (role=PARTICIPANT, isVerified=false) → 5. Send verification email → 6. Return success |

### POST `/api/auth/login`

| Field | Detail |
|---|---|
| **Body** | `{ email: string, password: string }` |
| **Response 200** | `{ accessToken: "jwt...", user: { id, name, email, role, avatar, isVerified } }` |
| **Cookie Set** | `refreshToken` HTTP-only cookie (7d) |
| **Errors** | `401 INVALID_CREDENTIALS` — wrong email or password. `403 NOT_VERIFIED` — email not verified |
| **Logic** | 1. Find user by email → 2. Compare bcrypt hash → 3. Check isVerified → 4. Generate accessToken (15min) → 5. Generate refreshToken → 6. Store refreshToken in DB → 7. Set cookie → 8. Return accessToken + user |

### POST `/api/auth/logout`

| Field | Detail |
|---|---|
| **Auth** | requireAuth |
| **Body** | None |
| **Response 200** | `{ message: "Logged out" }` |
| **Cookie** | Cleared |
| **Logic** | 1. Read refreshToken from cookie → 2. Delete from DB → 3. Clear cookie → 4. Return success |

### POST `/api/auth/refresh`

| Field | Detail |
|---|---|
| **Body** | None (reads cookie) |
| **Response 200** | `{ accessToken: "new_jwt..." }` |
| **Errors** | `401 INVALID_REFRESH` — cookie missing, token not in DB, or expired |
| **Logic** | 1. Read refreshToken from cookie → 2. Verify JWT → 3. Find in DB, check not expired → 4. Generate new accessToken → 5. Return |

### POST `/api/auth/forgot-password`

| Field | Detail |
|---|---|
| **Body** | `{ email: string }` |
| **Response 200** | `{ message: "If account exists, OTP sent" }` (always 200, no email enumeration) |
| **Logic** | 1. Find user by email → 2. If exists: generate 6-digit OTP → 3. Delete old OTPs for this email → 4. Store OTP (15min expiry) → 5. Send email → 6. Return generic success |

### POST `/api/auth/verify-otp`

| Field | Detail |
|---|---|
| **Body** | `{ email: string, otp: string }` |
| **Response 200** | `{ verified: true, resetToken: "short_lived_jwt" }` |
| **Errors** | `400 INVALID_OTP` — wrong OTP or expired |
| **Logic** | 1. Find OTP by email + otp → 2. Check not expired → 3. Generate short-lived resetToken (10min JWT with email) → 4. Return |

### POST `/api/auth/reset-password`

| Field | Detail |
|---|---|
| **Body** | `{ resetToken: string, newPassword: string }` |
| **Response 200** | `{ message: "Password reset successful" }` |
| **Errors** | `401 INVALID_RESET_TOKEN`. `422 VALIDATION_ERROR` — password too short |
| **Logic** | 1. Verify resetToken JWT → 2. Extract email → 3. Hash new password → 4. Update user → 5. Delete all OTPs for email → 6. Delete all RefreshTokens for user (force re-login everywhere) |

### POST `/api/auth/setup-password`

| Field | Detail |
|---|---|
| **Body** | `{ token: string, password: string }` |
| **Response 200** | `{ accessToken, user }` + sets refreshToken cookie (auto-login) |
| **Errors** | `401 INVALID_SETUP_TOKEN` — not found, expired, or already used |
| **Logic** | 1. Find SetupPasswordToken by token → 2. Check not expired, not used → 3. Hash password → 4. Update user (password, isVerified=true) → 5. Mark token usedAt=now → 6. Generate accessToken + refreshToken → 7. Return (same as login response) |

### GET `/api/auth/me`

| Field | Detail |
|---|---|
| **Auth** | requireAuth |
| **Response 200** | `{ id, name, email, role, avatar, phone, institution, year, branch, rollNo, isVerified }` |
| **Errors** | `401` — not authenticated |

---

## 5.2 Public Event APIs

### GET `/api/events`

| Field | Detail |
|---|---|
| **Auth** | None (public) |
| **Query Params** | `?status=UPCOMING&mode=IN_PERSON&search=hack&sort=newest&page=1&limit=12` |
| **Response 200** | `{ items: [EventSummary], total, page, limit }` |
| **EventSummary shape** | `{ id, slug, title, tagline, coverImage, logo, venue, mode, eventDate, registrationOpen, registrationDeadline, participationMode, status, prizePool, entryFee, maxParticipants }` |
| **Filter logic** | Only return events where `isPublic=true` AND `status != DRAFT`. Apply query filters. Sort by eventDate DESC (newest), prizePool DESC, or registrationDeadline ASC (closing soon) |

### GET `/api/events/:slug`

| Field | Detail |
|---|---|
| **Auth** | None (public) |
| **Response 200** | Full event detail including nested relations |
| **Shape** | `{ ...allEventFields, rounds: [Round], prizes: [Prize], tracks: [Track], judges: [{ name, bio, avatar }] (if hasJudging && resultsPublished), settings: { registrationOpen, submissionsOpen, leaderboardVisible, checkInEnabled, resultsPublished } }` |
| **Errors** | `404 EVENT_NOT_FOUND` |
| **Logic** | 1. Find by slug where isPublic=true OR requester is admin → 2. Include rounds (ordered), prizes, tracks, settings (selected fields only — no internal flags) → 3. If hasJudging AND resultsPublished, include judge names/bios → 4. Return |

### GET `/api/events/:slug/check-rollno`

| Field | Detail |
|---|---|
| **Auth** | None |
| **Query** | `?rollNo=22BCE1234` |
| **Response 200** | `{ taken: true/false, eventSlug }` |
| **Logic** | Check TeamMember where rollNo AND eventId (via slug lookup). Also check Registration where userId matches a user with that rollNo. Return boolean |

---

## 5.3 Registration APIs

### POST `/api/events/:slug/register`

**This is the most critical endpoint. Must handle both solo and team registrations.**

| Field | Detail |
|---|---|
| **Auth** | Optional (logged-in user gets linked, anonymous users get account created) |
| **Body (Solo)** | `{ type: "solo", name, email, phone, rollNo?, year?, branch?, institution?, trackId?, hearAboutUs? }` |
| **Body (Team)** | `{ type: "team", teamName, teamSize, trackId?, hearAboutUs?, members: [{ name, rollNo, year, branch, email, phone, isLead }] }` |
| **Response 201** | `{ registrationId: "FP26-S-0001", type: "solo"|"team", teamName?, qrCode?, message }` |

**Validation checks (in order, fail-fast):**

| # | Check | Error |
|---|---|---|
| 1 | Event exists and isPublic=true | `404 EVENT_NOT_FOUND` |
| 2 | Event.registrationOpen=true | `403 REGISTRATION_CLOSED` |
| 3 | Current time < registrationDeadline (if set) | `403 REGISTRATION_CLOSED` |
| 4 | Event.participationMode allows this type | `422 INVALID_PARTICIPATION_TYPE` |
| 5 | Team: teamSize between teamSizeMin and teamSizeMax | `422 INVALID_TEAM_SIZE` |
| 6 | Team: members.length === teamSize | `422 MEMBER_COUNT_MISMATCH` |
| 7 | Team: exactly one isLead=true | `422 MISSING_TEAM_LEAD` |
| 8 | All required fields present per member | `422 VALIDATION_ERROR` (field-level) |
| 9 | All rollNos unique within this payload | `422 DUPLICATE_ROLLNO_IN_PAYLOAD` |
| 10 | DB: no existing registration for same user+event (solo) | `409 ALREADY_REGISTERED` |
| 11 | DB: no existing TeamMember with same rollNo in this event | `409 DUPLICATE_ROLLNO` (include which rollNo) |
| 12 | Current registration count < maxParticipants (if set) | `422 EVENT_FULL` |
| 13 | If hasTracks, trackId must be valid track for this event | `422 INVALID_TRACK` |

**Business logic (all inside a single Prisma `$transaction`):**

**Solo registration:**
1. Generate registrationId: `{EVENT_PREFIX}-S-{SEQUENCE}` (e.g., `FP26-S-0001`)
2. Find or create User by email → if new: create with temp password, queue setup-password email
3. Create `Registration` record with userId, eventId, status based on registrationMode:
   - `OPEN_ACCESS` → `SHORTLISTED`
   - `APPLICATION_REVIEW` → `PENDING`
   - `INVITE_ONLY` → should not reach here (form not shown)
4. If `requiresCheckIn` → generate QR token, store in `qrCode`
5. Log email → Send confirmation email
6. Return registrationId

**Team registration:**
1. Generate registrationId: `{EVENT_PREFIX}-T-{SEQUENCE}` (e.g., `FP26-T-0001`)
2. Create `Team` record with status based on registrationMode (same as solo)
3. For each member:
   a. Find existing User by email
   b. If no User exists AND member.isLead: create User with temp password, queue setup-password email
   c. Create `TeamMember` with teamId, userId (if found/created)
4. If `requiresCheckIn` → generate QR token
5. Log email → Send confirmation email to lead
6. Return registrationId + teamName

**Registration ID generation:**
```
Pattern: {PREFIX}-{TYPE}-{SEQUENCE}
PREFIX: derived from event slug, e.g., "FP26" for founders-pit-2026
TYPE: "S" (solo) or "T" (team)
SEQUENCE: 4-digit zero-padded, auto-increment per event per type

Implementation: COUNT existing registrations/teams for this event of same type, +1, pad
Must be inside transaction to avoid race conditions
```

---

## 5.4 Participant APIs

### GET `/api/participant/:slug/registration`

| Field | Detail |
|---|---|
| **Auth** | requireAuth (PARTICIPANT) |
| **Response 200 (solo)** | `{ type: "solo", id, registrationId, status, trackId, trackName, hearAboutUs, checkInStatus, checkInTime, qrCode, submittedAt, user: { name, email, phone, rollNo, year, branch } }` |
| **Response 200 (team)** | `{ type: "team", id, registrationId, teamName, teamSize, status, trackId, trackName, checkInStatus, qrCode, submittedAt, members: [{ name, rollNo, year, branch, email, phone, isLead }], submissions: [{ roundId, roundName, fileUrl, fileName, submittedAt }] }` |
| **Errors** | `404 REGISTRATION_NOT_FOUND` — user not registered for this event |
| **Logic** | 1. Find event by slug → 2. Check Registration table for userId+eventId (solo) → 3. If not found, check TeamMember for userId+eventId (team, via join) → 4. Return appropriate shape with `type` discriminator |

### PATCH `/api/participant/:slug/registration`

| Field | Detail |
|---|---|
| **Auth** | requireAuth (PARTICIPANT) |
| **Body (solo)** | `{ phone?, institution? }` (limited editable fields) |
| **Body (team)** | `{ teamName?, members?: [{ id, name, phone }] }` (limited fields) |
| **Response 200** | Updated registration |
| **Errors** | `403 EDIT_NOT_ALLOWED` — status is not PENDING. `404 REGISTRATION_NOT_FOUND` |
| **Logic** | Only allowed if status=PENDING AND registrationMode=APPLICATION_REVIEW. Team edits: only team lead can edit. Cannot change rollNo, email, or team size after submission |

### POST `/api/participant/:slug/submit/:roundId`

| Field | Detail |
|---|---|
| **Auth** | requireAuth + requireShortlisted |
| **Content-Type** | `multipart/form-data` (for FILE/MIXED) or `application/json` (for LINK/FORM) |
| **Body** | `file` (multer), `externalLink`, `formData`, `trackId?` |
| **Response 200** | `{ id, type, fileUrl?, fileName?, fileSize?, externalLink?, submittedAt }` |
| **Errors** | `403 NOT_ELIGIBLE` — not shortlisted. `403 SUBMISSIONS_CLOSED` — deadline passed or submissionsOpen=false. `422 INVALID_FILE_TYPE`. `422 FILE_TOO_LARGE`. `404 ROUND_NOT_FOUND` |

**Logic:**
1. Find event + round by slug + roundId
2. Validate: round.submissionRequired=true, round.isActive=true
3. Validate: submissionsOpen=true (EventSettings) AND now < round.submissionDeadline
4. Validate submission type matches round.submissionType:
   - `FILE` → file required, validate type against `acceptedFileTypes`, size against `maxFileSize`
   - `LINK` → externalLink required, validate URL format
   - `FORM` → formData required, validate JSON
   - `MIXED` → at least one of file or link required
5. If FILE: upload to Cloudinary → get URL
6. Upsert Submission (unique on teamId/registrationId + roundId):
   - If exists: update fileUrl, fileName, fileSize, externalLink, formData, submittedAt
   - If new: create
7. Send submission confirmation email (if notifyOnSubmission=true)
8. Return submission details

### GET `/api/participant/:slug/submissions`

| Field | Detail |
|---|---|
| **Auth** | requireAuth |
| **Response 200** | `{ submissions: [{ id, roundId, roundName, type, fileUrl, fileName, fileSize, externalLink, submittedAt, score? }] }` |
| **Logic** | Find all submissions for this user's team/registration in this event. Include round name. Only show score if resultsPublished=true |

---

## 5.5 Admin APIs — Platform

### GET `/api/admin/stats`

| Field | Detail |
|---|---|
| **Auth** | requireAuth + requireRole(SUPER_ADMIN) |
| **Response 200** | `{ totalEvents, activeEvents, totalRegistrations, totalParticipants }` |
| **Logic** | Aggregate counts across all events. totalParticipants = sum of solo registrations + sum of all team members |

### GET `/api/admin/events`

| Field | Detail |
|---|---|
| **Auth** | requireAuth + requireRole(EVENT_ADMIN, SUPER_ADMIN) |
| **Response 200** | `{ items: [{ id, slug, title, eventDate, mode, registrationMode, status, participationMode, isPublic, registrationCount }] }` |
| **Logic** | SUPER_ADMIN sees all. EVENT_ADMIN sees only assigned events (future: EventAdmin relation). Include registration count per event |

### POST `/api/admin/events`

| Field | Detail |
|---|---|
| **Auth** | requireAuth + requireRole(SUPER_ADMIN) |
| **Body** | Full event creation payload (all Event fields + nested rounds, prizes, tracks, judging criteria) |
| **Response 201** | `{ event: { id, slug, ...allFields } }` |
| **Logic** | 1. Validate slug uniqueness → 2. Create Event → 3. Create Rounds (with criteria if hasJudging) → 4. Create Prizes → 5. Create Tracks (if hasTracks) → 6. Create EventSettings with defaults → 7. If hasJudging, create JudgeAssignments → 8. Return. All in transaction |

### GET `/api/admin/events/:slug`

| Field | Detail |
|---|---|
| **Auth** | requireAuth + requireRole(EVENT_ADMIN, SUPER_ADMIN) |
| **Response 200** | `{ ...allEventFields, rounds, prizes, tracks, settings, stats: { totalRegistrations, shortlisted, submitted, checkedIn, daysToEvent } }` |
| **Logic** | Full event with stats computed from DB aggregations. `daysToEvent = ceil((eventDate - now) / 86400000)` |

### PATCH `/api/admin/events/:slug`

| Field | Detail |
|---|---|
| **Auth** | requireAuth + requireRole(EVENT_ADMIN, SUPER_ADMIN) |
| **Body** | Partial event fields to update |
| **Response 200** | Updated event |

### PATCH `/api/admin/events/:slug/settings`

| Field | Detail |
|---|---|
| **Auth** | requireAuth + requireRole(EVENT_ADMIN, SUPER_ADMIN) |
| **Body** | `{ toggles?, deadlines?, limits?, communications?, automation? }` (structured payload) |
| **Response 200** | Full updated settings in structured format |
| **Logic** | 1. Flatten structured payload into DB columns → 2. Update EventSettings → 3. Set updatedBy to current user → 4. Re-read and return in structured format. Limits fields (teamSizeMin, teamSizeMax, maxParticipants) update the Event model, not EventSettings |

---

## 5.6 Admin APIs — Registrations

### GET `/api/admin/events/:slug/registrations`

| Field | Detail |
|---|---|
| **Auth** | requireAuth + requireRole(EVENT_ADMIN, SUPER_ADMIN) |
| **Query** | `?status=PENDING&year=2nd&branch=CSE&track=trackId&type=solo|team&search=query&page=1&limit=20` |
| **Response 200** | Unified array with type discriminator |

**Response shape:**
```json
{
  "items": [
    {
      "id": "cuid",
      "type": "team",
      "registrationId": "FP26-T-0001",
      "name": "Team Alpha",        // teamName for teams, user name for solo
      "size": 3,                    // 1 for solo
      "leadName": "John",
      "leadEmail": "john@jss.edu",
      "year": "2nd",               // lead's year
      "branch": "CSE",             // lead's branch
      "trackName": "FinTech",
      "status": "PENDING",
      "checkInStatus": false,
      "hasSubmission": true,
      "submittedAt": "ISO date"
    }
  ],
  "total": 47,
  "page": 1,
  "limit": 20,
  "filters": { "statuses": [...], "years": [...], "branches": [...], "tracks": [...] }
}
```

**Logic:** Union query: fetch from both `Registration` (solo) and `Team` (team) tables, normalize into unified shape, apply filters, paginate. `search` searches across name/teamName, rollNo, email, registrationId.

### GET `/api/admin/events/:slug/registrations/:id`

| Field | Detail |
|---|---|
| **Response 200 (team)** | `{ type: "team", ...teamFields, members: [...], submissions: [...], emailHistory: [...] }` |
| **Response 200 (solo)** | `{ type: "solo", ...regFields, user: {...}, submissions: [...], emailHistory: [...] }` |
| **Logic** | Try Team first (by id), then Registration. Include all members, all submissions for this team/reg, email logs filtered by recipient |

### PATCH `/api/admin/events/:slug/registrations/:id`

| Field | Detail |
|---|---|
| **Body** | `{ status: "SHORTLISTED", notes?: "strong application" }` |
| **Response 200** | Updated record |
| **Logic** | 1. Update status → 2. If notifyOnStatusChange=true, send status email → 3. Log EmailLog → 4. If OPEN_ACCESS event and autoOpenSubmissions=true, this is a no-op (already shortlisted) |

### POST `/api/admin/events/:slug/registrations/bulk`

| Field | Detail |
|---|---|
| **Body** | `{ ids: [string], status: "SHORTLISTED"|"WAITLISTED"|"REJECTED" }` |
| **Response 200** | `{ updated: 24, emailsSent: 24 }` |
| **Logic** | 1. Validate all IDs belong to this event → 2. Batch update status → 3. Batch send emails (Resend supports batch) → 4. Log all emails → 5. Return counts |

### GET `/api/admin/events/:slug/registrations/export`

| Field | Detail |
|---|---|
| **Response** | CSV file download (`Content-Type: text/csv`) |
| **Columns** | Reg ID, Type, Name/Team Name, Size, Status, Track, Member 1 Name, Member 1 Roll No, Member 1 Year, Member 1 Branch, Member 1 Email, Member 1 Phone, ...(all members), Submitted At |

### POST `/api/admin/events/:slug/registrations/checkin/:id`

| Field | Detail |
|---|---|
| **Body** | `{ type?: "manual"|"walkin" }` |
| **Response 200** | `{ checkInStatus: true, checkInTime: "ISO" }` |
| **Logic** | 1. Find team/registration by id → 2. Set checkInStatus=true, checkInTime=now → 3. Update status to CHECKED_IN → 4. Return |

---

## 5.7 Admin APIs — Submissions

### GET `/api/admin/events/:slug/submissions`

| Field | Detail |
|---|---|
| **Query** | `?round=roundId&track=trackId&status=submitted|not_submitted&reviewer=userId&page=1&limit=20` |
| **Response 200** | `{ items: [{ id, teamName/participantName, registrationId, roundName, trackName, type, fileUrl, fileName, fileSize, externalLink, reviewedBy, reviewerName, score, reviewNotes, submittedAt }], total, stats: { totalSubmitted, pendingReview, reviewed, avgScore } }` |

### PATCH `/api/admin/events/:slug/submissions/:id`

| Field | Detail |
|---|---|
| **Body** | `{ reviewNotes?, reviewedBy?, score?, track? }` |
| **Response 200** | Updated submission |

### GET `/api/admin/events/:slug/submissions/export`

| Field | Detail |
|---|---|
| **Response** | ZIP file of all uploaded submission files, named `{registrationId}_{roundName}.{ext}` |

---

## 5.8 Admin APIs — Judging

### GET `/api/admin/events/:slug/judges`
Returns: All JudgeAssignments for this event with user details and scoring progress.

### POST `/api/admin/events/:slug/judges`
**Body:** `{ name, email, bio?, trackId? }`  
**Logic:** 1. Find/create User with role=JUDGE → 2. Create JudgeAssignment → 3. If new user: create SetupPasswordToken, send invite email with portal link → 4. Return assignment

### DELETE `/api/admin/events/:slug/judges/:judgeId`
Removes judge assignment (not the user account). Cascades judge scores if needed.

### GET `/api/admin/events/:slug/scores`
**Response:** Aggregated scores per submission. Per submission: team/participant name, per-judge scores, weighted average, final rank. Includes normalization if enabled.

### POST `/api/admin/events/:slug/results/publish`
**Logic:** 1. Set `resultsPublished=true` on EventSettings → 2. Set `resultsPublished=true` on relevant rounds → 3. Send "Results Announced" email to all registered participants → 4. Return

---

## 5.9 Admin APIs — Check-In

### GET `/api/admin/events/:slug/checkin`
**Response:** `{ stats: { expected, checkedIn, notYet, walkIns }, log: [{ time, name, registrationId, type, staff }] }`

### POST `/api/admin/events/:slug/checkin/scan`
**Body:** `{ qrToken: string }`  
**Logic:** 1. Find Registration or Team by qrCode → 2. If already checked in, return `409 ALREADY_CHECKED_IN` → 3. Set checkInStatus=true, checkInTime=now, status=CHECKED_IN → 4. Return participant/team details

### GET `/api/admin/events/:slug/checkin/export`
**Response:** CSV attendance report: Name, Reg ID, Type, Check-In Time, Method (QR/Manual/Walk-in)

---

## 5.10 Admin APIs — Communications

### GET `/api/admin/events/:slug/emails`
**Response:** `{ items: [{ id, type, subject, recipient, status, sentAt }], total }`

### POST `/api/admin/events/:slug/emails/send`
**Body:** `{ to: "all"|"shortlisted"|"waitlisted"|"rejected"|"checked_in"|"not_checked_in"|"submitted"|"not_submitted"|"by_track", trackId?, subject, body, templateId?, scheduledFor? }`  
**Logic:** 1. Resolve recipient list based on `to` filter → 2. Replace template variables → 3. If scheduledFor: queue (initially just send immediately, scheduled = future scope) → 4. Batch send via Resend → 5. Log each in EmailLog → 6. Return `{ sent: count, failed: count }`

### GET `/api/admin/events/:slug/emails/templates`
**Response:** `{ templates: [{ id, name, subject, body, variables }] }`  
Returns all built-in templates with variable placeholders.

---

## 5.11 Judge Portal APIs

### GET `/api/judging/:slug/submissions`
**Auth:** requireAuth + requireRole(JUDGE)  
**Logic:** 1. Verify judge is assigned to this event → 2. Return submissions for the judge's assigned track (or all if no track-specific assignment) → 3. Include existing scores by this judge

### POST `/api/judging/:slug/scores`
**Body:** `{ submissionId, scores: [{ criteriaId, score, comment? }] }`  
**Validation:** Each score <= criteria.maxScore. Judge must be assigned to this event. JudgingOpen must be true in EventSettings.  
**Logic:** Upsert JudgeScore records (unique on submissionId+judgeId+criteriaId). Return saved scores.

### PATCH `/api/judging/:slug/scores/:id`
**Body:** `{ score, comment? }`  
Only allowed while judgingOpen=true. Judge can only edit their own scores.

### GET `/api/judging/:slug/progress`
**Response:** `{ total: 30, scored: 18, remaining: 12, percentage: 60 }`

---

## 5.12 Auction Module APIs (Standalone)

**Auth:** Separate password-based auth (NOT main JWT). Header: `X-Auction-Password: <password>`

### GET `/api/auction/:slug/init`
Load all SHORTLISTED teams + all Problems for this event. Sets up initial state.

### GET `/api/auction/:slug/leaderboard`
**Auth:** None (public). Returns all teams sorted by pointBalance DESC with problem assignments.

### POST `/api/auction/:slug/bid`
**Body:** `{ teamId, problemId, amount }`  
**Validation:** amount <= team.pointBalance. amount > 0.  
**Logic:** Transaction: deduct points → create PointTransaction → return new balance.

### POST `/api/auction/:slug/adjust`
**Body:** `{ teamId, amount, reason }` (reason required)  
Adds or deducts (negative amount) points with logging.

### POST `/api/auction/:slug/assign`
**Body:** `{ problemId, teamId }`  
Sets Problem.assignedTeamId and Team.problemWon.

### POST `/api/auction/:slug/undo`
Reverses the last PointTransaction for any team. Returns reversed amount.

### POST `/api/auction/:slug/reset`
Requires additional password confirmation. Resets all teams to 1000 points. Deletes all PointTransactions for this event.

### GET `/api/auction/:slug/transactions`
Full transaction log sorted by createdAt DESC.

### GET `/api/auction/:slug/export`
CSV: Team Name, Final Points, Problem Won, All Transactions.

---

*Continued in Part 3: Critical Flows, Business Logic, File Upload, Email System, Error Handling, NFRs, Development Roadmap*
