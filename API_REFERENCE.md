# API Reference

Base URL: `/`
Primary response envelope:

```json
{ "success": true, "data": {} }
```

Error envelope:

```json
{ "success": false, "error": { "code": "ERROR_CODE", "message": "Human-readable message" } }
```

Common platform errors (can apply to any endpoint):
- `429 RATE_LIMITED`: request throttled by rate limiter.
- `400 INVALID_JSON`: malformed JSON body.
- `403 CORS_BLOCKED`: disallowed origin.
- `404 ROUTE_NOT_FOUND`: unknown route.
- `500 INTERNAL_SERVER_ERROR`: unhandled server error.

---

## System

### GET /

- Description: Service health check.
- Auth: Public

**Body:** none

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "status": "ok", "service": "edcjssun-backend", "timestamp": "ISO_DATE" } }
```

**Errors:**
- 429 RATE_LIMITED

**Logic:**
- Returns service heartbeat with timestamp.

---

### GET /health

- Description: Service health check (alternate endpoint).
- Auth: Public

**Body:** none

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "status": "ok", "service": "edcjssun-backend", "timestamp": "ISO_DATE" } }
```

**Errors:**
- 429 RATE_LIMITED

**Logic:**
- Same behavior as `/`.

---

## Auth

### POST /api/auth/signup

- Description: Create participant account.
- Auth: Public

**Body:**

```json
{ "name": "string(2-100)", "email": "valid email", "password": "string(min 8)" }
```

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "message": "Account created. Please verify your email." } }
```

**Errors:**
- 422 VALIDATION_ERROR
- 409 EMAIL_EXISTS
- 429 RATE_LIMITED
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Normalizes email to lowercase.
- Creates user with role `PARTICIPANT`, `isVerified=false`.
- Password hashed with bcrypt.

---

### POST /api/auth/login

- Description: User login.
- Auth: Public

**Body:**

```json
{ "email": "string", "password": "string" }
```

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "accessToken": "jwt", "user": { "id": "...", "role": "..." } } }
```

**Errors:**
- 400 VALIDATION_ERROR
- 401 INVALID_CREDENTIALS
- 403 NOT_VERIFIED
- 429 RATE_LIMITED
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Validates credentials.
- Requires verified email.
- Issues access token and refresh token.
- Stores refresh token in DB and sets `refreshToken` cookie.

---

### POST /api/auth/logout

- Description: Logout user and clear refresh token.
- Auth: Public (cookie-based)

**Body:** none

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "message": "Logged out" } }
```

**Errors:**
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Deletes matching refresh token from DB if present.
- Clears refresh cookie.

---

### POST /api/auth/refresh

- Description: Exchange refresh cookie for new access token.
- Auth: Public (requires refresh cookie)

**Body:** none

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "accessToken": "jwt" } }
```

**Errors:**
- 401 INVALID_REFRESH

**Logic:**
- Verifies refresh JWT.
- Ensures token exists and is not expired in DB.
- Loads user to get current role.

---

### GET /api/auth/me

- Description: Get current authenticated user profile.
- Auth: requireAuth

**Body:** none

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "id": "...", "name": "...", "email": "...", "role": "...", "isVerified": true } }
```

**Errors:**
- 401 MISSING_TOKEN | INVALID_TOKEN | USER_NOT_FOUND
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Requires Bearer token.
- Returns profile from `req.user` populated by middleware.

---

### POST /api/auth/forgot-password

- Description: Start password reset via OTP email.
- Auth: Public

**Body:**

```json
{ "email": "string" }
```

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "message": "If account exists, OTP sent" } }
```

**Errors:**
- 429 RATE_LIMITED
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Always returns success message (prevents email enumeration).
- If user exists, stores OTP (15 min) and sends email.

---

### POST /api/auth/verify-otp

- Description: Verify OTP and issue short-lived reset token.
- Auth: Public

**Body:**

