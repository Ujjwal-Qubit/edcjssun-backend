# EDC Event Management Platform — DEV 1 Backend PRD + SRS

**Document Version:** 1.0  
**Role:** DEV 1 — Backend, Database & APIs  
**Stack:** Node.js + Express | PostgreSQL | Prisma ORM | JWT Auth | Cloudinary | Resend  
**Canonical Source:** EDC_Platform_PRD_v2.md (all conflicts resolved in favour of v2)  
**Date:** April 2026

---

# 1. SYSTEM OVERVIEW

## 1.1 Product Summary (Backend Perspective)

The EDC Event Management Platform is a **generic, config-driven** event management system. The backend is the single source of truth for all data, business logic, and access control. It exposes a RESTful JSON API consumed by two frontend applications:

- **events.edcjssun.com** — Participant-facing (public events, registration, dashboard, submissions)
- **Admin portal** — Event administration (registrations management, shortlisting, judging, communications)

The backend also powers a **standalone Auction module** that shares the database but has its own authentication.

## 1.2 Core Responsibilities of Backend

| Responsibility | Scope |
|---|---|
| **Data persistence** | All PostgreSQL tables via Prisma ORM |
| **Authentication** | JWT access/refresh tokens, HTTP-only cookies, role-based access |
| **Business logic** | Registration rules, submission eligibility, deadline enforcement, status transitions |
| **File management** | Cloudinary upload/validation for submissions and event assets |
| **Email system** | Transactional emails via Resend — automated triggers + admin-initiated |
| **QR system** | Generate QR tokens on registration, validate on check-in scan |
| **Score aggregation** | Judge score collection, weighted aggregation, optional normalization |
| **API contracts** | Stable, documented JSON endpoints for all three frontend consumers |

## 1.3 System Boundaries

```
┌──────────────────────────────────────────────────────────┐
│                    BACKEND (api.edcjssun.com)             │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ Auth Module  │  │ Event/Reg    │  │ Admin Module   │  │
│  │ (JWT+Cookie) │  │ Module       │  │ (CRUD+Bulk)    │  │
│  └─────────────┘  └──────────────┘  └────────────────┘  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ Participant  │  │ Judging      │  │ Auction Module │  │
│  │ Module       │  │ Module       │  │ (Standalone)   │  │
│  └─────────────┘  └──────────────┘  └────────────────┘  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ Email Svc   │  │ Upload Svc   │  │ QR Svc         │  │
│  │ (Resend)    │  │ (Cloudinary) │  │ (qrcode npm)   │  │
│  └─────────────┘  └──────────────┘  └────────────────┘  │
│                                                          │
│                    PostgreSQL (Railway/Supabase)          │
└──────────────────────────────────────────────────────────┘
         ▲              ▲               ▲
         │              │               │
   events.edcjssun.com  Admin Portal    Auction Standalone
   (Participant FE)     (Admin FE)      (Separate Auth)
```

## 1.4 High-Level Architecture

```
Client Request
    │
    ▼
Express Router ── route file selects handler
    │
    ▼
Middleware Chain: cors → json → cookieParser → requireAuth? → requireRole?
    │
    ▼
Controller ── orchestrates business logic
    │
    ├──▶ Prisma ORM ──▶ PostgreSQL
    ├──▶ email.service.js ──▶ Resend API
    ├──▶ upload.service.js ──▶ Cloudinary API
    ├──▶ qr.service.js ──▶ QR token generation
    └──▶ scoring.service.js ──▶ Score aggregation
    │
    ▼
Standardized JSON Response → Client
```

---

# 2. ROLE OF DEV 1

## 2.1 Exact Ownership

| Area | Dev 1 Owns |
|---|---|
| Prisma schema | All models, migrations, seed scripts |
| Express app | Entry point, CORS, middleware pipeline |
| All route files | `auth`, `events`, `registration`, `participant`, `admin`, `judging`, `checkin`, `auction` |
| All controllers | Business logic for every endpoint |
| All middleware | `requireAuth`, `requireRole`, `requireShortlisted`, error handler |
| All services | `email.service.js`, `upload.service.js`, `qr.service.js`, `scoring.service.js` |
| All utilities | `jwt.js`, `generateId.js`, `response.js` |
| Database | Schema design, indexes, constraints, migrations, seed data |
| API documentation | Postman collection, API contract sheet |
| Deployment | Railway backend + PostgreSQL database |

