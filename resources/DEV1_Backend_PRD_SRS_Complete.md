# EDC Event Management Platform â€” DEV 1 Backend PRD + SRS

**Document Version:** 1.0  
**Role:** DEV 1 â€” Backend, Database & APIs  
**Stack:** Node.js + Express | PostgreSQL | Prisma ORM | JWT Auth | Cloudinary | Resend  
**Canonical Source:** EDC_Platform_PRD_v2.md (all conflicts resolved in favour of v2)  
**Date:** April 2026

---

# 1. SYSTEM OVERVIEW

## 1.1 Product Summary (Backend Perspective)

The EDC Event Management Platform is a **generic, config-driven** event management system. The backend is the single source of truth for all data, business logic, and access control. It exposes a RESTful JSON API consumed by two frontend applications:

- **events.edcjssun.com** â€” Participant-facing (public events, registration, dashboard, submissions)
- **Admin portal** â€” Event administration (registrations management, shortlisting, judging, communications)

The backend also powers a **standalone Auction module** that shares the database but has its own authentication.

## 1.2 Core Responsibilities of Backend

| Responsibility | Scope |
|---|---|
| **Data persistence** | All PostgreSQL tables via Prisma ORM |
| **Authentication** | JWT access/refresh tokens, HTTP-only cookies, role-based access |
| **Business logic** | Registration rules, submission eligibility, deadline enforcement, status transitions |
| **File management** | Cloudinary upload/validation for submissions and event assets |
| **Email system** | Transactional emails via Resend â€” automated triggers + admin-initiated |
| **QR system** | Generate QR tokens on registration, validate on check-in scan |
| **Score aggregation** | Judge score collection, weighted aggregation, optional normalization |
| **API contracts** | Stable, documented JSON endpoints for all three frontend consumers |

## 1.3 System Boundaries

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                    BACKEND (api.edcjssun.com)             â”‚
â”‚                                                          â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚  â”‚ Auth Module  â”‚  â”‚ Event/Reg    â”‚  â”‚ Admin Module   â”‚  â”‚
â”‚  â”‚ (JWT+Cookie) â”‚  â”‚ Module       â”‚  â”‚ (CRUD+Bulk)    â”‚  â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚  â”‚ Participant  â”‚  â”‚ Judging      â”‚  â”‚ Auction Module â”‚  â”‚
â”‚  â”‚ Module       â”‚  â”‚ Module       â”‚  â”‚ (Standalone)   â”‚  â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚  â”‚ Email Svc   â”‚  â”‚ Upload Svc   â”‚  â”‚ QR Svc         â”‚  â”‚
â”‚  â”‚ (Resend)    â”‚  â”‚ (Cloudinary) â”‚  â”‚ (qrcode npm)   â”‚  â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚
â”‚                                                          â”‚
â”‚                    PostgreSQL (Railway/Supabase)          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
         â–²              â–²               â–²
         â”‚              â”‚               â”‚
   events.edcjssun.com  Admin Portal    Auction Standalone
   (Participant FE)     (Admin FE)      (Separate Auth)
```

## 1.4 High-Level Architecture

```
Client Request
    â”‚
    â–¼
Express Router â”€â”€ route file selects handler
    â”‚
    â–¼
Middleware Chain: cors â†’ json â†’ cookieParser â†’ requireAuth? â†’ requireRole?
    â”‚
    â–¼
Controller â”€â”€ orchestrates business logic
    â”‚
    â”œâ”€â”€â–¶ Prisma ORM â”€â”€â–¶ PostgreSQL
    â”œâ”€â”€â–¶ email.service.js â”€â”€â–¶ Resend API
    â”œâ”€â”€â–¶ upload.service.js â”€â”€â–¶ Cloudinary API
    â”œâ”€â”€â–¶ qr.service.js â”€â”€â–¶ QR token generation
    â””â”€â”€â–¶ scoring.service.js â”€â”€â–¶ Score aggregation
    â”‚
    â–¼
Standardized JSON Response â†’ Client
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
| **Dev 2 â†’ Dev 1** | Dev 2 needs all Auth, Public Events, Registration, and Participant APIs to replace mock data |
| **Dev 3 â†’ Dev 1** | Dev 3 needs all Admin, Judging, Check-in, Communications, and Auction APIs to replace mock data |
| **Dev 1 â†’ Dev 2** | Dev 1 needs no frontend code. Dev 1 is the **unblocking dependency** for both. |
| **Dev 1 â†’ Dev 3** | Dev 1 must match the structured settings payload shape `{ toggles, deadlines, limits, communications, automation }` that Dev 3 implemented |

**Handoff protocol:** Dev 1 posts in team chat the moment an API group is ready, shares updated Postman collection. Dev 2 / Dev 3 swap imports the same day.

---

# 3. DATABASE DESIGN

## 3.1 Schema Migration Plan (v1 â†’ v2)

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
| Update `Team` â†’ rename semantically | Now used only for team participation; add `trackId`, `qrCode` |
| Add `qrCode` to `Registration` and `Team` | QR check-in tokens |

## 3.2 Complete Schema (All Models â€” PRD v2 Aligned)

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

### Registration (Solo â€” NEW)

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

