# EDC Event Management Platform — PRD v2.0
**Product:** edcjssun.com — Event Management Portal  
**Version:** 2.0 (Revised based on Dev 3 implementation + Unstop/Devfolio/Luma research)  
**Stack:** React + Vite (Frontend) | Node.js + Express (Backend) | PostgreSQL | Prisma ORM | JWT Auth | Cloudinary | Resend  
**Core Philosophy:** Build a truly generic event platform. Any event type — team or solo, submission-based or attendance-based, approval-gated or open-access, competitive or non-competitive — must be configurable without a single line of code change. The Auction/Bidding System is a **completely separate standalone module** that shares only the database; it is NOT integrated into the admin portal.  
**Revision Notes:** This v2 supersedes the original PRD. Folder structure is updated to reflect Dev 3's actual implementation (`src/our/views/`). Settings payload shape, submission model, and several schema fields are updated. Auction module is formally decoupled.

---

## Table of Contents

1. [What Changed from v1](#1-what-changed-from-v1)
2. [Product Vision & Event Type Matrix](#2-product-vision--event-type-matrix)
3. [System Architecture](#3-system-architecture)
4. [Tech Stack](#4-tech-stack)
5. [Database Schema v2](#5-database-schema-v2)
6. [Authentication System](#6-authentication-system)
7. [Public-Facing Features](#7-public-facing-features)
8. [Participant Dashboard](#8-participant-dashboard)
9. [Admin Portal — Full Spec](#9-admin-portal--full-spec)
10. [Event Configuration System](#10-event-configuration-system)
11. [Judging & Scoring System](#11-judging--scoring-system)
12. [Communications System](#12-communications-system)
13. [Auction Module — Standalone](#13-auction-module--standalone)
14. [API Route Map v2](#14-api-route-map-v2)
15. [Email Notifications](#15-email-notifications)
16. [Folder & File Structure](#16-folder--file-structure)
17. [Non-Functional Requirements](#17-non-functional-requirements)

---

## 1. What Changed from v1

### Changes Based on Dev 3 Implementation

| Area | v1 | v2 (This Document) |
|---|---|---|
| Folder structure | `src/pages/admin/` | `src/our/views/admin/` (matches Dev 3's actual build) |
| Settings payload | Flat fields from `EventSettings` model | Structured: `{ toggles, deadlines, limits, communications, automation }` |
| Submission model | No `track` or `reviewer` | Added `track String?` and `reviewedBy String?` to `Submission` |
| Dashboard stats | Embedded in event detail response | Separate `GET /api/admin/stats` for platform-wide + event stats object in event detail |
| Leaderboard tab | Part of admin portal | Removed from admin portal entirely — lives in standalone Auction Module |
| Event list page | Separate `/admin/events` page | Clarified as separate route from dashboard |

### Changes Based on Deeper Platform Research (Unstop/Devfolio/Luma)

| Area | v1 | v2 |
|---|---|---|
| Event types | Team only | Solo, Team, or Both — configurable |
| Registration mode | Always open → shortlist | Three modes: Open Access, Application Review, Invite Only |
| Submission | Single PPT per team | Multi-round submissions, configurable per round, file + link + form types |
| Judging | Admin scores submissions | Dedicated Judge portal with structured scoring rubrics, multi-judge normalization |
| Rounds | Defined at event creation | Fully configurable round types with per-round settings |
| Check-in | Simple boolean | QR code-based check-in system |
| Tracks | Not present | Events can define multiple tracks (like Devfolio's sponsor tracks) |
| Participant profile | Basic | Persistent profile with event history across all EDC events |
| Auction module | Tab inside admin portal | Completely separate standalone module |

---

## 2. Product Vision & Event Type Matrix

The platform must handle **any** of the following event configurations without code changes. Everything below is toggled through the Create Event wizard.

### Event Type Matrix

| Dimension | Options |
|---|---|
| **Participation mode** | Solo only / Team only / Both (participant chooses) |
| **Registration mode** | Open Access (instant) / Application Review (shortlist) / Invite Only (admin adds) |
| **Submission required** | Yes / No |
| **Submission type** | File upload (PPT/PDF/ZIP) / External link (GitHub, Figma, etc.) / Form-based / Multiple |
| **Rounds** | Single / Multi-round (each round independently configurable) |
| **Judging** | None / Admin-scored / Dedicated judge panel / Public voting |
| **Approval gates** | None / After registration / After each round submission |
| **Check-in** | Not required / QR code check-in required |
| **Tracks** | None / Multiple tracks with separate prizes |
| **Team size** | Configurable min/max (1–N) |
| **Entry fee** | Free / Paid (future: Razorpay integration) |
| **Visibility** | Public / Invite-only (unlisted) |

### Examples of what this covers

| Event | Config |
|---|---|
| Founder's Pit 2026 | Team (2–4), Application Review, Multi-round, No judging panel (admin scores), Check-in required |
| Tech Quiz | Solo, Open Access, No submission, Single round, Admin-scored |
| Hackathon | Team (2–5), Open Access, Submission required (GitHub link), Judge panel, Tracks |
| Workshop / Talk | Solo, Open Access, No submission, No judging, Check-in required |
| Case Study Competition | Solo or Team, Application Review, File submission (PDF), Judge panel |
| Photography Contest | Solo, Open Access, Image upload, Public voting |

---

## 3. System Architecture

### URL Structure

```
events.edcjssun.com/
│
├── /                                      ← Event platform homepage — event discovery
├── /:eventSlug                            ← Event landing page (public)
├── /:eventSlug/register                   ← Registration (solo or team)
├── /:eventSlug/dashboard                  ← Participant dashboard (auth required)
├── /:eventSlug/submit/:roundId?           ← Submission portal (eligible only)
├── /:eventSlug/leaderboard                ← Public leaderboard (if enabled)
│
├── /auth/login
├── /auth/signup
├── /auth/forgot-password
├── /auth/setup-password                   ← First-time setup via emailed link
│
├── /admin                                 ← Admin portal (protected)
│   ├── /admin/dashboard                   ← Super admin platform overview
│   ├── /admin/events                      ← All events list
│   ├── /admin/events/new                  ← Create event wizard
│   └── /admin/events/:eventSlug           ← Event admin home
│       ├── /registrations
│       ├── /submissions
│       ├── /shortlist
│       ├── /judging                       ← NEW: judge management + scoring
│       ├── /communications
│       ├── /check-in                      ← NEW: QR check-in dashboard
│       └── /settings
│
└── /auction/:eventSlug                    ← STANDALONE auction module (separate)
    ├── /auction/:eventSlug/admin          ← Auction control panel
    └── /auction/:eventSlug/board          ← Public live leaderboard
```

+ ### Entry Point
+ The event platform is hosted on a dedicated subdomain.
+ Users primarily access the platform via CTA from the main website:
+ 
+ www.edcjssun.com → "Explore Events" → events.edcjssun.com

### Three Separate Repos 

```
edcjssun-frontend   →  Vercel         →  edcjssun.com
edcjssun-events-frontend   →  Vercel  →  events.edcjssun.com 
edcjssun-backend    →  Railway        →  api.edcjssun.com
                           └── PostgreSQL on Railway/Supabase
```

---

## 4. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React + Vite | Existing site |
| Routing | React Router v6 | All routes defined in `main.jsx` |
| State | Zustand | `authStore`, `eventStore` |
| Styling | Tailwind CSS + shadcn/ui | |
| Backend | Node.js + Express | Separate repo |
| Database | PostgreSQL | |
| ORM | Prisma | |
| Auth | JWT + HTTP-only cookies | 15min access + 7day refresh |
| Files | Cloudinary | PPT, PDF, ZIP, images |
| Email | Resend | All transactional email |
| QR | `qrcode` npm package | Check-in QR generation |
| Polling | HTTP (10s interval) | Leaderboard refresh — no WebSockets needed |
| Deployment | Vercel (frontend) + Railway (backend) | |

---

## 5. Database Schema v2

### 5.1 Users

```prisma
model User {
  id            String    @id @default(cuid())
  name          String
  email         String    @unique
  password      String
  role          Role      @default(PARTICIPANT)
  avatar        String?
  phone         String?
  institution   String?
  year          String?   // "1st", "2nd" etc — for student profiles
  branch        String?
  rollNo        String?   // for internal participants
  isVerified    Boolean   @default(false)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  registrations   Registration[]    // solo registrations
  teamMembers     TeamMember[]      // team registrations
  refreshTokens   RefreshToken[]
  judgeAssignments JudgeAssignment[]
}

enum Role {
  PARTICIPANT
  JUDGE              // NEW: dedicated judge role
  EVENT_ADMIN
  SUPER_ADMIN
}
```

### 5.2 Events

```prisma
model Event {
  id                    String          @id @default(cuid())
  slug                  String          @unique
  title                 String
  tagline               String?
  description           String          // rich text / markdown
  coverImage            String?
  logo                  String?
  venue                 String
  mode                  EventMode       @default(IN_PERSON)  // NEW
  eventDate             DateTime
  eventEndDate          DateTime?
  
  // Registration config
  registrationMode      RegistrationMode @default(OPEN_ACCESS)  // NEW
  participationMode     ParticipationMode @default(TEAM_ONLY)   // NEW
  registrationOpen      Boolean          @default(false)
  registrationDeadline  DateTime?
  teamSizeMin           Int              @default(1)
  teamSizeMax           Int              @default(4)
  maxParticipants       Int?             // total cap (solo or teams)
  entryFee              Int              @default(0)
  eligibility           String?
  
  // Feature flags
  requiresCheckIn       Boolean          @default(false)  // NEW
  hasJudging            Boolean          @default(false)  // NEW
  hasTracks             Boolean          @default(false)  // NEW
  auctionEnabled        Boolean          @default(false)  // standalone module flag
  
  // Visibility
  status                EventStatus      @default(DRAFT)
  isPublic              Boolean          @default(false)
  
  prizePool             Int?
  createdBy             String
  createdAt             DateTime         @default(now())
  updatedAt             DateTime         @updatedAt

  rounds                Round[]
  registrations         Registration[]   // solo
  teams                 Team[]           // team
  prizes                Prize[]
  tracks                Track[]          // NEW
  settings              EventSettings?
  judges                JudgeAssignment[] // NEW
  problems              Problem[]        // auction module only
}

enum EventMode {
  IN_PERSON
  ONLINE
  HYBRID
}

enum RegistrationMode {
  OPEN_ACCESS        // register → immediately eligible to submit
  APPLICATION_REVIEW // register → admin reviews → shortlist → eligible
  INVITE_ONLY        // admin adds participants manually
}

enum ParticipationMode {
  SOLO_ONLY
  TEAM_ONLY
  BOTH               // participant chooses at registration
}

enum EventStatus {
  DRAFT
  UPCOMING
  REGISTRATION_OPEN
  REGISTRATION_CLOSED
  ONGOING
  COMPLETED
  ARCHIVED
}
```

### 5.3 Tracks (NEW)

```prisma
// For events with multiple competition tracks (like Devfolio sponsor tracks)
model Track {
  id          String  @id @default(cuid())
  eventId     String
  name        String  // "FinTech", "EdTech", "Open Innovation"
  description String?
  prizes      String? // track-specific prizes
  order       Int

  event       Event   @relation(fields: [eventId], references: [id])
  submissions Submission[]
}
```

### 5.4 Rounds

```prisma
model Round {
  id                  String      @id @default(cuid())
  eventId             String
  order               Int
  name                String
  description         String?
  startTime           DateTime?
  endTime             DateTime?
  roundType           RoundType
  submissionRequired  Boolean     @default(false)  // NEW: not all rounds need submissions
  submissionType      SubmissionType? // NEW: what kind of submission
  submissionDeadline  DateTime?
  maxFileSize         Int?        // MB, null = no limit
  acceptedFileTypes   String?     // ".pptx,.pdf" etc
  isActive            Boolean     @default(false)
  resultsPublished    Boolean     @default(false)

  event               Event       @relation(fields: [eventId], references: [id])
  submissions         Submission[]
  judgingCriteria     JudgingCriteria[]  // NEW
}

enum RoundType {
  SUBMISSION
  PRESENTATION
  QUIZ
  WORKSHOP
  NETWORKING
  CRISIS          // Founder's Pit specific
  BIDDING         // auction module
  GENERAL
}

enum SubmissionType {
  FILE            // PPT, PDF, ZIP etc
  LINK            // GitHub, Figma, YouTube etc
  FORM            // structured form fields
  MIXED           // file + link both accepted
}
```

### 5.5 Registrations — Solo

```prisma
// Used when participationMode = SOLO_ONLY or BOTH
model Registration {
  id              String              @id @default(cuid())
  registrationId  String              @unique  // FP26-S-0001 (S = solo)
  eventId         String
  userId          String
  status          RegistrationStatus  @default(PENDING)
  trackId         String?             // NEW: which track they're competing in
  hearAboutUs     String?
  checkInStatus   Boolean             @default(false)
  checkInTime     DateTime?
  qrCode          String?             // NEW: QR token for check-in
  submittedAt     DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  event           Event               @relation(fields: [eventId], references: [id])
  user            User                @relation(fields: [userId], references: [id])
  submissions     Submission[]
}
```

### 5.6 Teams & Team Members

```prisma
model Team {
  id              String              @id @default(cuid())
  registrationId  String              @unique  // FP26-T-0001
  eventId         String
  teamName        String
  teamSize        Int
  status          RegistrationStatus  @default(PENDING)
  trackId         String?             // NEW
  hearAboutUs     String?
  checkInStatus   Boolean             @default(false)
  checkInTime     DateTime?
  qrCode          String?             // NEW
  submittedAt     DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  event           Event               @relation(fields: [eventId], references: [id])
  members         TeamMember[]
  submissions     Submission[]
}

enum RegistrationStatus {
  PENDING
  SHORTLISTED
  WAITLISTED
  REJECTED
  CHECKED_IN
  DISQUALIFIED   // NEW
}

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

  team      Team     @relation(fields: [teamId], references: [id])
  user      User?    @relation(fields: [userId], references: [id])

  @@unique([rollNo, teamId])
}
```

### 5.7 Submissions (Updated)

```prisma
model Submission {
  id              String         @id @default(cuid())
  eventId         String
  roundId         String?
  trackId         String?        // NEW: which track this submission is for
  
  // Participant — one of these two
  teamId          String?
  registrationId  String?        // solo participant

  // Submission content
  type            SubmissionType
  fileUrl         String?
  fileName        String?
  fileSize        Int?
  externalLink    String?        // GitHub, Figma, demo link etc
  formData        Json?          // NEW: for form-type submissions

  // Review fields (updated from v1)
  reviewNotes     String?
  reviewedBy      String?        // NEW: admin/judge user ID who reviewed
  track           String?        // NEW: submission track label (internal tag)
  score           Float?
  
  submittedAt     DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  team            Team?          @relation(fields: [teamId], references: [id])
  round           Round?         @relation(fields: [roundId], references: [id])
  scores          JudgeScore[]   // NEW: per-judge scores
}
```

### 5.8 Judging System (NEW)

```prisma
// Judge assigned to an event
model JudgeAssignment {
  id        String   @id @default(cuid())
  eventId   String
  userId    String   // User with role JUDGE
  name      String   // displayed name
  bio       String?
  trackId   String?  // if judge is assigned to a specific track only
  isActive  Boolean  @default(true)

  event     Event    @relation(fields: [eventId], references: [id])
  user      User     @relation(fields: [userId], references: [id])
  scores    JudgeScore[]
}

// Scoring criteria defined per round
model JudgingCriteria {
  id          String  @id @default(cuid())
  roundId     String
  name        String  // "Innovation", "Feasibility", "Presentation"
  description String?
  maxScore    Int     @default(10)
  weight      Float   @default(1.0)  // for weighted scoring
  order       Int

  round       Round   @relation(fields: [roundId], references: [id])
  scores      JudgeScore[]
}

// Individual judge score for one submission on one criterion
model JudgeScore {
  id           String   @id @default(cuid())
  submissionId String
  judgeId      String   // JudgeAssignment.id
  criteriaId   String
  score        Float
  comment      String?
  scoredAt     DateTime @default(now())

  submission   Submission       @relation(fields: [submissionId], references: [id])
  criteria     JudgingCriteria  @relation(fields: [criteriaId], references: [id])

  @@unique([submissionId, judgeId, criteriaId])
}
```

### 5.9 Event Settings (Updated Payload)

```prisma
model EventSettings {
  id String @id  // = eventId

  // Registration toggles
  registrationOpen          Boolean   @default(false)
  registrationDeadline      DateTime?
  
  // Submission toggles (per event level — rounds have their own)
  submissionsOpen           Boolean   @default(false)
  
  // Visibility
  leaderboardVisible        Boolean   @default(false)
  resultsPublished          Boolean   @default(false)
  
  // Check-in
  checkInEnabled            Boolean   @default(false)
  checkInOpenTime           DateTime?
  
  // Judging
  judgingOpen               Boolean   @default(false)
  
  // Communications config
  notifyOnRegistration      Boolean   @default(true)
  notifyOnStatusChange      Boolean   @default(true)
  notifyOnSubmission        Boolean   @default(true)
  reminderHoursBefore       Int       @default(24)
  
  // Automation
  autoCloseRegistration     Boolean   @default(false)
  autoOpenSubmissions       Boolean   @default(false)  // open after shortlisting
  
  // Limits
  maxTeamsPerProblem        Int?      // auction module
  
  currentPhase              String    @default("pre-event")
  allowWalkIns              Boolean   @default(false)
  updatedAt                 DateTime  @updatedAt
  updatedBy                 String?

  event                     Event     @relation(fields: [id], references: [id])
}
```

The `SettingsTab` in the frontend groups these into the structured payload shape Dev 3 implemented:

```js
// Frontend settings payload (matches Dev 3's SettingsTab implementation)
{
  toggles: {
    registrationOpen, submissionsOpen, leaderboardVisible,
    resultsPublished, checkInEnabled, judgingOpen
  },
  deadlines: {
    registrationDeadline, checkInOpenTime
  },
  limits: {
    maxTeamsPerProblem, teamSizeMin, teamSizeMax, maxParticipants
  },
  communications: {
    notifyOnRegistration, notifyOnStatusChange,
    notifyOnSubmission, reminderHoursBefore
  },
  automation: {
    autoCloseRegistration, autoOpenSubmissions
  }
}
```

### 5.10 Other Models (Unchanged from v1)

```prisma
model Prize { ... }           // rank, label, amount, perks — per event + per track
model RefreshToken { ... }    // JWT refresh tokens
model EmailLog { ... }        // all sent emails logged
model PointTransaction { ... } // auction module only
model Problem { ... }          // auction module only
```

---

## 6. Authentication System

### Roles

| Role | Access |
|---|---|
| `PARTICIPANT` | Public pages, own dashboard, own submissions |
| `JUDGE` | Judging portal for assigned events only |
| `EVENT_ADMIN` | Admin portal for assigned events |
| `SUPER_ADMIN` | Full platform — create events, manage admins, all events |

### Auth Flow (unchanged from v1)

```
SIGNUP → email verify → LOGIN → accessToken (15min, memory) + refreshToken (7d, HTTP-only cookie)
REFRESH → auto on 401 → new accessToken
LOGOUT → delete refreshToken + clear cookie
PASSWORD RESET → 6-digit OTP (15min)
SETUP PASSWORD → first-time via one-time link (48hr)
```

### Route Guards

```
/events/:slug/dashboard            → requireAuth + PARTICIPANT
/events/:slug/submit/:roundId      → requireAuth + eligible (shortlisted or open-access)
/judging/:slug                     → requireAuth + JUDGE + assigned to this event
/admin/*                           → requireAuth + EVENT_ADMIN or SUPER_ADMIN
/admin/events/new                  → SUPER_ADMIN only
/admin/settings                    → SUPER_ADMIN only
```
### Cross-Subdomain Authentication Configuration
Since the platform uses subdomains, authentication cookies must be configured as:

domain = ".edcjssun.com"
sameSite = "None"
secure = true

This ensures authentication works across:
- events.edcjssun.com
- api.edcjssun.com

---

## 7. Public-Facing Features

### 7.1 Homepage — `/` (events.edcjssun.com)
Luma-inspired clean discovery layout.

- **Navbar:** EDC logo, Events, About, Login / Profile avatar
- **Hero:** EDC tagline, "Explore Events" CTA
- **Featured Events:** Horizontal scroll card row — upcoming + open events
- **Past Events:** Smaller grid — completed with outcome stats
- **Footer:** Social links, contact

**EventCard component** (reusable everywhere):
```
coverImage | title | date | venue | mode badge (In-Person / Online / Hybrid)
registrationStatus badge | prizePool | participationMode tag (Solo / Team)
CTA: "Register Now" / "View Event" / "Closed" (disabled)
```

### 7.2 Events Directory — `/`

- Grid of all public events
- Filters: Status (Open / Upcoming / Past), Mode (In-Person / Online), Type (Competition / Workshop / Talk)
- Search by title
- Sort: Newest / Prize Pool / Registration Closing Soon

### 7.3 Event Landing Page — `/:eventSlug`

Devfolio-inspired — everything rendered dynamically from event data.

**Hero:**
- Cover image, logo, name, tagline
- Event mode + date + venue
- Status badge + countdown timer
- CTA: "Register Now" (disabled after deadline) or "Apply Now" (for Application Review mode)
- "View Dashboard" if already registered

**About:**
- Description (rich text rendered)
- Key facts: Mode, Eligibility, Entry Fee, Team Size, Max Participants

**Tracks section** (only if `hasTracks = true`):
- Cards per track with name, description, and track-specific prizes

**Rounds / Format:**
- Visual timeline rendered from `Round[]` data
- Shows submission required badge on rounds that need it

**Prizes:**
- Per-event prizes from `Prize[]`
- Per-track prizes (if tracks enabled)

**Schedule:**
- Full event day timeline

**FAQ Accordion:** Configurable per event from admin

**Judges section** (if `hasJudging = true` and results published):
- Judge cards: avatar, name, bio

**Registration modes:** Landing page CTA changes based on `registrationMode`:
- `OPEN_ACCESS` → "Register Now" (instant)
- `APPLICATION_REVIEW` → "Apply Now" (will be reviewed)
- `INVITE_ONLY` → "By Invitation Only" (no CTA)

### 7.4 Registration / Application Form — `/:eventSlug/register`

**Participation mode handling:**

```
If participationMode = SOLO_ONLY:
  → Show solo registration form (no team fields)

If participationMode = TEAM_ONLY:
  → Show team registration form (team name + member blocks)

If participationMode = BOTH:
  → Ask first: "Are you participating solo or as a team?"
  → Render appropriate form based on answer
```

**Solo registration fields:**
```
Name            Pre-filled from profile (if logged in)
Roll Number     Text | Required for JSS students
Year            Dropdown
Branch          Text
Phone           10 digits
Track           Dropdown (only if hasTracks = true)
How did you hear about us?  Dropdown | Optional
Confirmation checkbox
```

**Team registration fields:**
```
STEP 1: Team Info
  Team Name, Team Size (min to max), Track (if hasTracks), How did you hear

STEP 2: Member Details (repeats per size)
  Per member: Name, Roll No. (unique check on blur), Year, Branch, Email, Phone
  Member 1 = Team Lead (labelled)

STEP 3: Review + Submit
```

**Post-submit behaviour by registration mode:**

| Mode | What happens |
|---|---|
| `OPEN_ACCESS` | Instantly confirmed. If submission round exists, submission link unlocked immediately. |
| `APPLICATION_REVIEW` | "Application submitted — results by [date]". Status = PENDING. |
| `INVITE_ONLY` | Form not shown (admin-managed only) |

**Success screen:**
- Registration ID (copy button)
- QR code (if `requiresCheckIn = true`) — downloadable, shown on screen
- Email confirmation message
- "Set up your account" prompt if account not yet created

---

## 8. Participant Dashboard — `/:eventSlug/dashboard`

Sidebar layout. Content adapts based on event configuration — tabs that aren't relevant are hidden.

### Sidebar Navigation (conditional)

```
Overview          Always shown
My Registration   Always shown (solo: "My Registration" / team: "My Team")
Submissions       Only if event has submission rounds AND participant is eligible
Schedule          Always shown
Judges            Only if hasJudging = true AND resultsPublished = true
Leaderboard       Only if leaderboardVisible = true
Help              Always shown
```

### Overview Tab

```
Registration Status Card:
  Large status badge (PENDING / SHORTLISTED / WAITLISTED / REJECTED / CHECKED_IN)
  Registration ID | Submitted: [date]

QR Code card (if requiresCheckIn = true):
  Downloadable QR code with instructions
  "Show this at the registration desk on event day"

Event Countdown:
  Days : Hours : Minutes : Seconds to eventDate

Next Action Prompt (contextual):
  OPEN_ACCESS + round active   → "Submit your [Round Name] by [deadline]" + [Submit Now]
  PENDING (APPLICATION_REVIEW) → "Results announced by [date]. We'll email you."
  SHORTLISTED                  → "You're in! Submit by [deadline]" + [Submit Now]
  WAITLISTED                   → "You're on the waitlist. We'll notify if a spot opens."
  REJECTED                     → "Thank you for applying. Stay tuned for future events."
  CHECKED_IN                   → "You're checked in! Good luck today."

Quick links:
  Rulebook | WhatsApp Group | Event Schedule
```

### My Registration / My Team Tab

**Solo:**
- Registration details: ID, date, track (if applicable)
- Edit option (only if status = PENDING and registration mode = APPLICATION_REVIEW)

**Team:**
- Team Name + Registration ID
- Member table: Name | Roll No. | Year | Branch | Email | Phone
- Edit option: lead only, PENDING only

### Submissions Tab

```
Visible only if event has submission rounds AND participant is SHORTLISTED (or open-access)

Per Round (one section per submission-required round):
  Round name + deadline countdown
  
  Current status: Not Submitted / Submitted
  If submitted: filename/link + submitted at timestamp
  
  Upload area (based on round.submissionType):
    FILE:  Drag-drop / click-to-browse → accepted types from round config
    LINK:  URL input (GitHub, Figma, YouTube etc)
    FORM:  Structured form fields defined per round
    MIXED: Both file upload and link input
  
  Re-submission allowed before deadline (replaces previous)
  Submission history: all versions with timestamps

Submission closed state (after deadline):
  "Submissions closed on [date]. [View your submission]"
```

### Schedule Tab

Full event day schedule rendered from Round data.  
If `requiresCheckIn = true`, shows venue details + "bring your QR code" notice.

### Judges Tab (only if `hasJudging = true` AND `resultsPublished = true`)

- Judge profile cards: avatar, name, designation, bio
- Scoring criteria display: criteria names + weights (transparency)

### Leaderboard Tab (only if `leaderboardVisible = true`)

- Embedded read-only leaderboard
- Shows "Leaderboard not yet visible" if disabled

### Help Tab

- Coordinator contact
- FAQ accordion
- Report issue form

---

## 9. Admin Portal — Full Spec

### 9.1 Folder Structure (Reflects Dev 3's Implementation)

```
src/our/views/admin/
  Dashboard.jsx               ← Platform overview (Super Admin)
  EventsList.jsx              ← All events list
  CreateEvent.jsx             ← 7-step wizard
  EventAdminHome.jsx          ← Event hub + quick toggles + tab router
  components/
    RegistrationsTab.jsx      ← Team/solo table + filters + bulk + drawer
    TeamDetailDrawer.jsx      ← Slide-in team detail panel
    ShortlistTab.jsx          ← Review workflow + confirm
    SubmissionsTab.jsx        ← Deliverable tracking + review
    JudgingTab.jsx            ← NEW: Judge management + scoring overview
    CommunicationsTab.jsx     ← Email composer + templates + history
    CheckInTab.jsx            ← NEW: QR check-in dashboard
    SettingsTab.jsx           ← Full settings with structured payload
```

### 9.2 Super Admin Dashboard — `/admin/dashboard`

```
PLATFORM — EDC JSS University

Stats Row (4 cards):
  Total Events | Active Events | Total Registrations | Total Participants

Active Events (cards):
  Event Name | Date | Mode | Registrations / Max | Status Badge | [Manage →]

Upcoming / Draft Events:
  Compact list

Recent Platform Activity (audit log):
  Action | Event | By | Time
  e.g. "Shortlisted 24 teams — Founder's Pit 2026 — by Admin — 2h ago"
```

### 9.3 Events List — `/admin/events`

```
[+ Create New Event] button (top right — SUPER_ADMIN only)

Table:
  Event Name | Date | Mode | Registration Mode | Status | Participants | Actions

Status badges: Draft / Upcoming / Open / Closed / Ongoing / Completed / Archived
Actions per row: [Manage] [Duplicate] [Archive]
```

### 9.4 Create Event Wizard — `/admin/events/new`

7-step form. Saves draft to localStorage between steps.

```
STEP 1 — BASICS
  Title, Slug (auto + editable, unique check), Tagline, Description (rich text),
  Cover Image, Logo

STEP 2 — LOGISTICS
  Event Date, End Date (optional), Venue, Mode (In-Person / Online / Hybrid),
  Eligibility, Entry Fee (0 = Free)

STEP 3 — PARTICIPATION CONFIG
  Participation Mode      Solo Only / Team Only / Both
  Team Size Min / Max     (hidden if Solo Only)
  Max Participants        (total cap)
  Registration Mode       Open Access / Application Review / Invite Only
  Registration Deadline   DateTime picker
  Require Check-In        Toggle (enables QR check-in system)

STEP 4 — ROUNDS
  [+ Add Round] — dynamic list, drag-to-reorder
  Per round:
    Name | Type (dropdown) | Start Time | End Time
    Submission Required?  Toggle
    If yes:
      Submission Type: File / Link / Form / Mixed
      Accepted File Types (if File/Mixed): .pptx .pdf .zip etc
      Max File Size (MB)
      Submission Deadline

STEP 5 — PRIZES & TRACKS
  Enable Multiple Tracks   Toggle
  If tracks enabled:
    [+ Add Track]: Name | Description | Track Prizes
  
  Overall Prizes (always):
    [+ Add Prize]: Rank | Label | Amount ₹ | Perks

STEP 6 — JUDGING
  Enable Judge Panel       Toggle
  If enabled:
    [+ Add Judge]: Name | Email | Bio | Assigned Track (optional)
    
    Per submission round: Define Scoring Criteria
    [+ Add Criterion]: Name | Description | Max Score | Weight
    
    Judging opens: DateTime picker
    Normalize scores across judges: Toggle

STEP 7 — MODULE OPTIONS & PUBLISH
  Enable Auction Module    Toggle (standalone module, data bridge only)
  Make Event Public        Toggle
  Registration Open        Toggle
  
  [Save as Draft]   [Publish Event]
```

### 9.5 Event Admin Home — `/admin/events/:eventSlug`

```
[Event Name] — [Date] | [Venue] | [Mode badge]

Stats Row (5 cards — live):
  Registered | Shortlisted | Submitted | Checked In | Days to Event

Quick Toggles (instant save → PATCH /api/admin/events/:slug/settings):
  Registration Open       [Toggle]
  Submissions Open        [Toggle]   (master toggle — rounds have their own)
  Check-In Active         [Toggle]   (hidden if requiresCheckIn = false)
  Judging Open            [Toggle]   (hidden if hasJudging = false)
  Leaderboard Visible     [Toggle]   (auction module only)
  Results Published       [Toggle]

Tab Bar:
  Registrations | Submissions | Shortlist | Judging* | Check-In* | Communications | Settings
  (* only shown if those features are enabled for this event)
```

### 9.6 Registrations Tab

Handles both solo and team registrations in one unified table.

```
Top Bar:
  Search (name, roll no., email, registration ID)
  Filters: Status | Year | Branch | Track | Participation Type (Solo/Team) | Team Size
  [Export CSV] | Registration count

DataTable:
  Reg. ID | Type (Solo/Team) | Name/Team Name | Size | Lead Email | Track | Status | Date | Actions

Bulk Actions:
  Select multiple → [Shortlist] [Waitlist] [Reject] → ConfirmDialog → batch emails sent

Team/Solo Detail Drawer:
  For Teams: Team name, all member details table, submission status, status change, notes, email history
  For Solo: Participant name, roll no., year, branch, submission status, status change, notes, email history
  
  QR Code display (if requiresCheckIn = true)
  Check-in status + time (if checked in)
```

### 9.7 Submissions Tab (Updated from v1)

```
Top Bar:
  Filter: Status (All / Submitted / Not Submitted) | Round | Track | Reviewer
  [Download All as ZIP] | [Export Review Notes CSV]

Stats row:
  Total Submitted | Pending Review | Reviewed | Avg Score (if judging enabled)

DataTable:
  Team/Participant | Round | Track | Status | File/Link | Reviewer | Score | Submitted At | Actions
  
Actions: [Preview] [Download] [Review] [Assign Reviewer]

Review Panel (Drawer):
  File: PDF inline / PPTX download / Link opens in new tab
  Review Notes: textarea (internal)
  Reviewer: assign to self or another admin
  Score: numeric input (0–100)
  Track: text tag (internal classification)
  [Save Review]

Bulk: [Send Submission Reminder] to non-submitted eligible teams
```

### 9.8 Shortlist Tab

```
Header:
  Target: [maxParticipants] | Shortlisted: X | Pending: Y | Waitlisted: Z | Rejected: W

Note: Only shown if registrationMode = APPLICATION_REVIEW.
For OPEN_ACCESS events, this tab shows "No shortlisting required for this event."

Tab bar: [All] [Pending] [Shortlisted] [Waitlisted] [Rejected]

Per entry card (Pending tab):
  Name/Team | Reg ID | Track | Submission status badge
  [View Submission] → opens file preview
  [Shortlist ✓] [Waitlist] [Reject ✗]
  Notes: textarea

Warning: "You've shortlisted X / [max] entries"

[Confirm All Decisions] → ConfirmDialog → batch emails to all groups
```

### 9.9 Judging Tab (NEW)

Only visible if `hasJudging = true`.

```
JUDGE MANAGEMENT section:
  Table: Judge Name | Email | Track Assigned | Submissions Scored | Status
  [+ Invite Judge] → sends invite email with login setup link
  [Remove Judge]

SCORING CRITERIA section:
  Per Round (that has judging):
    Criteria table: Name | Max Score | Weight | Description
    [Edit Criteria]

SCORES OVERVIEW section:
  Table: Team/Participant | Round | Track | Avg Score | Scores per Judge | Final Rank
  Scores auto-normalized across judges (if normalization enabled)
  [Declare Results] button → sets resultsPublished = true → notifies participants
  [Export Scores CSV]

JUDGE PORTAL LINK:
  Shareable link to /judging/:eventSlug (for judges to log in and score)
```

### 9.10 Check-In Tab (NEW)

Only visible if `requiresCheckIn = true`.

```
Stats Row:
  Expected: [total shortlisted] | Checked In: X | Not Yet: Y | Walk-ins: Z

QR Scanner area:
  "Open camera to scan participant QR codes"
  (uses device camera via browser API on mobile/tablet)
  
  Manual check-in: Search by name / Roll No. / Registration ID → [Check In]

Check-in log:
  Time | Name/Team | Reg ID | Type (QR / Manual) | Check-In Staff

[Export Attendance CSV]
[Walk-In Registration] → quick add form for walk-ins (if allowWalkIns = true)
```

### 9.11 Communications Tab (Enhanced from v1)

```
COMPOSE section:
  To:         Audience selector
              All / Shortlisted / Waitlisted / Rejected /
              Checked-In / Not Checked-In / Submitted / Not Submitted /
              By Track / Custom Selection
  
  Template:   Dropdown (built-in + custom)
  Subject:    Text input
  Body:       Rich text editor
              Variable hints bar: {{name}} {{teamName}} {{registrationId}}
                                  {{eventName}} {{eventDate}} {{submissionDeadline}}
  
  Schedule:   Send Now / Schedule for [DateTime]    ← NEW: scheduled sending
  
  [Preview]  [Send to X participants]

DELIVERY SNAPSHOT section (from Dev 3's implementation):
  Sent Today: X | Opened: Y% | Clicked: Z%  (Resend webhook data)

EMAIL HISTORY:
  Date | Template | Audience | Count | Status | [View Details]
```

**Built-in Templates:**
- Registration Confirmed (Open Access)
- Application Received (Application Review)
- Shortlisted — You're In!
- Rejected — Thank You
- Waitlisted — You're on the List
- Submission Reminder (24h before deadline)
- Submission Received Confirmation
- Event Day Reminder
- Check-In Instructions + QR Code
- Results Announced
- Custom

### 9.12 Settings Tab (Matches Dev 3's Structured Payload)

```
GENERAL
  Title, Tagline, Description, Cover, Logo, Date, Venue, Mode, Eligibility

PARTICIPATION
  Participation Mode (Solo / Team / Both)
  Team Size Min / Max
  Registration Mode (Open / Application / Invite)
  Max Participants
  Require Check-In [Toggle]

REGISTRATION
  Registration Open [Toggle]
  Registration Deadline [DateTime]
  Allow Walk-Ins [Toggle]

SUBMISSIONS
  Submissions Open [Toggle]   ← master toggle
  (Individual round deadlines managed in round settings)

JUDGING
  Enable Judge Panel [Toggle]
  Judging Open [Toggle]
  Normalize Scores [Toggle]

COMMUNICATIONS (matches Dev 3's payload)
  Notify on Registration     [Toggle]
  Notify on Status Change    [Toggle]
  Notify on Submission       [Toggle]
  Reminder Hours Before      [Number input]

AUTOMATION (matches Dev 3's payload)
  Auto-close Registration    [Toggle]
  Auto-open Submissions      [Toggle]   (opens after shortlisting confirmed)

AUCTION MODULE  (only if auctionEnabled = true)
  Leaderboard Visible [Toggle]
  (All other auction config lives in the standalone module)

CURRENT PHASE
  Dropdown: Pre-Event / Registration / Shortlisting / Pre-Event Final /
            Event Day / Post-Event / Archived

DANGER ZONE (SUPER_ADMIN only)
  [Archive Event]
  [Delete Event]  (double confirm)
```

---

## 10. Event Configuration System

This section documents the system logic for what changes based on event config — so every developer understands the full behaviour matrix.

### Registration Mode Behaviour

| Mode | Registration Form | Post-Register State | When can they submit? |
|---|---|---|---|
| OPEN_ACCESS | Public, instant | SHORTLISTED immediately | Immediately if round is active |
| APPLICATION_REVIEW | Public, "Apply" button | PENDING → admin shortlists | Only after status = SHORTLISTED |
| INVITE_ONLY | Not shown | Admin sets status directly | When admin enables |

### Participation Mode Behaviour

| Mode | Form shown | Registration model used | Dashboard label |
|---|---|---|---|
| SOLO_ONLY | Solo fields only | `Registration` | "My Registration" |
| TEAM_ONLY | Team fields + member blocks | `Team` + `TeamMember` | "My Team" |
| BOTH | Asks user first, then shows appropriate form | Either | Depends on choice |

### Submission Round Logic

```
Round.submissionRequired = false → no submission for this round, just a schedule entry
Round.submissionRequired = true  → submission portal unlocked for eligible participants
Round.submissionType             → determines what form of submission is shown
Round.submissionDeadline         → hard cutoff (server-side enforced)
```

### Judging Logic

```
hasJudging = false     → No JudgingTab, no judge portal, scores done manually by admin
hasJudging = true      → JudgingTab shown, judges invited via email, scoring portal active

JudgingCriteria per round → judges score each criterion → scores aggregated
Normalization on → scores normalized across judges before ranking
resultsPublished = true → participant dashboard shows Judges tab + final scores/rank
```

### Check-In Logic

```
requiresCheckIn = false → no QR generated, no CheckInTab
requiresCheckIn = true  → QR code generated on registration
                        → CheckInTab shown in admin
                        → participant dashboard shows QR code in Overview tab
                        → status changes to CHECKED_IN on scan
```

---

## 11. Judging & Scoring System

### Judge Portal — `/judging/:eventSlug`

Separate route, accessible only to users with `role = JUDGE` assigned to this event.

```
Header: [Event Name] — Judge Portal | [Judge Name]

SUBMISSIONS TO REVIEW:
  Filter: Round | Track (if hasTracks) | Scored / Unscored
  
  Per submission card:
    Team/Participant name | Track | Submitted at
    [View Submission] → opens file/link
    
    Scoring form (per criterion defined for this round):
      Criterion name + description + max score
      Score input (0 to maxScore)
      Comment (optional)
    
    [Submit Scores]

MY SCORING PROGRESS:
  X / Y submissions scored
  Progress bar

SCORED SUBMISSIONS:
  View previously submitted scores
  [Edit] (if judging still open)
```

### Score Aggregation (Backend Logic)

```
For each submission:
  rawScore = Σ (criterionScore × criterionWeight) / Σ weights

If normalization enabled:
  zScore per judge = (score - judgeAvg) / judgeStdDev
  normalizedScore = mean(zScores for all judges)

finalRank = sort by normalizedScore DESC
```

---

## 12. Communications System

### Automated Triggers

| Trigger condition | Email sent | Template |
|---|---|---|
| Registration submitted (OPEN_ACCESS) | Participant(s) | Registration Confirmed |
| Registration submitted (APPLICATION_REVIEW) | Participant(s) | Application Received |
| Account auto-created | Team lead | Set Your Password |
| Status → SHORTLISTED | Team lead | You're In! |
| Status → REJECTED | Team lead | Thank You for Applying |
| Status → WAITLISTED | Team lead | You're on the Waitlist |
| Submission received | Team lead | Submission Confirmed |
| `reminderHoursBefore` before submission deadline | All eligible, not yet submitted | Submission Reminder |
| Day before event | All SHORTLISTED / CHECKED_IN | Event Day Reminder + QR Code |
| `resultsPublished` set to true | All participants | Results Announced |
| Judge invited | Judge user | Judge Invitation + portal link |

### Template Variable Reference

| Variable | Value |
|---|---|
| `{{name}}` | Participant / team lead name |
| `{{teamName}}` | Team name (team events) |
| `{{registrationId}}` | e.g. FP26-T-0001 |
| `{{eventName}}` | Event title |
| `{{eventDate}}` | Formatted event date |
| `{{venue}}` | Event venue |
| `{{submissionDeadline}}` | Nearest upcoming deadline |
| `{{statusMessage}}` | Context-specific message |
| `{{qrCodeUrl}}` | QR image URL for check-in |
| `{{dashboardUrl}}` | Direct link to participant dashboard |

---

## 13. Auction Module — Standalone

> **This is a completely independent module.** It is NOT a tab inside the admin portal. It does NOT share any frontend routes with the admin portal. It shares only the PostgreSQL database to read team data.

### What "Standalone" Means

- Has its own routes: `/auction/:eventSlug/admin` and `/auction/:eventSlug/board`
- Has its own React pages: `src/our/views/auction/`
- Has its own service file: `src/services/auction.service.js`
- Reads from the shared DB (teams, event config) via its own API endpoints
- Writes only to `PointTransaction` and `Problem` tables
- The only link to the admin portal: `Event.auctionEnabled = true` flag, and a "Launch Auction Module →" external link shown in the admin settings page

### Data Bridge (Read-Only from Admin DB)

When the auction module initialises for an event, it reads:
```
GET /api/auction/:eventSlug/init
→ Returns all SHORTLISTED teams for this event (name, registrationId, teamSize)
→ Returns all Problems configured for this event
→ Sets up team records in auction state with 1000 starting points each
```

This is a one-time read. After init, all point state lives in `PointTransaction` table.

### Auction Routes

```
/auction/:eventSlug/admin    → Admin control panel (password protected, separate from main admin auth)
/auction/:eventSlug/board    → Public read-only leaderboard (for projector display)
```

### Admin Control Panel — `/auction/:eventSlug/admin`

Two-column layout:

```
LEFT COLUMN — Live Leaderboard (auto-refresh every 10s)
  Rank | Team Name | Points | Problem Won
  [Refresh Now] | Last updated: HH:MM:SS

RIGHT COLUMN — Control Panel

  Panel 1: BID ENTRY
    Team: [dropdown — all teams]
    Problem: [dropdown — all problems]  
    Amount: [number] — shows "Available: X pts" live
    [Submit Bid] → ConfirmDialog → deducts + logs PointTransaction

  Panel 2: MANUAL ADJUSTMENT
    Team, Add/Deduct toggle, Amount, Reason (required)
    [Apply] → ConfirmDialog

  Panel 3: PROBLEM ASSIGNMENT
    P1–P8: each with "Assign winner" dropdown + [Assign]
    Assigned: shows "Won by [Team]" green badge

  Panel 4: ACTIONS
    [↩ Undo Last Action] — shows what will be undone
    [⚠ Reset All to 1,000 pts] — password confirmation
    [⬇ Export CSV]

BELOW — Transaction Log
  Time | Team | Action | Δ Points | Operator
```

### Public Leaderboard — `/auction/:eventSlug/board`

```
Polls GET /api/auction/:eventSlug/leaderboard every 10s
Designed for 1080p projector display

Rank | Team Name | Points | Problem Won
Animated rank transitions
Zero admin controls
```

### Auction API Routes

```
GET  /api/auction/:eventSlug/init              Init — load teams + problems
GET  /api/auction/:eventSlug/leaderboard       Public board data
POST /api/auction/:eventSlug/bid               Submit bid
POST /api/auction/:eventSlug/adjust            Manual adjustment
POST /api/auction/:eventSlug/assign            Assign problem
POST /api/auction/:eventSlug/undo              Undo last transaction
POST /api/auction/:eventSlug/reset             Full reset (password required)
GET  /api/auction/:eventSlug/transactions      Full log
GET  /api/auction/:eventSlug/export            CSV export
```

---

## 14. API Route Map v2

```
# ── AUTH ─────────────────────────────────────────────────────────────
POST   /api/auth/signup
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh
POST   /api/auth/forgot-password
POST   /api/auth/verify-otp
POST   /api/auth/reset-password
POST   /api/auth/setup-password
GET    /api/auth/me

# ── PUBLIC EVENTS ─────────────────────────────────────────────────────
GET    /api/events                               All public events (with filters)
GET    /api/events/:slug                         Event detail + rounds + prizes + tracks
GET    /api/events/:slug/check-rollno            Uniqueness check
GET    /api/events/:slug/leaderboard             Public leaderboard (if enabled)

# ── REGISTRATION ──────────────────────────────────────────────────────
POST   /api/events/:slug/register                Solo or team registration (body determines)

# ── PARTICIPANT ───────────────────────────────────────────────────────
GET    /api/participant/:slug/registration        My registration for this event
PATCH  /api/participant/:slug/registration        Edit (PENDING only)
POST   /api/participant/:slug/submit/:roundId     Upload file/link/form
GET    /api/participant/:slug/submissions         My submission history

# ── ADMIN — PLATFORM ──────────────────────────────────────────────────
GET    /api/admin/stats                          Platform-wide stats (all events)
GET    /api/admin/events                         All events
POST   /api/admin/events                         Create event
GET    /api/admin/events/:slug                   Event detail + live stats object
PATCH  /api/admin/events/:slug                   Update event details
PATCH  /api/admin/events/:slug/settings          Update EventSettings (structured payload)

# ── ADMIN — REGISTRATIONS ─────────────────────────────────────────────
GET    /api/admin/events/:slug/registrations     All (solo + team unified)
                                                  ?status=&year=&branch=&track=&type=solo|team&search=
GET    /api/admin/events/:slug/registrations/:id Single entry detail
PATCH  /api/admin/events/:slug/registrations/:id Update status
POST   /api/admin/events/:slug/registrations/bulk Bulk status update
GET    /api/admin/events/:slug/registrations/export CSV
POST   /api/admin/events/:slug/registrations/checkin/:id Manual check-in

# ── ADMIN — SUBMISSIONS ───────────────────────────────────────────────
GET    /api/admin/events/:slug/submissions        All (filters: round, track, reviewer, status)
PATCH  /api/admin/events/:slug/submissions/:id    Review notes, reviewer, score, track
GET    /api/admin/events/:slug/submissions/export ZIP download

# ── ADMIN — JUDGING ───────────────────────────────────────────────────
GET    /api/admin/events/:slug/judges             All judges for event
POST   /api/admin/events/:slug/judges             Invite judge (creates JUDGE user + sends email)
DELETE /api/admin/events/:slug/judges/:judgeId    Remove judge
GET    /api/admin/events/:slug/scores             All scores aggregated per submission
POST   /api/admin/events/:slug/results/publish    Set resultsPublished = true + notify all

# ── ADMIN — CHECK-IN ──────────────────────────────────────────────────
GET    /api/admin/events/:slug/checkin            Check-in stats + log
POST   /api/admin/events/:slug/checkin/scan       Process QR scan → check in participant
GET    /api/admin/events/:slug/checkin/export     Attendance CSV

# ── ADMIN — COMMUNICATIONS ────────────────────────────────────────────
GET    /api/admin/events/:slug/emails             Email history
POST   /api/admin/events/:slug/emails/send        Send (immediate or scheduled)
GET    /api/admin/events/:slug/emails/templates   Template list

# ── JUDGE PORTAL ──────────────────────────────────────────────────────
GET    /api/judging/:slug/submissions             Submissions assigned to this judge
POST   /api/judging/:slug/scores                  Submit scores for a submission
PATCH  /api/judging/:slug/scores/:id              Edit score (while judging open)
GET    /api/judging/:slug/progress                My scoring progress

# ── AUCTION MODULE (STANDALONE) ───────────────────────────────────────
GET    /api/auction/:slug/init
GET    /api/auction/:slug/leaderboard
POST   /api/auction/:slug/bid
POST   /api/auction/:slug/adjust
POST   /api/auction/:slug/assign
POST   /api/auction/:slug/undo
POST   /api/auction/:slug/reset
GET    /api/auction/:slug/transactions
GET    /api/auction/:slug/export
```

---

## 15. Email Notifications

All emails logged in `EmailLog`. Template variables: `{{name}}`, `{{teamName}}`, `{{registrationId}}`, `{{eventName}}`, `{{eventDate}}`, `{{venue}}`, `{{submissionDeadline}}`, `{{dashboardUrl}}`, `{{qrCodeUrl}}`.

| Trigger | Recipient | Template |
|---|---|---|
| OPEN_ACCESS registration | Participant(s) | Registration Confirmed |
| APPLICATION_REVIEW registration | Participant(s) | Application Received — we'll be in touch |
| Account auto-created | Lead | Set Your Password (link, 48hr) |
| Status → SHORTLISTED | Lead | You're In! + submission link + QR (if check-in) |
| Status → REJECTED | Lead | Thank You for Applying |
| Status → WAITLISTED | Lead | You're on the Waitlist |
| Submission received | Lead | Submission Confirmed — filename + time |
| N hours before deadline | Non-submitted eligible teams | Submission Reminder |
| Day before event | All shortlisted | Event Day Reminder + QR Code |
| `resultsPublished` = true | All registered | Results Announced |
| Judge invited | Judge | Judge Invitation + portal link |
| Admin bulk send | Any group | Custom |

---

## 16. Folder & File Structure

### Frontend (`edcjssun-event-frontend`)

```
src/
├── our/
│   └── views/
│       ├── admin/                          ← Dev 3 domain
│       │   ├── Dashboard.jsx
│       │   ├── EventsList.jsx
│       │   ├── CreateEvent.jsx
│       │   ├── EventAdminHome.jsx
│       │   └── components/
│       │       ├── RegistrationsTab.jsx
│       │       ├── TeamDetailDrawer.jsx
│       │       ├── ShortlistTab.jsx
│       │       ├── SubmissionsTab.jsx
│       │       ├── JudgingTab.jsx          ← NEW
│       │       ├── CheckInTab.jsx          ← NEW
│       │       ├── CommunicationsTab.jsx
│       │       └── SettingsTab.jsx
│       │
│       ├── participant/                    ← Dev 2 domain
│       │   ├── Home.jsx
│       │   ├── EventsDirectory.jsx
│       │   ├── EventLanding.jsx
│       │   ├── RegisterForm.jsx
│       │   ├── ParticipantDashboard.jsx
│       │   └── PublicLeaderboard.jsx
│       │
│       ├── auth/                           ← Dev 2 domain
│       │   ├── Login.jsx
│       │   ├── Signup.jsx
│       │   ├── ForgotPassword.jsx
│       │   └── SetupPassword.jsx
│       │
│       └── auction/                        ← Dev 3 domain (post March 30)
│           ├── AuctionAdmin.jsx
│           └── AuctionBoard.jsx
│
├── components/
│   ├── layout/
│   │   ├── Navbar.jsx                      ← Dev 2
│   │   ├── AdminSidebar.jsx                ← Dev 3
│   │   └── ParticipantSidebar.jsx          ← Dev 2
│   ├── events/
│   │   ├── EventCard.jsx                   ← Dev 2 (shared)
│   │   ├── CountdownTimer.jsx              ← Dev 2 (shared)
│   │   ├── RoundTimeline.jsx               ← Dev 2
│   │   ├── ScheduleTable.jsx               ← Dev 2
│   │   ├── PrizesSection.jsx               ← Dev 2
│   │   └── FAQAccordion.jsx                ← Dev 2
│   ├── registration/
│   │   ├── RegistrationForm.jsx            ← Dev 2
│   │   ├── MemberBlock.jsx                 ← Dev 2
│   │   └── StepIndicator.jsx              ← Dev 2
│   └── ui/                                ← Dev 2 builds, everyone imports
│       ├── Badge.jsx
│       ├── Toast.jsx
│       ├── Modal.jsx
│       ├── Drawer.jsx
│       ├── ConfirmDialog.jsx
│       ├── FileUpload.jsx
│       ├── DataTable.jsx
│       ├── Spinner.jsx
│       └── EmptyState.jsx
│
├── services/
│   ├── api.js                             ← Dev 2 owns — one copy
│   ├── auth.service.js                    ← Dev 2
│   ├── events.service.js                  ← Dev 2
│   ├── registration.service.js            ← Dev 2
│   ├── participant.service.js             ← Dev 2
│   ├── admin.service.js                   ← Dev 3
│   ├── auction.service.js                 ← Dev 3 (post March 30)
│   └── mock/
│       ├── auth.mock.js
│       ├── events.mock.js
│       ├── participant.mock.js
│       └── admin.mock.js                  ← Dev 3
│
├── store/
│   ├── authStore.js                       ← Dev 2 owns
│   └── leaderboardStore.js                ← Dev 3 (auction module)
│
└── hooks/
    ├── useAuth.js
    ├── usePolling.js
    └── useEventSettings.js
```

### Backend (`edcjssun-backend`)

```
prisma/
  schema.prisma

src/
  index.js
  routes/
    auth.routes.js
    events.routes.js
    registration.routes.js
    participant.routes.js
    admin.routes.js
    judging.routes.js          ← NEW
    checkin.routes.js          ← NEW
    auction.routes.js          ← standalone
  controllers/ (mirrors routes)
  middleware/
    auth.middleware.js
    error.middleware.js
  services/
    email.service.js
    upload.service.js
    qr.service.js              ← NEW: QR generation
    scoring.service.js         ← NEW: score aggregation + normalization
  utils/
    generateId.js
    jwt.js
```

---

## 17. Non-Functional Requirements

| Requirement | Detail |
|---|---|
| **Event-agnostic core** | Every feature controlled by event config. Zero hardcoded event logic anywhere. |
| **Auction isolation** | Auction module has zero imports from admin portal code. Shares DB only. A completely standalone deployable module if needed. |
| **Mobile-first** | Registration form, event landing page, participant dashboard — all must work on mobile Chrome on Android |
| **Projector display** | Auction public board must render at 1080p full-screen without layout issues |
| **Concurrent safety** | Registration ID generation and Roll No. uniqueness must be DB-level atomic — no race conditions |
| **File upload resilience** | Progress bar, retry on timeout, clear error state, never lose form data |
| **Admin auth hardening** | All `/api/admin/*` return 401 for unauthenticated. All `/api/judging/*` check judge role + event assignment. |
| **Auction auth** | Auction admin panel uses a separate password (not the main JWT system) — simple but effective |
| **Code freeze** | No deployments after April 13 EOD. April 14 = dry run. April 15 = event. |
| **Pre-event backup** | Full DB export at 8:30 AM April 15 before event starts |
| **Settings audit** | All `EventSettings` changes logged with `updatedBy` + `updatedAt` |
| **Settings payload contract** | Backend `GET/PATCH /api/admin/events/:slug/settings` must match Dev 3's structured payload shape exactly: `{ toggles, deadlines, limits, communications, automation }` |

---

## Appendix: Key Decisions for Dev 1 (Backend)

These are the specific backend decisions that changed from v1 based on Dev 3's implementation and the broader platform rethink:

1. **Stats endpoint:** Add `GET /api/admin/stats` for platform-wide stats (used by super admin dashboard). Keep event-level stats embedded in `GET /api/admin/events/:slug` as a `stats: {}` object.

2. **Settings payload shape:** `GET/PATCH /api/admin/events/:slug/settings` must use the structured payload `{ toggles, deadlines, limits, communications, automation }` — not flat fields. Map these to the `EventSettings` prisma model on the backend.

3. **Submission model additions:** Add `track String?` and `reviewedBy String?` to the `Submission` prisma model. These are optional fields — no existing functionality breaks.

4. **Unified registrations endpoint:** `GET /api/admin/events/:slug/registrations` must return both solo registrations and team registrations in one unified array with a `type: "solo" | "team"` discriminator field.

5. **Auction routes:** All auction routes live at `/api/auction/:slug/*` — NOT under `/api/admin/*`. Auction module has its own auth (simple password), not the main JWT system.

6. **QR code generation:** Add a `qr.service.js` that generates a unique QR token on registration and stores it. `GET /api/admin/events/:slug/checkin/scan` validates the token and marks the participant as CHECKED_IN.

7. **Judge role:** Add `JUDGE` to the `Role` enum. Judge users are created by admin via `POST /api/admin/events/:slug/judges` which creates the user account (if not exists) and sends an invite email with portal link.

+ NOTE: In future iterations, the auction module may be deployed on a dedicated subdomain:
+ auction.edcjssun.com for complete isolation.
+ | **CORS Configuration** | Backend must allow origins: https://events.edcjssun.com and https://www.edcjssun.com with credentials enabled |
---

*Prepared by: EDC Technical Team, JSS University Noida*  
*PRD Version: 2.0 | March 2026*  
*Supersedes: EDC_Event_Management_Platform_PRD.md (v1.0)*