## 2.2 What Dev 1 MUST NOT Handle

- Any `.jsx` or React component
- Any CSS / Tailwind / frontend styling
- React Router configuration
- Zustand stores
- Frontend deployment to Vercel
- Frontend mock data layer

## 2.3 Dependencies with Dev 2 and Dev 3

| Direction | Dependency |
|---|---|
| **Dev 2 → Dev 1** | Dev 2 needs all Auth, Public Events, Registration, and Participant APIs to replace mock data |
| **Dev 3 → Dev 1** | Dev 3 needs all Admin, Judging, Check-in, Communications, and Auction APIs to replace mock data |
| **Dev 1 → Dev 2** | Dev 1 needs no frontend code. Dev 1 is the **unblocking dependency** for both. |
| **Dev 1 → Dev 3** | Dev 1 must match the structured settings payload shape `{ toggles, deadlines, limits, communications, automation }` that Dev 3 implemented |

**Handoff protocol:** Dev 1 posts in team chat the moment an API group is ready, shares updated Postman collection. Dev 2 / Dev 3 swap imports the same day.

---

# 3. DATABASE DESIGN

## 3.1 Schema Migration Plan (v1 → v2)

> [!IMPORTANT]
> The current deployed schema is v1. The following changes are required to reach PRD v2 compliance.

| Change | Details |
|---|---|
| Add `JUDGE` to `Role` enum | New role for dedicated judge users |
| Add `Registration` model | Solo registrations (v1 only has `Team`) |
| Add `Track` model | Multi-track event support |
| Add `JudgeAssignment` model | Judge-to-event assignment |
| Add `JudgingCriteria` model | Per-round scoring criteria |
| Add `JudgeScore` model | Individual judge scores per submission per criterion |
| Update `Event` model | Add `registrationMode`, `participationMode`, `mode`, `requiresCheckIn`, `hasJudging`, `hasTracks`, `maxParticipants` |
| Update `Round` model | Add `submissionRequired`, `submissionType`, `submissionDeadline`, `maxFileSize`, `acceptedFileTypes`, `resultsPublished` |
| Update `Submission` model | Add `registrationId`, `trackId`, `formData`, `reviewedBy`, `track` label; update `SubmissionType` enum |
| Update `EventSettings` model | Add all v2 toggle/deadline/communication/automation fields |
| Update `Team` → rename semantically | Now used only for team participation; add `trackId`, `qrCode` |
| Add `qrCode` to `Registration` and `Team` | QR check-in tokens |

## 3.2 Complete Schema (All Models — PRD v2 Aligned)

### User

```prisma
model User {
  id            String    @id @default(cuid())
  name          String
  email         String    @unique
  password      String    // bcrypt hashed, min 8 chars
  role          Role      @default(PARTICIPANT)
  avatar        String?
  phone         String?
  institution   String?
  year          String?   // "1st", "2nd" etc
  branch        String?
  rollNo        String?
  isVerified    Boolean   @default(false)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  registrations    Registration[]
  teamMembers      TeamMember[]
  refreshTokens    RefreshToken[]
  setupTokens      SetupPasswordToken[]
  judgeAssignments JudgeAssignment[]
}

enum Role {
  PARTICIPANT
  JUDGE
  EVENT_ADMIN
  SUPER_ADMIN
}
```

**Indexes:** `email` (unique, implicit from `@unique`)  
**Constraints:** `email` must be valid format (validated at API layer). `password` stored as bcrypt hash.

### Event