### EventSettings (v2 â€” Structured Payload)

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
| **Duplicate roll numbers across events** | Allowed â€” uniqueness is per-team (`@@unique([rollNo, teamId])`). For cross-event uniqueness, validate at API layer per event using `TeamMember` where `eventId` matches |
| **Race condition on registration ID** | Use `SELECT ... FOR UPDATE` or Prisma `$transaction` with sequential reads to generate IDs atomically |
| **Race condition on roll number check** | The `check-rollno` endpoint is advisory only. Final uniqueness enforced via DB constraint inside a transaction on `POST /register` |
| **User registers solo AND in a team** | Prevent at API layer: check both `Registration` and `TeamMember` tables for the user+event combo before allowing |
| **Team lead already has an account** | Link `TeamMember.userId` to existing `User.id`. Do NOT create duplicate account |
| **Team lead has no account** | Create `User` with random temp password + `PARTICIPANT` role. Send setup-password email |
| **Partial team creation failure** | Wrap entire registration (Team + TeamMembers + User creation + Email) in a single `$transaction`. Rollback on any failure |
| **Double submission for same round** | `@@unique([teamId, roundId])` enforces upsert behavior â€” use Prisma `upsert` |
| **Event deleted with registrations** | `onDelete: Cascade` on Event relations ensures clean deletion. Admin-only, double confirmation required |

---

# 4. AUTHENTICATION & AUTHORIZATION SYSTEM