```json
{ "email": "string", "otp": "string" }
```

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "verified": true, "resetToken": "jwt" } }
```

**Errors:**
- 400 VALIDATION_ERROR
- 400 INVALID_OTP
- 429 RATE_LIMITED
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Verifies latest OTP for email and expiry.
- Returns reset token (JWT) on success.

---

### POST /api/auth/reset-password

- Description: Reset password using reset token.
- Auth: Public

**Body:**

```json
{ "resetToken": "string", "newPassword": "string(min 8)" }
```

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "message": "Password reset successful" } }
```

**Errors:**
- 401 INVALID_RESET_TOKEN
- 422 VALIDATION_ERROR
- 429 RATE_LIMITED
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Verifies reset token.
- Updates password hash.
- Deletes OTP records and refresh tokens for user.

---

### POST /api/auth/setup-password

- Description: Set initial password from setup link and auto-login.
- Auth: Public

**Body:**

```json
{ "token": "string", "password": "string(min 8)" }
```

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "accessToken": "jwt", "user": { "id": "...", "role": "..." } } }
```

**Errors:**
- 401 INVALID_SETUP_TOKEN
- 422 VALIDATION_ERROR
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Setup token must exist, be unused, and unexpired.
- Marks user verified.
- Marks setup token used.
- Sets refresh cookie and returns access token.

---

## Events

### GET /api/events/

- Description: List public non-draft events.
- Auth: Public

**Body:** none

**Query params:** none

**Response:**

```json
{ "success": true, "data": [{ "slug": "...", "title": "..." }] }
```

**Errors:**
- 500 EVENTS_FETCH_FAILED

**Logic:**
- Returns events where `isPublic=true` and `status!=DRAFT`.

---

### GET /api/events/:slug

- Description: Get event details by slug.
- Auth: Public

**Body:** none

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "slug": "...", "rounds": [], "prizes": [], "settings": {} } }
```

**Errors:**
- 404 EVENT_NOT_FOUND
- 500 EVENT_FETCH_FAILED

**Logic:**
- Includes rounds, prizes, and settings in one payload.

---

### GET /api/events/:slug/rounds

- Description: Get rounds for an event.
- Auth: Public

**Body:** none

**Query params:** none

**Response:**

```json
{ "success": true, "data": [{ "id": "...", "name": "...", "order": 1 }] }
```

**Errors:**
- 404 EVENT_NOT_FOUND
- 500 ROUNDS_FETCH_FAILED

**Logic:**
- Returns rounds ordered ascending by `order`.

---

### GET /api/events/:slug/check-rollno

- Description: Check if roll number is already used in this event.
- Auth: Public

**Body:** none

**Query params:**
- `rollNo` (required)

**Response:**

```json
{ "success": true, "data": { "taken": false, "eventSlug": "event-slug" } }
```

**Errors:**
- 400 ROLLNO_REQUIRED
- 404 EVENT_NOT_FOUND
- 429 RATE_LIMITED
- 500 ROLLNO_CHECK_FAILED

**Logic:**
- Checks both solo registrations and team members for same event.

---

### POST /api/events/:slug/register

- Description: Register as solo or team.
- Auth: Public

**Body:**

```json
{
  "type": "solo|team",
  "name": "solo name",
  "email": "solo email",
  "teamName": "for teams",
  "teamSize": 3,
  "members": [{ "name": "...", "email": "...", "isLead": true }],
  "trackId": "optional",
  "hearAboutUs": "optional"
}
```

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "registrationId": "EDC-...", "type": "solo|team", "message": "Registration successful" } }
```

**Errors:**
- 422 VALIDATION_ERROR
- 422 INVALID_PARTICIPATION_TYPE
- 422 INVALID_TRACK
- 422 EVENT_FULL
- 403 REGISTRATION_CLOSED
- 403 REGISTRATION_NOT_AVAILABLE
- 409 ALREADY_REGISTERED
- 409 DUPLICATE_ROLLNO
- 404 EVENT_NOT_FOUND
- 429 RATE_LIMITED
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Enforces registration window and event mode.
- Enforces team-size boundaries and exactly one team lead.
- Prevents cross-registration (same user in solo and team for same event).
- Generates registration ID and optional QR token.
- Initial status from registration mode:
  - `OPEN_ACCESS -> SHORTLISTED`
  - `APPLICATION_REVIEW/INVITE_ONLY -> PENDING`

---

## Participant

### GET /api/participant/:slug/registration

- Description: Fetch current user registration (solo/team) and submissions.
- Auth: requireAuth

**Body:** none

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "type": "solo|team", "registrationId": "...", "status": "...", "submissions": [] } }
```