```prisma
model Event {
  id                    String            @id @default(cuid())
  slug                  String            @unique
  title                 String
  tagline               String?
  description           String
  coverImage            String?
  logo                  String?
  venue                 String
  mode                  EventMode         @default(IN_PERSON)
  eventDate             DateTime
  eventEndDate          DateTime?

  // Registration config
  registrationMode      RegistrationMode  @default(OPEN_ACCESS)
  participationMode     ParticipationMode @default(TEAM_ONLY)
  registrationOpen      Boolean           @default(false)
  registrationDeadline  DateTime?
  teamSizeMin           Int               @default(1)
  teamSizeMax           Int               @default(4)
  maxParticipants       Int?
  entryFee              Int               @default(0)
  eligibility           String?

  // Feature flags
  requiresCheckIn       Boolean           @default(false)
  hasJudging            Boolean           @default(false)
  hasTracks             Boolean           @default(false)
  auctionEnabled        Boolean           @default(false)

  // Visibility
  status                EventStatus       @default(DRAFT)
  isPublic              Boolean           @default(false)

  prizePool             Int?
  createdBy             String
  createdAt             DateTime          @default(now())
  updatedAt             DateTime          @updatedAt

  rounds          Round[]
  registrations   Registration[]
  teams           Team[]
  prizes          Prize[]
  tracks          Track[]
  settings        EventSettings?
  judges          JudgeAssignment[]
  problems        Problem[]
  submissions     Submission[]
  emailLogs       EmailLog[]

  @@index([status])
  @@index([isPublic])
}

enum EventMode { IN_PERSON  ONLINE  HYBRID }
enum RegistrationMode { OPEN_ACCESS  APPLICATION_REVIEW  INVITE_ONLY }
enum ParticipationMode { SOLO_ONLY  TEAM_ONLY  BOTH }
enum EventStatus { DRAFT  UPCOMING  REGISTRATION_OPEN  REGISTRATION_CLOSED  ONGOING  COMPLETED  ARCHIVED }
```

### Track

```prisma
model Track {
  id          String  @id @default(cuid())
  eventId     String
  name        String
  description String?
  prizes      String?
  order       Int

  event       Event   @relation(fields: [eventId], references: [id], onDelete: Cascade)
  submissions Submission[]
  registrations Registration[]
  teams       Team[]

  @@index([eventId])
}
```

### Round

```prisma
model Round {
  id                  String          @id @default(cuid())
  eventId             String
  order               Int
  name                String
  description         String?
  startTime           DateTime?
  endTime             DateTime?
  roundType           RoundType
  submissionRequired  Boolean         @default(false)
  submissionType      SubmissionType?
  submissionDeadline  DateTime?
  maxFileSize         Int?            // in MB
  acceptedFileTypes   String?         // ".pptx,.pdf,.zip"
  isActive            Boolean         @default(false)
  resultsPublished    Boolean         @default(false)

  event           Event             @relation(fields: [eventId], references: [id], onDelete: Cascade)
  submissions     Submission[]
  judgingCriteria  JudgingCriteria[]

  @@index([eventId])
}

enum RoundType { SUBMISSION  PRESENTATION  QUIZ  WORKSHOP  NETWORKING  CRISIS  BIDDING  GENERAL }
enum SubmissionType { FILE  LINK  FORM  MIXED }
```

### Registration (Solo — NEW)

```prisma
model Registration {
  id              String              @id @default(cuid())
  registrationId  String              @unique   // FP26-S-0001
  eventId         String
  userId          String
  status          RegistrationStatus  @default(PENDING)
  trackId         String?
  hearAboutUs     String?
  checkInStatus   Boolean             @default(false)
  checkInTime     DateTime?
  qrCode          String?             @unique
  submittedAt     DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  event       Event   @relation(fields: [eventId], references: [id], onDelete: Cascade)
  user        User    @relation(fields: [userId], references: [id])
  track       Track?  @relation(fields: [trackId], references: [id])
  submissions Submission[]

  @@unique([userId, eventId])          // one solo registration per user per event
  @@index([eventId])
  @@index([userId])
}
```

### Team & TeamMember