## 4.1 Complete Auth Flow

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                        AUTH LIFECYCLE                            â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚                                                                 â”‚
â”‚  SIGNUP                                                         â”‚
â”‚    POST /api/auth/signup                                        â”‚
â”‚    â†’ Validate name, email, password                             â”‚
â”‚    â†’ Check email uniqueness                                     â”‚
â”‚    â†’ Hash password (bcrypt, 12 rounds)                          â”‚
â”‚    â†’ Create User (role=PARTICIPANT, isVerified=false)            â”‚
â”‚    â†’ Send verification email                                    â”‚
â”‚    â†’ Return { message: "Check your email" }                     â”‚
â”‚                                                                 â”‚
â”‚  LOGIN                                                          â”‚
â”‚    POST /api/auth/login                                         â”‚
â”‚    â†’ Validate email + password against DB                       â”‚
â”‚    â†’ Generate accessToken (JWT, 15min, contains userId + role)  â”‚
â”‚    â†’ Generate refreshToken (JWT, 7d)                            â”‚
â”‚    â†’ Store refreshToken in DB (RefreshToken table)              â”‚
â”‚    â†’ Set refreshToken as HTTP-only cookie                       â”‚
â”‚    â†’ Return { accessToken, user: { id, name, email, role } }    â”‚
â”‚                                                                 â”‚
â”‚  REFRESH                                                        â”‚
â”‚    POST /api/auth/refresh                                       â”‚
â”‚    â†’ Read refreshToken from cookie                              â”‚
â”‚    â†’ Validate against DB (exists + not expired)                 â”‚
â”‚    â†’ Generate new accessToken                                   â”‚
â”‚    â†’ Return { accessToken }                                     â”‚
â”‚                                                                 â”‚
â”‚  LOGOUT                                                         â”‚
â”‚    POST /api/auth/logout                                        â”‚
â”‚    â†’ Delete refreshToken from DB                                â”‚
â”‚    â†’ Clear cookie                                               â”‚
â”‚    â†’ Return { message: "Logged out" }                           â”‚
â”‚                                                                 â”‚
â”‚  FORGOT PASSWORD                                                â”‚
â”‚    POST /api/auth/forgot-password { email }                     â”‚
â”‚    â†’ Generate 6-digit OTP                                       â”‚
â”‚    â†’ Store in Otp table (15min expiry)                          â”‚
â”‚    â†’ Send OTP via email                                         â”‚
â”‚                                                                 â”‚
â”‚  VERIFY OTP                                                     â”‚
â”‚    POST /api/auth/verify-otp { email, otp }                     â”‚
â”‚    â†’ Validate OTP exists, not expired                           â”‚
â”‚    â†’ Return { verified: true, resetToken }                      â”‚
â”‚                                                                 â”‚
â”‚  RESET PASSWORD                                                 â”‚
â”‚    POST /api/auth/reset-password { resetToken, newPassword }    â”‚
â”‚    â†’ Validate resetToken                                        â”‚
â”‚    â†’ Hash new password                                          â”‚
â”‚    â†’ Update User.password                                       â”‚
â”‚    â†’ Delete OTP record                                          â”‚
â”‚    â†’ Delete all RefreshTokens for user (force re-login)         â”‚
â”‚                                                                 â”‚
â”‚  SETUP PASSWORD (first-time, auto-created accounts)             â”‚
â”‚    POST /api/auth/setup-password { token, password }            â”‚
â”‚    â†’ Validate SetupPasswordToken (exists, not expired, not used)â”‚
â”‚    â†’ Hash password, update User                                 â”‚
â”‚    â†’ Mark token as used (usedAt = now)                          â”‚
â”‚    â†’ Set isVerified = true                                      â”‚
â”‚    â†’ Auto-login: return accessToken + set refreshToken cookie   â”‚
â”‚                                                                 â”‚
â”‚  GET ME                                                         â”‚
â”‚    GET /api/auth/me                                             â”‚
â”‚    â†’ requireAuth middleware                                     â”‚
â”‚    â†’ Return current user (id, name, email, role, avatar, etc.)  â”‚
â”‚                                                                 â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
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
  sameSite: 'None',          // cross-subdomain (events.edcjssun.com â†” api.edcjssun.com)
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
- `401 MISSING_TOKEN` â€” No Authorization header
- `401 INVALID_TOKEN` â€” JWT verification failed
- `401 USER_NOT_FOUND` â€” Token valid but user deleted

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
//   OPEN_ACCESS â†’ always eligible (skip status check)
//   APPLICATION_REVIEW â†’ status must be SHORTLISTED or CHECKED_IN
//   INVITE_ONLY â†’ status must be SHORTLISTED or CHECKED_IN
// Looks up the user's registration/team for this eventSlug
// Returns 403 NOT_ELIGIBLE if not qualified
```

## 4.5 Role Matrix

| Action | PARTICIPANT | JUDGE | EVENT_ADMIN | SUPER_ADMIN |
|---|---|---|---|---|
| View public events | âœ… | âœ… | âœ… | âœ… |
| Register for event | âœ… | âŒ | âŒ | âŒ |
| View own dashboard | âœ… | âŒ | âŒ | âŒ |
| Submit deliverable | âœ… (if eligible) | âŒ | âŒ | âŒ |
| Edit own registration | âœ… (if PENDING) | âŒ | âŒ | âŒ |
| Score submissions | âŒ | âœ… (assigned events only) | âŒ | âŒ |
| View judging portal | âŒ | âœ… | âŒ | âŒ |
| Manage event registrations | âŒ | âŒ | âœ… (own events) | âœ… |
| Shortlist/reject teams | âŒ | âŒ | âœ… | âœ… |
| Send emails | âŒ | âŒ | âœ… | âœ… |
| Manage event settings | âŒ | âŒ | âœ… | âœ… |
| Create new event | âŒ | âŒ | âŒ | âœ… |
| Manage admins/judges | âŒ | âŒ | âŒ | âœ… |
| Delete/archive event | âŒ | âŒ | âŒ | âœ… |
| Platform-wide stats | âŒ | âŒ | âŒ | âœ… |
| Auction admin (standalone) | âŒ | âŒ | âœ… (password) | âœ… (password) |

---

*Continued in Part 2: API Design, Critical Flows, Business Logic Rules*
# DEV 1 Backend PRD + SRS â€” Part 2: API Design

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
- `200` â€” Success
- `201` â€” Created
- `400` â€” Bad request / validation error
- `401` â€” Not authenticated
- `403` â€” Not authorized / not eligible
- `404` â€” Resource not found
- `409` â€” Conflict (duplicate)
- `422` â€” Unprocessable entity (business rule violation)
- `500` â€” Internal server error

---

## 5.1 Auth APIs

### POST `/api/auth/signup`

| Field | Detail |
|---|---|
| **Body** | `{ name: string, email: string, password: string }` |
| **Validation** | name: required, 2-100 chars. email: required, valid format, unique. password: required, min 8 chars |
| **Response 201** | `{ message: "Account created. Please verify your email." }` |
| **Errors** | `409 EMAIL_EXISTS` â€” email already registered. `422 VALIDATION_ERROR` â€” field-level errors |
| **Logic** | 1. Validate fields â†’ 2. Check email uniqueness â†’ 3. Hash password (bcrypt, 12 rounds) â†’ 4. Create User (role=PARTICIPANT, isVerified=false) â†’ 5. Send verification email â†’ 6. Return success |

### POST `/api/auth/login`

| Field | Detail |
|---|---|
| **Body** | `{ email: string, password: string }` |
| **Response 200** | `{ accessToken: "jwt...", user: { id, name, email, role, avatar, isVerified } }` |
| **Cookie Set** | `refreshToken` HTTP-only cookie (7d) |
| **Errors** | `401 INVALID_CREDENTIALS` â€” wrong email or password. `403 NOT_VERIFIED` â€” email not verified |
| **Logic** | 1. Find user by email â†’ 2. Compare bcrypt hash â†’ 3. Check isVerified â†’ 4. Generate accessToken (15min) â†’ 5. Generate refreshToken â†’ 6. Store refreshToken in DB â†’ 7. Set cookie â†’ 8. Return accessToken + user |

### POST `/api/auth/logout`

| Field | Detail |
|---|---|
| **Auth** | requireAuth |
| **Body** | None |
| **Response 200** | `{ message: "Logged out" }` |
| **Cookie** | Cleared |
| **Logic** | 1. Read refreshToken from cookie â†’ 2. Delete from DB â†’ 3. Clear cookie â†’ 4. Return success |

### POST `/api/auth/refresh`

| Field | Detail |
|---|---|
| **Body** | None (reads cookie) |
| **Response 200** | `{ accessToken: "new_jwt..." }` |
| **Errors** | `401 INVALID_REFRESH` â€” cookie missing, token not in DB, or expired |
| **Logic** | 1. Read refreshToken from cookie â†’ 2. Verify JWT â†’ 3. Find in DB, check not expired â†’ 4. Generate new accessToken â†’ 5. Return |

### POST `/api/auth/forgot-password`

| Field | Detail |
|---|---|
| **Body** | `{ email: string }` |
| **Response 200** | `{ message: "If account exists, OTP sent" }` (always 200, no email enumeration) |
| **Logic** | 1. Find user by email â†’ 2. If exists: generate 6-digit OTP â†’ 3. Delete old OTPs for this email â†’ 4. Store OTP (15min expiry) â†’ 5. Send email â†’ 6. Return generic success |

### POST `/api/auth/verify-otp`

| Field | Detail |
|---|---|
| **Body** | `{ email: string, otp: string }` |
| **Response 200** | `{ verified: true, resetToken: "short_lived_jwt" }` |
| **Errors** | `400 INVALID_OTP` â€” wrong OTP or expired |
| **Logic** | 1. Find OTP by email + otp â†’ 2. Check not expired â†’ 3. Generate short-lived resetToken (10min JWT with email) â†’ 4. Return |

### POST `/api/auth/reset-password`

| Field | Detail |
|---|---|
| **Body** | `{ resetToken: string, newPassword: string }` |
| **Response 200** | `{ message: "Password reset successful" }` |
| **Errors** | `401 INVALID_RESET_TOKEN`. `422 VALIDATION_ERROR` â€” password too short |
| **Logic** | 1. Verify resetToken JWT â†’ 2. Extract email â†’ 3. Hash new password â†’ 4. Update user â†’ 5. Delete all OTPs for email â†’ 6. Delete all RefreshTokens for user (force re-login everywhere) |

### POST `/api/auth/setup-password`

| Field | Detail |
|---|---|
| **Body** | `{ token: string, password: string }` |
| **Response 200** | `{ accessToken, user }` + sets refreshToken cookie (auto-login) |
| **Errors** | `401 INVALID_SETUP_TOKEN` â€” not found, expired, or already used |
| **Logic** | 1. Find SetupPasswordToken by token â†’ 2. Check not expired, not used â†’ 3. Hash password â†’ 4. Update user (password, isVerified=true) â†’ 5. Mark token usedAt=now â†’ 6. Generate accessToken + refreshToken â†’ 7. Return (same as login response) |

### GET `/api/auth/me`

| Field | Detail |
|---|---|
| **Auth** | requireAuth |
| **Response 200** | `{ id, name, email, role, avatar, phone, institution, year, branch, rollNo, isVerified }` |
| **Errors** | `401` â€” not authenticated |

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
| **Logic** | 1. Find by slug where isPublic=true OR requester is admin â†’ 2. Include rounds (ordered), prizes, tracks, settings (selected fields only â€” no internal flags) â†’ 3. If hasJudging AND resultsPublished, include judge names/bios â†’ 4. Return |

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
2. Find or create User by email â†’ if new: create with temp password, queue setup-password email
3. Create `Registration` record with userId, eventId, status based on registrationMode:
   - `OPEN_ACCESS` â†’ `SHORTLISTED`
   - `APPLICATION_REVIEW` â†’ `PENDING`
   - `INVITE_ONLY` â†’ should not reach here (form not shown)
4. If `requiresCheckIn` â†’ generate QR token, store in `qrCode`
5. Log email â†’ Send confirmation email
6. Return registrationId

**Team registration:**
1. Generate registrationId: `{EVENT_PREFIX}-T-{SEQUENCE}` (e.g., `FP26-T-0001`)
2. Create `Team` record with status based on registrationMode (same as solo)
3. For each member:
   a. Find existing User by email
   b. If no User exists AND member.isLead: create User with temp password, queue setup-password email
   c. Create `TeamMember` with teamId, userId (if found/created)
4. If `requiresCheckIn` â†’ generate QR token
5. Log email â†’ Send confirmation email to lead
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
| **Errors** | `404 REGISTRATION_NOT_FOUND` â€” user not registered for this event |
| **Logic** | 1. Find event by slug â†’ 2. Check Registration table for userId+eventId (solo) â†’ 3. If not found, check TeamMember for userId+eventId (team, via join) â†’ 4. Return appropriate shape with `type` discriminator |

### PATCH `/api/participant/:slug/registration`

| Field | Detail |
|---|---|
| **Auth** | requireAuth (PARTICIPANT) |
| **Body (solo)** | `{ phone?, institution? }` (limited editable fields) |
| **Body (team)** | `{ teamName?, members?: [{ id, name, phone }] }` (limited fields) |
| **Response 200** | Updated registration |
| **Errors** | `403 EDIT_NOT_ALLOWED` â€” status is not PENDING. `404 REGISTRATION_NOT_FOUND` |
| **Logic** | Only allowed if status=PENDING AND registrationMode=APPLICATION_REVIEW. Team edits: only team lead can edit. Cannot change rollNo, email, or team size after submission |

### POST `/api/participant/:slug/submit/:roundId`

| Field | Detail |
|---|---|
| **Auth** | requireAuth + requireShortlisted |
| **Content-Type** | `multipart/form-data` (for FILE/MIXED) or `application/json` (for LINK/FORM) |
| **Body** | `file` (multer), `externalLink`, `formData`, `trackId?` |
| **Response 200** | `{ id, type, fileUrl?, fileName?, fileSize?, externalLink?, submittedAt }` |
| **Errors** | `403 NOT_ELIGIBLE` â€” not shortlisted. `403 SUBMISSIONS_CLOSED` â€” deadline passed or submissionsOpen=false. `422 INVALID_FILE_TYPE`. `422 FILE_TOO_LARGE`. `404 ROUND_NOT_FOUND` |

**Logic:**
1. Find event + round by slug + roundId
2. Validate: round.submissionRequired=true, round.isActive=true
3. Validate: submissionsOpen=true (EventSettings) AND now < round.submissionDeadline
4. Validate submission type matches round.submissionType:
   - `FILE` â†’ file required, validate type against `acceptedFileTypes`, size against `maxFileSize`
   - `LINK` â†’ externalLink required, validate URL format
   - `FORM` â†’ formData required, validate JSON
   - `MIXED` â†’ at least one of file or link required
5. If FILE: upload to Cloudinary â†’ get URL
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

## 5.5 Admin APIs â€” Platform

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
| **Logic** | 1. Validate slug uniqueness â†’ 2. Create Event â†’ 3. Create Rounds (with criteria if hasJudging) â†’ 4. Create Prizes â†’ 5. Create Tracks (if hasTracks) â†’ 6. Create EventSettings with defaults â†’ 7. If hasJudging, create JudgeAssignments â†’ 8. Return. All in transaction |

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
| **Logic** | 1. Flatten structured payload into DB columns â†’ 2. Update EventSettings â†’ 3. Set updatedBy to current user â†’ 4. Re-read and return in structured format. Limits fields (teamSizeMin, teamSizeMax, maxParticipants) update the Event model, not EventSettings |

---

## 5.6 Admin APIs â€” Registrations

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
| **Logic** | 1. Update status â†’ 2. If notifyOnStatusChange=true, send status email â†’ 3. Log EmailLog â†’ 4. If OPEN_ACCESS event and autoOpenSubmissions=true, this is a no-op (already shortlisted) |

### POST `/api/admin/events/:slug/registrations/bulk`

| Field | Detail |
|---|---|
| **Body** | `{ ids: [string], status: "SHORTLISTED"|"WAITLISTED"|"REJECTED" }` |
| **Response 200** | `{ updated: 24, emailsSent: 24 }` |
| **Logic** | 1. Validate all IDs belong to this event â†’ 2. Batch update status â†’ 3. Batch send emails (Resend supports batch) â†’ 4. Log all emails â†’ 5. Return counts |

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
| **Logic** | 1. Find team/registration by id â†’ 2. Set checkInStatus=true, checkInTime=now â†’ 3. Update status to CHECKED_IN â†’ 4. Return |

---

## 5.7 Admin APIs â€” Submissions

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

## 5.8 Admin APIs â€” Judging

### GET `/api/admin/events/:slug/judges`
Returns: All JudgeAssignments for this event with user details and scoring progress.

### POST `/api/admin/events/:slug/judges`
**Body:** `{ name, email, bio?, trackId? }`  
**Logic:** 1. Find/create User with role=JUDGE â†’ 2. Create JudgeAssignment â†’ 3. If new user: create SetupPasswordToken, send invite email with portal link â†’ 4. Return assignment

### DELETE `/api/admin/events/:slug/judges/:judgeId`
Removes judge assignment (not the user account). Cascades judge scores if needed.

### GET `/api/admin/events/:slug/scores`
**Response:** Aggregated scores per submission. Per submission: team/participant name, per-judge scores, weighted average, final rank. Includes normalization if enabled.

### POST `/api/admin/events/:slug/results/publish`
**Logic:** 1. Set `resultsPublished=true` on EventSettings â†’ 2. Set `resultsPublished=true` on relevant rounds â†’ 3. Send "Results Announced" email to all registered participants â†’ 4. Return

---

## 5.9 Admin APIs â€” Check-In

### GET `/api/admin/events/:slug/checkin`
**Response:** `{ stats: { expected, checkedIn, notYet, walkIns }, log: [{ time, name, registrationId, type, staff }] }`

### POST `/api/admin/events/:slug/checkin/scan`
**Body:** `{ qrToken: string }`  
**Logic:** 1. Find Registration or Team by qrCode â†’ 2. If already checked in, return `409 ALREADY_CHECKED_IN` â†’ 3. Set checkInStatus=true, checkInTime=now, status=CHECKED_IN â†’ 4. Return participant/team details

### GET `/api/admin/events/:slug/checkin/export`
**Response:** CSV attendance report: Name, Reg ID, Type, Check-In Time, Method (QR/Manual/Walk-in)

---

## 5.10 Admin APIs â€” Communications

### GET `/api/admin/events/:slug/emails`
**Response:** `{ items: [{ id, type, subject, recipient, status, sentAt }], total }`

### POST `/api/admin/events/:slug/emails/send`
**Body:** `{ to: "all"|"shortlisted"|"waitlisted"|"rejected"|"checked_in"|"not_checked_in"|"submitted"|"not_submitted"|"by_track", trackId?, subject, body, templateId?, scheduledFor? }`  
**Logic:** 1. Resolve recipient list based on `to` filter â†’ 2. Replace template variables â†’ 3. If scheduledFor: queue (initially just send immediately, scheduled = future scope) â†’ 4. Batch send via Resend â†’ 5. Log each in EmailLog â†’ 6. Return `{ sent: count, failed: count }`

### GET `/api/admin/events/:slug/emails/templates`
**Response:** `{ templates: [{ id, name, subject, body, variables }] }`  
Returns all built-in templates with variable placeholders.

---

## 5.11 Judge Portal APIs

### GET `/api/judging/:slug/submissions`
**Auth:** requireAuth + requireRole(JUDGE)  
**Logic:** 1. Verify judge is assigned to this event â†’ 2. Return submissions for the judge's assigned track (or all if no track-specific assignment) â†’ 3. Include existing scores by this judge

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
**Logic:** Transaction: deduct points â†’ create PointTransaction â†’ return new balance.

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
# DEV 1 Backend PRD + SRS â€” Part 3: Flows, Logic, Systems, NFRs, Roadmap

---

# 6. CRITICAL FLOWS (Step-by-Step)

## 6.1 Registration Flow (Atomic + Transactional)

```
â”Œâ”€ CLIENT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  User fills multi-step form â†’ clicks "Submit Registration"          â”‚
â”‚  POST /api/events/:slug/register { type, teamName, members, ... }  â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                                                    â”‚
â”Œâ”€ SERVER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                                                                      â”‚
â”‚  Step 1: LOAD EVENT                                                  â”‚
â”‚    â†’ Find event by slug                                              â”‚
â”‚    â†’ 404 if not found                                                â”‚
â”‚                                                                      â”‚
â”‚  Step 2: VALIDATE REGISTRATION WINDOW                                â”‚
â”‚    â†’ event.registrationOpen must be true                             â”‚
â”‚    â†’ now < event.registrationDeadline (if set)                       â”‚
â”‚    â†’ 403 REGISTRATION_CLOSED if either fails                        â”‚
â”‚                                                                      â”‚
â”‚  Step 3: VALIDATE PARTICIPATION MODE                                 â”‚
â”‚    â†’ If SOLO_ONLY and type="team" â†’ 422 INVALID_PARTICIPATION_TYPE  â”‚
â”‚    â†’ If TEAM_ONLY and type="solo" â†’ 422 INVALID_PARTICIPATION_TYPE  â”‚
â”‚    â†’ If BOTH â†’ either type accepted                                  â”‚
â”‚                                                                      â”‚
â”‚  Step 4: VALIDATE CAPACITY                                           â”‚
â”‚    â†’ Count existing registrations + teams for this event             â”‚
â”‚    â†’ If count >= maxParticipants â†’ 422 EVENT_FULL                   â”‚
â”‚                                                                      â”‚
â”‚  Step 5: VALIDATE PAYLOAD                                            â”‚
â”‚    â†’ Required fields present (name, email, etc.)                     â”‚
â”‚    â†’ Team: teamSize within [teamSizeMin, teamSizeMax]                â”‚
â”‚    â†’ Team: members.length === teamSize                               â”‚
â”‚    â†’ Team: exactly one isLead=true                                   â”‚
â”‚    â†’ All emails valid format                                         â”‚
â”‚    â†’ All phones 10 digits (if required)                              â”‚
â”‚    â†’ trackId valid if hasTracks=true                                 â”‚
â”‚    â†’ 422 VALIDATION_ERROR with field-level details                  â”‚
â”‚                                                                      â”‚
â”‚  Step 6: VALIDATE UNIQUENESS (pre-transaction quick check)           â”‚
â”‚    â†’ Check rollNos unique within payload                             â”‚
â”‚    â†’ Check no duplicate rollNo in TeamMember where eventId matches   â”‚
â”‚    â†’ Check no duplicate userId+eventId in Registration               â”‚
â”‚    â†’ 409 DUPLICATE_ROLLNO or ALREADY_REGISTERED                     â”‚
â”‚                                                                      â”‚
â”‚  Step 7: BEGIN TRANSACTION (prisma.$transaction)                     â”‚
â”‚    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚    â”‚                                                              â”‚  â”‚
â”‚    â”‚  7a. Generate registrationId (sequential, padded)            â”‚  â”‚
â”‚    â”‚      â†’ COUNT where eventId, +1, pad to 4 digits              â”‚  â”‚
â”‚    â”‚      â†’ Format: {PREFIX}-{S|T}-{NNNN}                        â”‚  â”‚
â”‚    â”‚                                                              â”‚  â”‚
â”‚    â”‚  7b. Determine initial status                                â”‚  â”‚
â”‚    â”‚      â†’ OPEN_ACCESS â†’ SHORTLISTED                            â”‚  â”‚
â”‚    â”‚      â†’ APPLICATION_REVIEW â†’ PENDING                         â”‚  â”‚
â”‚    â”‚      â†’ INVITE_ONLY â†’ should not reach here                  â”‚  â”‚
â”‚    â”‚                                                              â”‚  â”‚
â”‚    â”‚  7c. Create Registration/Team record                         â”‚  â”‚
â”‚    â”‚                                                              â”‚  â”‚
â”‚    â”‚  7d. For each member (team) or the user (solo):              â”‚  â”‚
â”‚    â”‚      â†’ Find User by email                                    â”‚  â”‚
â”‚    â”‚      â†’ If NOT found AND isLead:                              â”‚  â”‚
â”‚    â”‚          â€¢ Create User (random password, PARTICIPANT)        â”‚  â”‚
â”‚    â”‚          â€¢ Create SetupPasswordToken (48hr expiry)           â”‚  â”‚
â”‚    â”‚          â€¢ Queue setup-password email                        â”‚  â”‚
â”‚    â”‚      â†’ If found: link userId                                â”‚  â”‚
â”‚    â”‚      â†’ Create TeamMember record (team only)                  â”‚  â”‚
â”‚    â”‚                                                              â”‚  â”‚
â”‚    â”‚  7e. Generate QR code token (if requiresCheckIn=true)        â”‚  â”‚
â”‚    â”‚      â†’ crypto.randomUUID() or cuid                          â”‚  â”‚
â”‚    â”‚      â†’ Store in qrCode field                                â”‚  â”‚
â”‚    â”‚                                                              â”‚  â”‚
â”‚    â”‚  7f. Create EmailLog entry                                   â”‚  â”‚
â”‚    â”‚                                                              â”‚  â”‚
â”‚    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚
â”‚                                                                      â”‚
â”‚  Step 8: SEND EMAILS (outside transaction â€” non-blocking)            â”‚
â”‚    â†’ Registration confirmation to lead                               â”‚
â”‚    â†’ Setup-password email (if new user created)                      â”‚
â”‚    â†’ Update EmailLog status to SENT or FAILED                        â”‚
â”‚                                                                      â”‚
â”‚  Step 9: RETURN RESPONSE                                             â”‚
â”‚    â†’ { registrationId, type, teamName?, qrCode?, message }          â”‚
â”‚                                                                      â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