**Errors:**
- 401 MISSING_TOKEN | INVALID_TOKEN | USER_NOT_FOUND
- 404 EVENT_NOT_FOUND
- 404 REGISTRATION_NOT_FOUND
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Resolves solo first, then team membership.
- Score visibility depends on `event.settings.resultsPublished`.

---

### PATCH /api/participant/:slug/registration

- Description: Update limited registration fields.
- Auth: requireAuth

**Body:**

```json
{
  "phone": "optional",
  "institution": "optional",
  "hearAboutUs": "optional",
  "teamName": "team lead only",
  "members": [{ "id": "memberId", "name": "optional", "phone": "optional" }]
}
```

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "message": "Registration updated" } }
```

**Errors:**
- 401 MISSING_TOKEN | INVALID_TOKEN | USER_NOT_FOUND
- 404 EVENT_NOT_FOUND
- 404 REGISTRATION_NOT_FOUND
- 403 EDIT_NOT_ALLOWED
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Editable only while status is `PENDING`.
- Team edits allowed only for team lead.
- For teams, only team name and member name/phone are editable.

---

### POST /api/participant/:slug/submit/:roundId

- Description: Create/update participant deliverable for a round.
- Auth: requireAuth + requireShortlisted

**Body:**

```json
{
  "externalLink": "optional",
  "formData": { "optional": true },
  "trackId": "optional"
}
```

File upload field:
- multipart `file` (optional/required based on submission type)

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "id": "submissionId", "type": "FILE|LINK|FORM|MIXED", "fileUrl": "...", "externalLink": "..." } }
```

**Errors:**
- 401 MISSING_TOKEN | INVALID_TOKEN | USER_NOT_FOUND
- 403 NOT_ELIGIBLE
- 404 EVENT_NOT_FOUND
- 404 ROUND_NOT_FOUND
- 422 SUBMISSION_NOT_REQUIRED
- 403 SUBMISSIONS_CLOSED
- 422 FILE_REQUIRED | LINK_REQUIRED | FORM_DATA_REQUIRED | CONTENT_REQUIRED
- 422 INVALID_FILE_TYPE | FILE_TOO_LARGE
- 500 UPLOAD_FAILED
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Eligibility by registration mode:
  - `OPEN_ACCESS`: registered users can submit.
  - Otherwise must be `SHORTLISTED` or `CHECKED_IN`.
- Enforces round active status and submission deadlines.
- Upserts per `(registrationId, roundId)` or `(teamId, roundId)`.

---

### GET /api/participant/:slug/submissions

- Description: Get all submissions for current user in event.
- Auth: requireAuth

**Body:** none

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "submissions": [{ "id": "...", "roundId": "...", "type": "..." }] } }
```

**Errors:**
- 401 MISSING_TOKEN | INVALID_TOKEN | USER_NOT_FOUND
- 404 EVENT_NOT_FOUND
- 404 REGISTRATION_NOT_FOUND
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Resolves solo or team context and lists submissions.
- Score field exposed only when results are published.

---

## Judging (Judge-facing)

### GET /api/judging/:slug/submissions

- Description: List submissions assigned to authenticated judge.
- Auth: requireRole (`JUDGE`)

**Body:** none

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "submissions": [{ "id": "...", "criteria": [], "myScores": [], "isScored": false }] } }
```

**Errors:**
- 401 MISSING_TOKEN | INVALID_TOKEN | USER_NOT_FOUND
- 403 INSUFFICIENT_ROLE
- 403 NOT_ASSIGNED
- 404 EVENT_NOT_FOUND
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Judge must have assignment for event.
- If judge assigned to a track, list is filtered by that track.

---