```prisma
model Team {
  id              String              @id @default(cuid())
  registrationId  String              @unique   // FP26-T-0001
  eventId         String
  teamName        String
  teamSize        Int
  status          RegistrationStatus  @default(PENDING)
  trackId         String?
  hearAboutUs     String?
  pointBalance    Int                 @default(1000)   // auction only
  problemWon      String?                               // auction only
  checkInStatus   Boolean             @default(false)
  checkInTime     DateTime?
  qrCode          String?             @unique
  submittedAt     DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  event       Event         @relation(fields: [eventId], references: [id], onDelete: Cascade)
  track       Track?        @relation(fields: [trackId], references: [id])
  members     TeamMember[]
  submissions Submission[]
  transactions PointTransaction[]

  @@index([eventId])
}

enum RegistrationStatus { PENDING  SHORTLISTED  WAITLISTED  REJECTED  CHECKED_IN  DISQUALIFIED }

model TeamMember {
  id        String   @id @default(cuid())
  teamId    String
  userId    String?
  name      String
  rollNo    String?
  year      String?
  branch    String?
  email     String
  phone     String?
  isLead    Boolean  @default(false)

  team      Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)
  user      User?    @relation(fields: [userId], references: [id])

  @@unique([rollNo, teamId])
  @@index([teamId])
  @@index([userId])
}
```

### Submission

```prisma
model Submission {
  id              String         @id @default(cuid())
  eventId         String
  roundId         String?
  trackId         String?

  // One of these two identifies the submitter
  teamId          String?
  registrationId  String?        // solo participant

  // Content
  type            SubmissionType
  fileUrl         String?
  fileName        String?
  fileSize        Int?
  externalLink    String?
  formData        Json?

  // Review
  reviewNotes     String?
  reviewedBy      String?
  track           String?        // internal tag
  score           Float?

  submittedAt     DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  team            Team?          @relation(fields: [teamId], references: [id])
  registration    Registration?  @relation(fields: [registrationId], references: [id])
  round           Round?         @relation(fields: [roundId], references: [id])
  trackRef        Track?         @relation(fields: [trackId], references: [id])
  event           Event          @relation(fields: [eventId], references: [id])
  scores          JudgeScore[]

  @@unique([teamId, roundId])
  @@unique([registrationId, roundId])
  @@index([eventId])
}
```

### Judging System

```prisma
model JudgeAssignment {
  id        String   @id @default(cuid())
  eventId   String
  userId    String
  name      String
  bio       String?
  trackId   String?
  isActive  Boolean  @default(true)

  event     Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id])
  scores    JudgeScore[]

  @@unique([eventId, userId])
}

model JudgingCriteria {
  id          String  @id @default(cuid())
  roundId     String
  name        String
  description String?
  maxScore    Int     @default(10)
  weight      Float   @default(1.0)
  order       Int

  round       Round   @relation(fields: [roundId], references: [id], onDelete: Cascade)
  scores      JudgeScore[]

  @@index([roundId])
}

model JudgeScore {
  id           String   @id @default(cuid())
  submissionId String
  judgeId      String
  criteriaId   String
  score        Float
  comment      String?
  scoredAt     DateTime @default(now())

  submission   Submission       @relation(fields: [submissionId], references: [id])
  judge        JudgeAssignment  @relation(fields: [judgeId], references: [id])
  criteria     JudgingCriteria  @relation(fields: [criteriaId], references: [id])

  @@unique([submissionId, judgeId, criteriaId])
}
```

### EventSettings (v2 — Structured Payload)

```prisma
model EventSettings {
  id                        String    @id  // = eventId

  // Toggles
  registrationOpen          Boolean   @default(false)
  submissionsOpen           Boolean   @default(false)
  leaderboardVisible        Boolean   @default(false)
  resultsPublished          Boolean   @default(false)
  checkInEnabled            Boolean   @default(false)
  judgingOpen                Boolean   @default(false)

  // Deadlines
  registrationDeadline      DateTime?
  checkInOpenTime           DateTime?

  // Communications
  notifyOnRegistration      Boolean   @default(true)
  notifyOnStatusChange      Boolean   @default(true)
  notifyOnSubmission        Boolean   @default(true)
  reminderHoursBefore       Int       @default(24)

  // Automation
  autoCloseRegistration     Boolean   @default(false)
  autoOpenSubmissions       Boolean   @default(false)

  // Limits
  maxTeamsPerProblem        Int?

  // Meta
  currentPhase              String    @default("pre-event")
  allowWalkIns              Boolean   @default(false)
  updatedAt                 DateTime  @updatedAt
  updatedBy                 String?

  event                     Event     @relation(fields: [id], references: [id])
}
```