## 6.2 Submission Flow

```
1. Client: POST /api/participant/:slug/submit/:roundId
2. Server: requireAuth middleware â†’ extract user
3. Server: requireShortlisted middleware â†’ check eligibility
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
   â†’ Unique key: (teamId OR registrationId) + roundId
   â†’ If exists: update file/link fields + submittedAt = now
   â†’ If new: create
10. Send confirmation email (if settings.notifyOnSubmission = true)
11. Return submission details
```

## 6.3 Shortlisting Flow

```
Admin action: PATCH or POST bulk status update

1. Admin selects registrations â†’ sets status per entry
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
   â†’ SHORTLISTED: "You're In!" + submission link (if submission round active) + QR (if check-in)
   â†’ WAITLISTED: "You're on the waitlist"
   â†’ REJECTED: "Thank you for applying"
6. If autoOpenSubmissions = true AND status = SHORTLISTED:
   â†’ Check if submissionsOpen should be toggled (if all shortlisting is done)
7. Return { updated: count, emailsSent: count }
```

## 6.4 Judge Scoring Flow

```
1. Judge logs in (role=JUDGE) â†’ views /judging/:eventSlug
2. GET /api/judging/:slug/submissions
   â†’ Returns submissions assigned to this judge (by track or all)
   â†’ Each submission includes: team/participant info, file/link, existing scores by this judge
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
    rawScore = Î£(criterionScore Ã— criterionWeight) / Î£(weights)
  If normalization enabled:
    Per judge: zScore = (score - judgeAvg) / judgeStdDev
    normalizedScore = mean(zScores across all judges for this submission)
  Rank = sort by finalScore DESC
```