### POST /api/judging/:slug/scores

- Description: Submit or overwrite criterion scores for one submission.
- Auth: requireRole (`JUDGE`)

**Body:**

```json
{
  "submissionId": "string",
  "scores": [{ "criteriaId": "string", "score": 8.5, "comment": "optional" }]
}
```

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "scores": [{ "id": "...", "criteriaId": "...", "score": 8.5 }] } }
```

**Errors:**
- 403 JUDGING_CLOSED
- 403 NOT_ASSIGNED
- 404 EVENT_NOT_FOUND
- 404 SUBMISSION_NOT_FOUND
- 400 VALIDATION_ERROR
- 422 VALIDATION_ERROR
- 400 INVALID_CRITERIA
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Requires `event.settings.judgingOpen=true`.
- All round criteria must be scored.
- Score range must be `0..criterion.maxScore`.
- Upsert by `(submissionId, judgeId, criteriaId)`.

---

### PATCH /api/judging/:slug/scores/:id

- Description: Update one existing judge score.
- Auth: requireRole (`JUDGE`)

**Body:**

```json
{ "score": 9, "comment": "optional" }
```

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "id": "...", "score": 9, "comment": "..." } }
```

**Errors:**
- 403 JUDGING_CLOSED
- 403 NOT_AUTHORIZED
- 404 EVENT_NOT_FOUND
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Judge can edit only own score rows.
- Updates `scoredAt` timestamp.

---

### GET /api/judging/:slug/progress

- Description: Judge scoring completion metrics.
- Auth: requireRole (`JUDGE`)