**Settings API payload mapping** (GET/PATCH `/api/admin/events/:slug/settings`):

```json
{
  "toggles": {
    "registrationOpen": true,
    "submissionsOpen": false,
    "leaderboardVisible": false,
    "resultsPublished": false,
    "checkInEnabled": false,
    "judgingOpen": false
  },
  "deadlines": {
    "registrationDeadline": "2026-04-10T23:59:59Z",
    "checkInOpenTime": null
  },
  "limits": {
    "maxTeamsPerProblem": null,
    "teamSizeMin": 2,
    "teamSizeMax": 4,
    "maxParticipants": 24
  },
  "communications": {
    "notifyOnRegistration": true,
    "notifyOnStatusChange": true,
    "notifyOnSubmission": true,
    "reminderHoursBefore": 24
  },
  "automation": {
    "autoCloseRegistration": false,
    "autoOpenSubmissions": false
  }
}
```

### Supporting Models (Unchanged)

```prisma
model Prize {
  id       String @id @default(cuid())
  eventId  String
  rank     Int
  label    String
  amount   Int
  perks    String
  trackId  String?    // NEW: track-specific prizes
  event    Event  @relation(fields: [eventId], references: [id], onDelete: Cascade)
}

model RefreshToken {
  id        String   @id @default(cuid())
  userId    String
  token     String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model SetupPasswordToken {
  id        String    @id @default(cuid())
  userId    String
  token     String    @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())
  user      User      @relation(fields: [userId], references: [id])
  @@index([userId])
}

model Otp {
  id        String   @id @default(cuid())
  email     String
  otp       String
  expiresAt DateTime
  createdAt DateTime @default(now())
  @@index([email])
}

model EmailLog {
  id        String   @id @default(cuid())
  eventId   String?
  recipient String
  type      String
  subject   String
  body      String?
  status    String   // "SENT", "FAILED", "QUEUED"
  error     String?
  sentAt    DateTime @default(now())
  event     Event?   @relation(fields: [eventId], references: [id])
  @@index([eventId])
}

model PointTransaction {
  id        String   @id @default(cuid())
  teamId    String
  eventId   String
  amount    Int
  reason    String
  adminNote String?
  createdAt DateTime @default(now())
  createdBy String
  team      Team     @relation(fields: [teamId], references: [id])
  @@index([teamId])
  @@index([eventId])
}

model Problem {
  id             String  @id @default(cuid())
  eventId        String
  order          Int
  title          String
  description    String
  category       String?
  isActive       Boolean @default(true)
  assignedTeamId String?
  event          Event   @relation(fields: [eventId], references: [id], onDelete: Cascade)
}
```

## 3.3 Key Indexes and Uniqueness Rules

| Model | Constraint | Type | Purpose |
|---|---|---|---|
| `User.email` | unique | DB | Prevent duplicate accounts |
| `Event.slug` | unique | DB | URL-safe event identifier |
| `Registration.registrationId` | unique | DB | Human-readable solo reg ID |
| `Registration(userId, eventId)` | compound unique | DB | One solo reg per user per event |
| `Registration.qrCode` | unique | DB | Unique QR tokens |
| `Team.registrationId` | unique | DB | Human-readable team reg ID |
| `Team.qrCode` | unique | DB | Unique QR tokens |
| `TeamMember(rollNo, teamId)` | compound unique | DB | No duplicate roll nos within a team |
| `Submission(teamId, roundId)` | compound unique | DB | One submission per team per round |
| `Submission(registrationId, roundId)` | compound unique | DB | One submission per solo per round |
| `JudgeScore(submissionId, judgeId, criteriaId)` | compound unique | DB | One score per judge per criterion per submission |
| `JudgeAssignment(eventId, userId)` | compound unique | DB | One assignment per judge per event |