## 6.5 Check-in Flow (QR-based)

```
1. QR codes generated at registration time (stored in Registration.qrCode or Team.qrCode)
2. Event day: Admin opens Check-In Tab â†’ activates camera
3. Camera scans QR â†’ decodes token string
4. POST /api/admin/events/:slug/checkin/scan { qrToken: "decoded_string" }
5. Server:
   a. Find Registration where qrCode = token OR Team where qrCode = token
   b. If not found â†’ 404 INVALID_QR
   c. If already checkInStatus = true â†’ 409 ALREADY_CHECKED_IN (return name + time)
   d. Validate status is SHORTLISTED (or PENDING for OPEN_ACCESS events)
   e. Update: checkInStatus = true, checkInTime = now(), status = CHECKED_IN
   f. Return { name, registrationId, teamName?, checkInTime }
6. Manual check-in: same endpoint with search-based ID lookup instead of QR

WALK-IN FLOW (if allowWalkIns = true):
  POST /api/admin/events/:slug/registrations/checkin/:id { type: "walkin" }
  â†’ Creates a new Registration with status=CHECKED_IN directly
  â†’ Skips normal registration validation
```

## 6.6 Email Trigger Flow

```
AUTOMATED TRIGGERS (fire-and-forget, logged in EmailLog):

  On Registration Submit:
    â†’ IF registrationMode = OPEN_ACCESS:
        template: REGISTRATION_CONFIRMED
    â†’ IF registrationMode = APPLICATION_REVIEW:
        template: APPLICATION_RECEIVED
    â†’ IF new User created:
        template: SETUP_PASSWORD (includes one-time link)

  On Status Change:
    â†’ IF notifyOnStatusChange = true:
        â†’ SHORTLISTED: template SHORTLISTED_CONFIRMED + submission link + QR (if check-in)
        â†’ WAITLISTED: template WAITLISTED
        â†’ REJECTED: template REJECTED

  On Submission:
    â†’ IF notifyOnSubmission = true:
        template: SUBMISSION_RECEIVED

  On Schedule (cron or manual trigger):
    â†’ reminderHoursBefore hours before deadline:
        To: all eligible who haven't submitted
        template: SUBMISSION_REMINDER
    â†’ Day before event:
        To: all SHORTLISTED/CHECKED_IN
        template: EVENT_DAY_REMINDER + QR code

  On Results Publish:
    â†’ To all registered participants
    â†’ template: RESULTS_ANNOUNCED

  On Judge Invite:
    â†’ template: JUDGE_INVITATION + portal link

ADMIN MANUAL SEND:
  POST /api/admin/events/:slug/emails/send â†’ resolve audience, replace variables, batch send

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

  PENDING â”€â”€â†’ SHORTLISTED â”€â”€â†’ CHECKED_IN
    â”‚              â”‚
    â”œâ”€â”€â†’ WAITLISTED â”€â”€â†’ SHORTLISTED (if spot opens)
    â”‚
    â”œâ”€â”€â†’ REJECTED
    â”‚
    â””â”€â”€â†’ DISQUALIFIED (admin-only, exceptional)

  OPEN_ACCESS events: registration starts at SHORTLISTED directly

  Valid transitions:
    PENDING â†’ SHORTLISTED, WAITLISTED, REJECTED
    SHORTLISTED â†’ CHECKED_IN, DISQUALIFIED
    WAITLISTED â†’ SHORTLISTED, REJECTED
    CHECKED_IN â†’ DISQUALIFIED
    REJECTED â†’ (terminal, no further transitions unless admin overrides)
    DISQUALIFIED â†’ (terminal)
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
| File size | Must be â‰¤ `round.maxFileSize` MB (default: 25MB if null) | `422 FILE_TOO_LARGE` |
| File presence | Required for FILE and MIXED submission types | `422 FILE_REQUIRED` |
| Mime type | Validate actual mime type, not just extension | Prevents spoofed extensions |

## 8.3 Security

- Files uploaded via multer (memory storage) â†’ streamed to Cloudinary â†’ never stored on disk
- Cloudinary URLs are not guessable but are not access-controlled â€” acceptable for this scale
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
| `SHORTLISTED` | You're In! | Status â†’ SHORTLISTED |
| `REJECTED` | Thank You for Applying | Status â†’ REJECTED |
| `WAITLISTED` | You're on the Waitlist | Status â†’ WAITLISTED |
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
- No automatic retry â€” admin can manually resend from Communications panel
- Email failures NEVER block the primary operation (registration, status change, etc.)
- Emails sent AFTER the database transaction commits (never inside transaction)

## 9.4 EmailLog Model Usage

Every email sent creates an `EmailLog` record:
```json
{
  "eventId": "event_cuid",
  "recipient": "student@jss.edu",
  "type": "SHORTLISTED",
  "subject": "You're In! â€” Founder's Pit 2026",
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
| User accesses dashboard for event they're not registered for | `404 REGISTRATION_NOT_FOUND` â€” frontend shows "not registered" state |
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
| **File upload** | Up to 25MB, reliable | Multer memory storage â†’ stream to Cloudinary. No disk I/O |
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
Frontend payload                    â†’  DB column
toggles.registrationOpen            â†’  EventSettings.registrationOpen
toggles.submissionsOpen             â†’  EventSettings.submissionsOpen
deadlines.registrationDeadline      â†’  EventSettings.registrationDeadline
limits.teamSizeMin                  â†’  Event.teamSizeMin
limits.teamSizeMax                  â†’  Event.teamSizeMax
limits.maxParticipants              â†’  Event.maxParticipants
limits.maxTeamsPerProblem           â†’  EventSettings.maxTeamsPerProblem
communications.notifyOnRegistration â†’  EventSettings.notifyOnRegistration
automation.autoCloseRegistration    â†’  EventSettings.autoCloseRegistration
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

## Phase A: Foundation + Auth (Days 1â€“2)

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

## Phase B: Events + Registration (Days 2â€“4)

- [ ] `GET /api/events` with filters, pagination
- [ ] `GET /api/events/:slug` with full includes
- [ ] `GET /api/events/:slug/check-rollno`
- [ ] `POST /api/events/:slug/register` (BOTH solo and team, full validation, transactional)
- [ ] `generateId.js` â€” registration ID generator
- [ ] `qr.service.js` â€” QR token generation
- [ ] `email.service.js` â€” Registration confirmation + setup-password templates
- [ ] Test: registration flow with mock + real DB

**Deliverable:** Registration works end-to-end. Dev 2 can swap mock registration for real.

## Phase C: Participant APIs (Days 4â€“6)

- [ ] `GET /api/participant/:slug/registration`
- [ ] `PATCH /api/participant/:slug/registration`
- [ ] `POST /api/participant/:slug/submit/:roundId` + Cloudinary integration
- [ ] `GET /api/participant/:slug/submissions`
- [ ] `upload.service.js` â€” Cloudinary wrapper
- [ ] Submission validation (type, size, deadline)

**Deliverable:** Participant dashboard + submission working. Dev 2 wires up real data.

## Phase D: Admin APIs (Days 5â€“8)

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

## Phase E: Judging + Check-in + Communications + Advanced (Days 8â€“11)

- [ ] Judge CRUD: `GET/POST/DELETE /api/admin/events/:slug/judges`
- [ ] Scores: `GET /api/admin/events/:slug/scores`
- [ ] Results: `POST /api/admin/events/:slug/results/publish`
- [ ] Judge portal: `GET/POST/PATCH /api/judging/:slug/*`
- [ ] `scoring.service.js` â€” aggregation + normalization
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
| **Judging** | Judge invited, scores, normalization, results publish â€” full cycle works |
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