**Body:** none

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "total": 20, "scored": 12, "remaining": 8, "percentage": 60 } }
```

**Errors:**
- 403 NOT_ASSIGNED
- 404 EVENT_NOT_FOUND
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Total scope filtered by judge track assignment if set.

---

## Admin - Platform & Event Management

All `/api/admin/*` routes:
- Auth: requireRole (`EVENT_ADMIN` or `SUPER_ADMIN`)
- Additional role checks are noted per endpoint.

### GET /api/admin/stats

- Description: Global platform stats.
- Auth: requireRole (`SUPER_ADMIN`)

**Body:** none

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "totalEvents": 0, "activeEvents": 0, "totalRegistrations": 0, "totalParticipants": 0 } }
```

**Errors:**
- 403 INSUFFICIENT_ROLE
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Aggregates counts across events, solo registrations, teams, and team members.

---

### GET /api/admin/events

- Description: List events for admin dashboard.
- Auth: requireRole (`EVENT_ADMIN|SUPER_ADMIN`)

**Body:** none

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "items": [{ "slug": "...", "registrationCount": 0 }] } }
```

**Errors:**
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Returns event metadata and computed registration count.

---

### POST /api/admin/events

- Description: Create event with nested rounds/criteria/prizes/tracks/settings.
- Auth: requireRole (`SUPER_ADMIN`)

**Body:**

```json
{
  "slug": "string",
  "title": "string",
  "description": "string",
  "eventDate": "ISO_DATE",
  "rounds": [],
  "prizes": [],
  "tracks": []
}
```

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "event": { "id": "...", "slug": "...", "rounds": [], "settings": {} } } }
```

**Errors:**
- 403 INSUFFICIENT_ROLE
- 409 SLUG_EXISTS
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Transactional create for event and related entities.
- Creates `eventSettings` defaults.

---

### GET /api/admin/events/:slug

- Description: Full admin event detail with computed stats.
- Auth: requireRole (`EVENT_ADMIN|SUPER_ADMIN`)

**Body:** none

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "slug": "...", "rounds": [], "settings": {}, "stats": { "totalRegistrations": 0 } } }
```

**Errors:**
- 404 EVENT_NOT_FOUND
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Adds aggregate stats (shortlisted, submitted, checked-in, daysToEvent).

---

### PATCH /api/admin/events/:slug

- Description: Patch event fields.
- Auth: requireRole (`EVENT_ADMIN|SUPER_ADMIN`)

**Body:**

```json
{ "title": "optional", "status": "optional", "registrationDeadline": "optional ISO_DATE|null" }
```

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "id": "...", "slug": "...", "title": "..." } }
```

**Errors:**
- 404 EVENT_NOT_FOUND
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Only allowed fields are updated.
- Date fields are parsed to Date objects.

---

### PATCH /api/admin/events/:slug/settings

- Description: Update event settings groups (toggles, deadlines, limits, communications, automation).
- Auth: requireRole (`EVENT_ADMIN|SUPER_ADMIN`)

**Body:**

```json
{
  "toggles": {},
  "deadlines": {},
  "limits": {},
  "communications": {},
  "automation": {}
}
```

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "toggles": {}, "deadlines": {}, "limits": {}, "communications": {}, "automation": {} } }
```

**Errors:**
- 404 EVENT_NOT_FOUND
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Upserts `eventSettings`.
- Syncs `registrationOpen` to `event.registrationOpen`.
- Some `limits` fields are on `event`, not `eventSettings`.

---

## Admin - Registration

### GET /api/admin/events/:slug/registrations

- Description: Paginated registration list (solo+team) with filters.
- Auth: requireRole (`EVENT_ADMIN|SUPER_ADMIN`)

**Body:** none

**Query params:**
- `status`, `year`, `branch`, `track`, `type`, `search`, `page`, `limit`

**Response:**

```json
{ "success": true, "data": { "items": [], "total": 0, "page": 1, "limit": 20, "filters": {} } }
```

**Errors:**
- 404 EVENT_NOT_FOUND
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Merges solo and team datasets.
- Supports search across name/email/rollNo/registrationId.

---

### GET /api/admin/events/:slug/registrations/export

- Description: Export registration data as CSV.
- Auth: requireRole (`EVENT_ADMIN|SUPER_ADMIN`)

**Body:** none

**Query params:** none

**Response:**
- `text/csv` attachment (`<slug>_registrations.csv`) or `No registrations` text.

**Errors:**
- 404 EVENT_NOT_FOUND
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Flattens solo/team records to CSV rows.

---

### GET /api/admin/events/:slug/registrations/:id

- Description: Get detailed registration/team record by ID.
- Auth: requireRole (`EVENT_ADMIN|SUPER_ADMIN`)

**Body:** none

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "type": "solo|team", "emailHistory": [] } }
```

**Errors:**
- 404 EVENT_NOT_FOUND
- 404 REGISTRATION_NOT_FOUND
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Tries team first, then solo registration.
- Includes recent email history.

---

### PATCH /api/admin/events/:slug/registrations/:id

- Description: Update a single registration/team status.
- Auth: requireRole (`EVENT_ADMIN|SUPER_ADMIN`)

**Body:**

```json
{ "status": "PENDING|SHORTLISTED|WAITLISTED|REJECTED|CHECKED_IN|DISQUALIFIED", "notes": "optional" }
```

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "id": "...", "status": "SHORTLISTED", "message": "Status updated" } }
```

**Errors:**
- 404 EVENT_NOT_FOUND
- 404 REGISTRATION_NOT_FOUND
- 422 INVALID_STATUS_TRANSITION
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Validates status transitions.
- Optionally sends status-change email when enabled.

---

### POST /api/admin/events/:slug/registrations/bulk

- Description: Bulk update registration/team statuses.
- Auth: requireRole (`EVENT_ADMIN|SUPER_ADMIN`)

**Body:**

```json
{ "ids": ["id1", "id2"], "status": "SHORTLISTED" }
```

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "updated": 10, "emailsSent": 8 } }
```

**Errors:**
- 400 VALIDATION_ERROR
- 422 VALIDATION_ERROR
- 404 EVENT_NOT_FOUND
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Skips non-existent/invalid-transition items.
- Sends batch status emails when enabled and template exists.

---

### POST /api/admin/events/:slug/registrations/checkin/:id

- Description: Manual check-in existing registration or create walk-in check-in.
- Auth: requireRole (`EVENT_ADMIN|SUPER_ADMIN`)

**Body:**

```json
{ "type": "manual|walkin", "name": "for walkin", "email": "for walkin" }
```

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "checkInStatus": true, "checkInTime": "ISO_DATE", "registrationId": "optional" } }
```

**Errors:**
- 404 EVENT_NOT_FOUND
- 404 REGISTRATION_NOT_FOUND
- 403 WALKINS_NOT_ALLOWED
- 400 VALIDATION_ERROR
- 409 ALREADY_CHECKED_IN
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Walk-in path requires `eventSettings.allowWalkIns`.
- Regular check-in sets status to `CHECKED_IN`.

---

## Admin - Submission Management

### GET /api/admin/events/:slug/submissions

- Description: Paginated submissions list with filters and stats.
- Auth: requireRole (`EVENT_ADMIN|SUPER_ADMIN`)

**Body:** none

**Query params:**
- `round`, `track`, `status`, `reviewer`, `page`, `limit`

**Response:**

```json
{ "success": true, "data": { "items": [], "total": 0, "page": 1, "limit": 20, "stats": {} } }
```

**Errors:**
- 404 EVENT_NOT_FOUND
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Includes related team/participant/round/track info.
- Returns review summary stats.

---

### GET /api/admin/events/:slug/submissions/export

- Description: Export file-based submissions metadata.
- Auth: requireRole (`EVENT_ADMIN|SUPER_ADMIN`)

**Body:** none

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "files": [], "total": 0 } }
```

**Errors:**
- 404 EVENT_NOT_FOUND
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Returns downloadable file URLs and metadata (not ZIP stream).

---

### PATCH /api/admin/events/:slug/submissions/:id

- Description: Patch submission review fields.
- Auth: requireRole (`EVENT_ADMIN|SUPER_ADMIN`)

**Body:**

```json
{ "reviewNotes": "optional", "reviewedBy": "optional", "score": 8.5, "track": "optional" }
```

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "id": "...", "score": 8.5 } }
```

**Errors:**
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Updates only provided fields.

---

## Admin - Judge Administration

### GET /api/admin/events/:slug/judges

- Description: List judge assignments for event.
- Auth: requireRole (`EVENT_ADMIN|SUPER_ADMIN`)

**Body:** none

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "judges": [{ "id": "...", "email": "...", "totalScores": 0 }] } }
```

**Errors:**
- 404 EVENT_NOT_FOUND
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Includes profile info and scoring count.

---

### POST /api/admin/events/:slug/judges

- Description: Add judge assignment; create/upgrade judge account if needed.
- Auth: requireRole (`EVENT_ADMIN|SUPER_ADMIN`)

**Body:**

```json
{ "name": "string", "email": "string", "bio": "optional", "trackId": "optional" }
```

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "id": "assignmentId", "eventId": "...", "userId": "..." } }
```

**Errors:**
- 404 EVENT_NOT_FOUND
- 409 JUDGE_ALREADY_ASSIGNED
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- New users are created with `JUDGE` role and setup-password token.
- Existing `PARTICIPANT` can be upgraded to `JUDGE`.

---

### DELETE /api/admin/events/:slug/judges/:judgeId

- Description: Remove judge assignment and related scores.
- Auth: requireRole (`EVENT_ADMIN|SUPER_ADMIN`)

**Body:** none

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "message": "Judge removed" } }
```

**Errors:**
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Deletes judge scores first, then assignment.

---

### GET /api/admin/events/:slug/scores

- Description: Aggregate ranked scores for event.
- Auth: requireRole (`EVENT_ADMIN|SUPER_ADMIN`)

**Body:** none

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "rankings": [{ "submissionId": "...", "name": "...", "registrationId": "..." }] } }
```

**Errors:**
- 404 EVENT_NOT_FOUND
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Uses weighted criteria + score aggregation service.
- Adds display names/registration IDs.

---

### POST /api/admin/events/:slug/results/publish

- Description: Publish results and notify participants.
- Auth: requireRole (`EVENT_ADMIN|SUPER_ADMIN`)

**Body:** none

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "message": "Results published" } }
```

**Errors:**
- 404 EVENT_NOT_FOUND
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Sets `eventSettings.resultsPublished=true` and `round.resultsPublished=true`.
- Sends announcement emails to solo and team leads.

---

## Admin - Check-in

### GET /api/admin/events/:slug/checkin

- Description: Check-in dashboard metrics and recent log.
- Auth: requireRole (`EVENT_ADMIN|SUPER_ADMIN`)

**Body:** none

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "stats": { "expected": 0, "checkedIn": 0, "notYet": 0, "walkIns": 0 }, "log": [] } }
```

**Errors:**
- 404 EVENT_NOT_FOUND
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Counts shortlisted/checked-in expected participants.
- Merges recent solo and team check-ins.

---

### POST /api/admin/events/:slug/checkin/scan

- Description: Check in participant/team by QR token.
- Auth: requireRole (`EVENT_ADMIN|SUPER_ADMIN`)

**Body:**

```json
{ "qrToken": "string" }
```

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "name": "...", "registrationId": "...", "checkInTime": "ISO_DATE" } }
```

**Errors:**
- 400 VALIDATION_ERROR
- 404 EVENT_NOT_FOUND
- 404 INVALID_QR
- 409 ALREADY_CHECKED_IN
- 403 NOT_ELIGIBLE
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Supports both solo and team QR records.
- Allowed pre-check-in statuses: `SHORTLISTED` or `PENDING`.

---

### GET /api/admin/events/:slug/checkin/export

- Description: Export check-in list CSV.
- Auth: requireRole (`EVENT_ADMIN|SUPER_ADMIN`)

**Body:** none

**Query params:** none

**Response:**
- `text/csv` attachment (`<slug>_checkin.csv`) or `No check-ins` text.

**Errors:**
- 404 EVENT_NOT_FOUND
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Exports checked-in solo and team lead entries.

---

## Admin - Email/Communication

### GET /api/admin/events/:slug/emails

- Description: Paginated email log for event.
- Auth: requireRole (`EVENT_ADMIN|SUPER_ADMIN`)

**Body:** none

**Query params:**
- `page`, `limit`

**Response:**

```json
{ "success": true, "data": { "items": [], "total": 0, "page": 1, "limit": 20 } }
```

**Errors:**
- 404 EVENT_NOT_FOUND
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Returns audit records from `emailLog`.

---

### POST /api/admin/events/:slug/emails/send

- Description: Send templated or custom bulk emails to filtered recipients.
- Auth: requireRole (`EVENT_ADMIN|SUPER_ADMIN`)

**Body:**

```json
{ "to": "all|shortlisted|waitlisted|rejected|checked_in|not_checked_in|by_track|submitted|not_submitted", "trackId": "optional", "templateId": "optional", "subject": "for custom", "body": "for custom" }
```

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "sent": 10, "failed": 1 } }
```

**Errors:**
- 404 EVENT_NOT_FOUND
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Resolves recipients from solo registrations + team leads.
- Uses template batch send unless `templateId` is `CUSTOM`.

---

### GET /api/admin/events/:slug/emails/templates

- Description: Get available email templates.
- Auth: requireRole (`EVENT_ADMIN|SUPER_ADMIN`)

**Body:** none

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "templates": [] } }
```

**Errors:**
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Returns template catalog from email service.

---

## Auction

### GET /api/auction/:slug/leaderboard

- Description: Public auction leaderboard.
- Auth: Public

**Body:** none

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "teams": [{ "teamName": "...", "pointBalance": 1000, "problemWon": null }] } }
```

**Errors:**
- 404 EVENT_NOT_FOUND
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Returns teams sorted by `pointBalance desc`.

---

All remaining auction endpoints require header:
- `X-Auction-Password: <AUCTION_PASSWORD>`
- Auth classification: requireAuth (auction password guard)

### GET /api/auction/:slug/init

- Description: Initialize auction dashboard data.
- Auth: requireAuth (auction password)

**Body:** none

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "teams": [], "problems": [] } }
```

**Errors:**
- 401 INVALID_AUCTION_AUTH
- 403 AUCTION_DISABLED
- 404 EVENT_NOT_FOUND
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Requires `event.auctionEnabled=true`.
- Includes shortlisted teams and ordered problems.

---

### POST /api/auction/:slug/bid

- Description: Deduct points for a team bid and log transaction.
- Auth: requireAuth (auction password)

**Body:**

```json
{ "teamId": "string", "problemId": "string", "amount": 100 }
```

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "newBalance": 900 } }
```

**Errors:**
- 401 INVALID_AUCTION_AUTH
- 400 INVALID_AMOUNT
- 400 INSUFFICIENT_POINTS
- 404 EVENT_NOT_FOUND
- 404 TEAM_NOT_FOUND
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Amount must be positive and within team balance.
- Writes negative `pointTransaction` entry.

---

### POST /api/auction/:slug/adjust

- Description: Manually adjust team points.
- Auth: requireAuth (auction password)

**Body:**

```json
{ "teamId": "string", "amount": 50, "reason": "string" }
```

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "newBalance": 1050 } }
```

**Errors:**
- 401 INVALID_AUCTION_AUTH
- 400 REASON_REQUIRED
- 404 EVENT_NOT_FOUND
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Persists adjustment transaction with admin note.

---

### POST /api/auction/:slug/assign

- Description: Assign problem to team and mark won problem.
- Auth: requireAuth (auction password)

**Body:**

```json
{ "problemId": "string", "teamId": "string" }
```

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "message": "Problem assigned" } }
```

**Errors:**
- 401 INVALID_AUCTION_AUTH
- 404 EVENT_NOT_FOUND
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Updates problem assignment and team `problemWon` in one transaction.

---

### POST /api/auction/:slug/undo

- Description: Reverse latest auction transaction.
- Auth: requireAuth (auction password)

**Body:** none

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "reversedAmount": -100, "message": "Last transaction reversed" } }
```

**Errors:**
- 401 INVALID_AUCTION_AUTH
- 404 EVENT_NOT_FOUND
- 404 NO_TRANSACTIONS
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Reverses latest transaction and logs compensating entry.

---

### POST /api/auction/:slug/reset

- Description: Reset auction state for an event.
- Auth: requireAuth (auction password)

**Body:**

```json
{ "confirmPassword": "string" }
```

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "message": "Auction reset complete" } }
```

**Errors:**
- 401 INVALID_AUCTION_AUTH
- 403 INVALID_CONFIRMATION
- 404 EVENT_NOT_FOUND
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Requires confirmation password match.
- Resets all team points to 1000, clears assignments, deletes transactions.

---

### GET /api/auction/:slug/transactions

- Description: List auction point transactions.
- Auth: requireAuth (auction password)

**Body:** none

**Query params:** none

**Response:**

```json
{ "success": true, "data": { "transactions": [] } }
```

**Errors:**
- 401 INVALID_AUCTION_AUTH
- 404 EVENT_NOT_FOUND
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Returns most recent transactions first with team metadata.

---

### GET /api/auction/:slug/export

- Description: Export auction summary as CSV.
- Auth: requireAuth (auction password)

**Body:** none

**Query params:** none

**Response:**
- `text/csv` attachment (`<slug>_auction.csv`) or `No data` text.

**Errors:**
- 401 INVALID_AUCTION_AUTH
- 404 EVENT_NOT_FOUND
- 500 INTERNAL_SERVER_ERROR

**Logic:**
- Builds per-team row with final balance, won problem, and transaction history.

---

## Coverage Verification

Implemented route files covered:
- `src/index.js` (`/`, `/health`, route mounts)
- `src/routes/auth.routes.js`
- `src/routes/events.routes.js`
- `src/routes/participant.routes.js`
- `src/routes/judging.routes.js`
- `src/routes/admin.routes.js`
- `src/routes/auction.routes.js`

Total documented endpoints:
- 2 system endpoints
- 9 auth endpoints
- 5 event/registration-public endpoints
- 4 participant endpoints
- 4 judge endpoints
- 26 admin endpoints
- 9 auction endpoints
- Total: 59 endpoints