## 3.4 Edge Cases and Data Integrity

| Edge Case | Handling |
|---|---|
| **Duplicate roll numbers across events** | Allowed — uniqueness is per-team (`@@unique([rollNo, teamId])`). For cross-event uniqueness, validate at API layer per event using `TeamMember` where `eventId` matches |
| **Race condition on registration ID** | Use `SELECT ... FOR UPDATE` or Prisma `$transaction` with sequential reads to generate IDs atomically |
| **Race condition on roll number check** | The `check-rollno` endpoint is advisory only. Final uniqueness enforced via DB constraint inside a transaction on `POST /register` |
| **User registers solo AND in a team** | Prevent at API layer: check both `Registration` and `TeamMember` tables for the user+event combo before allowing |
| **Team lead already has an account** | Link `TeamMember.userId` to existing `User.id`. Do NOT create duplicate account |
| **Team lead has no account** | Create `User` with random temp password + `PARTICIPANT` role. Send setup-password email |
| **Partial team creation failure** | Wrap entire registration (Team + TeamMembers + User creation + Email) in a single `$transaction`. Rollback on any failure |
| **Double submission for same round** | `@@unique([teamId, roundId])` enforces upsert behavior — use Prisma `upsert` |
| **Event deleted with registrations** | `onDelete: Cascade` on Event relations ensures clean deletion. Admin-only, double confirmation required |

---

# 4. AUTHENTICATION & AUTHORIZATION SYSTEM

## 4.1 Complete Auth Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        AUTH LIFECYCLE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SIGNUP                                                         │
│    POST /api/auth/signup                                        │
│    → Validate name, email, password                             │
│    → Check email uniqueness                                     │
│    → Hash password (bcrypt, 12 rounds)                          │
│    → Create User (role=PARTICIPANT, isVerified=false)            │
│    → Send verification email                                    │
│    → Return { message: "Check your email" }                     │
│                                                                 │
│  LOGIN                                                          │
│    POST /api/auth/login                                         │
│    → Validate email + password against DB                       │
│    → Generate accessToken (JWT, 15min, contains userId + role)  │
│    → Generate refreshToken (JWT, 7d)                            │
│    → Store refreshToken in DB (RefreshToken table)              │
│    → Set refreshToken as HTTP-only cookie                       │
│    → Return { accessToken, user: { id, name, email, role } }    │
│                                                                 │
│  REFRESH                                                        │
│    POST /api/auth/refresh                                       │
│    → Read refreshToken from cookie                              │
│    → Validate against DB (exists + not expired)                 │
│    → Generate new accessToken                                   │
│    → Return { accessToken }                                     │
│                                                                 │
│  LOGOUT                                                         │
│    POST /api/auth/logout                                        │
│    → Delete refreshToken from DB                                │
│    → Clear cookie                                               │
│    → Return { message: "Logged out" }                           │
│                                                                 │
│  FORGOT PASSWORD                                                │
│    POST /api/auth/forgot-password { email }                     │
│    → Generate 6-digit OTP                                       │
│    → Store in Otp table (15min expiry)                          │
│    → Send OTP via email                                         │
│                                                                 │
│  VERIFY OTP                                                     │
│    POST /api/auth/verify-otp { email, otp }                     │
│    → Validate OTP exists, not expired                           │
│    → Return { verified: true, resetToken }                      │
│                                                                 │
│  RESET PASSWORD                                                 │
│    POST /api/auth/reset-password { resetToken, newPassword }    │
│    → Validate resetToken                                        │
│    → Hash new password                                          │
│    → Update User.password                                       │
│    → Delete OTP record                                          │
│    → Delete all RefreshTokens for user (force re-login)         │
│                                                                 │
│  SETUP PASSWORD (first-time, auto-created accounts)             │
│    POST /api/auth/setup-password { token, password }            │
│    → Validate SetupPasswordToken (exists, not expired, not used)│
│    → Hash password, update User                                 │
│    → Mark token as used (usedAt = now)                          │
│    → Set isVerified = true                                      │
│    → Auto-login: return accessToken + set refreshToken cookie   │
│                                                                 │
│  GET ME                                                         │
│    GET /api/auth/me                                             │
│    → requireAuth middleware                                     │
│    → Return current user (id, name, email, role, avatar, etc.)  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 4.2 JWT Strategy

| Token | Type | Expiry | Storage | Contains |
|---|---|---|---|---|
| **Access Token** | JWT | 15 minutes | Client memory (Zustand) | `{ userId, role, iat, exp }` |
| **Refresh Token** | JWT | 7 days | HTTP-only cookie + DB | `{ userId, tokenId, iat, exp }` |

**Access Token signing:**
```js
jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_ACCESS_SECRET, { expiresIn: '15m' })
```

**Refresh Token signing:**
```js
jwt.sign({ userId: user.id, tokenId: dbToken.id }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' })
```

## 4.3 Cookie Configuration

```js
res.cookie('refreshToken', token, {
  httpOnly: true,
  secure: true,              // HTTPS only in production
  sameSite: 'None',          // cross-subdomain (events.edcjssun.com ↔ api.edcjssun.com)
  domain: '.edcjssun.com',   // shared across subdomains
  maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
  path: '/',
});
```

## 4.4 Middleware Design

### `requireAuth`

```js
// Extracts Bearer token from Authorization header
// Verifies JWT signature and expiry
// Loads user from DB by userId in token
// Attaches user to req.user
// Returns 401 if token missing, invalid, expired, or user not found
```

**Error responses:**
- `401 MISSING_TOKEN` — No Authorization header
- `401 INVALID_TOKEN` — JWT verification failed
- `401 USER_NOT_FOUND` — Token valid but user deleted

### `requireRole(...roles)`

```js
// Factory function: requireRole('EVENT_ADMIN', 'SUPER_ADMIN')
// Checks req.user.role is in the allowed roles array
// Returns 403 INSUFFICIENT_ROLE if not
```

### `requireShortlisted`

```js
// For participant submission endpoints
// Checks event's registrationMode:
//   OPEN_ACCESS → always eligible (skip status check)
//   APPLICATION_REVIEW → status must be SHORTLISTED or CHECKED_IN
//   INVITE_ONLY → status must be SHORTLISTED or CHECKED_IN
// Looks up the user's registration/team for this eventSlug
// Returns 403 NOT_ELIGIBLE if not qualified
```

## 4.5 Role Matrix

| Action | PARTICIPANT | JUDGE | EVENT_ADMIN | SUPER_ADMIN |
|---|---|---|---|---|
| View public events | ✅ | ✅ | ✅ | ✅ |
| Register for event | ✅ | ❌ | ❌ | ❌ |
| View own dashboard | ✅ | ❌ | ❌ | ❌ |
| Submit deliverable | ✅ (if eligible) | ❌ | ❌ | ❌ |
| Edit own registration | ✅ (if PENDING) | ❌ | ❌ | ❌ |
| Score submissions | ❌ | ✅ (assigned events only) | ❌ | ❌ |
| View judging portal | ❌ | ✅ | ❌ | ❌ |
| Manage event registrations | ❌ | ❌ | ✅ (own events) | ✅ |
| Shortlist/reject teams | ❌ | ❌ | ✅ | ✅ |
| Send emails | ❌ | ❌ | ✅ | ✅ |
| Manage event settings | ❌ | ❌ | ✅ | ✅ |
| Create new event | ❌ | ❌ | ❌ | ✅ |
| Manage admins/judges | ❌ | ❌ | ❌ | ✅ |
| Delete/archive event | ❌ | ❌ | ❌ | ✅ |
| Platform-wide stats | ❌ | ❌ | ❌ | ✅ |
| Auction admin (standalone) | ❌ | ❌ | ✅ (password) | ✅ (password) |

---

*Continued in Part 2: API Design, Critical Flows, Business Logic Rules*
