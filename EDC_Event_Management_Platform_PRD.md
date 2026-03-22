# EDC Event Management Platform — PRD
**Product:** edcjssun.com — Event Management Portal  
**Version:** 1.0 (Founder's Pit 2026 as Launch Event)  
**Stack:** React + Vite (Frontend) | Node.js + Express (Backend) | PostgreSQL | Prisma ORM | JWT Auth | Cloudinary (File Storage) | Resend (Email)  
**Philosophy:** Build once, run every event. Founder's Pit 2026 is the first event on this platform — every system, schema, and UI must be generic enough to support future events without rebuilding. The Auction/Virtual Points System is an optional event-specific module, not a core platform feature.  
**Live Target:** March 31, 2026

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [System Architecture](#2-system-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Database Schema](#4-database-schema)
5. [Authentication System](#5-authentication-system)
6. [Participant-Facing Features](#6-participant-facing-features)
7. [Admin Portal](#7-admin-portal)
8. [Auction & Virtual Points Module](#8-auction--virtual-points-module-event-specific)
9. [API Route Map](#9-api-route-map)
10. [Email Notifications](#10-email-notifications)
11. [Frontend Component Architecture](#11-frontend-component-architecture)
12. [Phased Build Plan](#12-phased-build-plan)
13. [Non-Functional Requirements](#13-non-functional-requirements)

---

## 1. Product Vision

This is EDC JSS University Noida's own internal event management platform — inspired by Unstop, Devfolio, and Luma — but purpose-built for EDC's events. The platform serves three audiences:

| Audience | What They Need |
|---|---|
| **Participants** | Discover events, register as a team, track status, submit deliverables, see results |
| **Organizers (Event Admins)** | Manage registrations, run event-day systems, communicate with teams |
| **Super Admins (EDC Core)** | Create and configure new events, manage the full portal, view analytics across all events |

Every feature is parameterised by `eventSlug`. No hardcoded event logic anywhere in the core system. New events = new config, not a new build.

---

## 2. System Architecture

```
edcjssun.com/
│
├── /                                  ← Homepage (EDC + all events listing)
├── /events                            ← All events directory
├── /events/:eventSlug                 ← Event landing page (public)
├── /events/:eventSlug/register        ← Team registration
├── /events/:eventSlug/dashboard       ← Participant dashboard (auth required)
├── /events/:eventSlug/submit          ← Deliverable submission (shortlisted only)
├── /events/:eventSlug/leaderboard     ← Public live leaderboard (optional module)
│
├── /auth/login                        ← Login
├── /auth/signup                       ← Account creation
├── /auth/forgot-password              ← Password reset
│
└── /admin                             ← Admin portal (protected)
    ├── /admin/dashboard               ← Super admin overview (all events)
    ├── /admin/events                  ← All events management
    ├── /admin/events/new              ← Create new event
    ├── /admin/events/:eventSlug       ← Single event admin home
    │   ├── /registrations             ← View + manage all teams
    │   ├── /submissions               ← Deliverable review
    │   ├── /shortlist                 ← Shortlisting interface
    │   ├── /communications            ← Send emails to teams
    │   ├── /leaderboard               ← Auction control panel (if enabled)
    │   └── /settings                  ← Event configuration
    └── /admin/settings                ← Platform-wide settings
```

---

## 3. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React + Vite | Existing site — all new pages added here |
| Routing | React Router v6 | Client-side routing |
| State Management | Zustand | Lightweight, sufficient for this scale |
| Styling | Tailwind CSS + shadcn/ui | Component library for dashboards |
| Backend | Node.js + Express | Separate API server |
| Database | PostgreSQL | Hosted on Railway or Supabase |
| ORM | Prisma | Type-safe queries + easy migrations |
| Auth | JWT + HTTP-only cookies | Access token (15 min) + refresh token (7 days) pattern |
| File Storage | Cloudinary | PPT/PDF/image uploads |
| Email | Resend | Transactional emails via API |
| Real-time | HTTP Polling (10s) | Leaderboard refresh — no WebSockets needed at 24-team scale |
| Deployment | Frontend: Vercel / Netlify. Backend: Railway / Render | |

---

## 4. Database Schema

### 4.1 Users

```prisma
model User {
  id            String    @id @default(cuid())
  name          String
  email         String    @unique
  password      String    // bcrypt hashed
  role          Role      @default(PARTICIPANT)
  avatar        String?   // URL
  phone         String?
  institution   String?   // "JSS University, Noida"
  isVerified    Boolean   @default(false)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  teamMembers   TeamMember[]
  sessions      RefreshToken[]
}

enum Role {
  PARTICIPANT
  EVENT_ADMIN      // manages one or more specific events
  SUPER_ADMIN      // full platform access
}
```

### 4.2 Events

```prisma
model Event {
  id                   String       @id @default(cuid())
  slug                 String       @unique  // "founders-pit-2026"
  title                String                // "Founder's Pit 2026"
  tagline              String?
  description          String
  coverImage           String?      // URL
  logo                 String?      // URL
  venue                String
  eventDate            DateTime
  eventEndDate         DateTime?
  registrationOpen     Boolean      @default(false)
  registrationDeadline DateTime?
  maxTeams             Int          @default(24)
  teamSizeMin          Int          @default(2)
  teamSizeMax          Int          @default(4)
  eligibility          String?      // "1st & 2nd year JSS students"
  entryFee             Int          @default(0)   // 0 = free
  prizePool            Int?
  status               EventStatus  @default(DRAFT)
  isPublic             Boolean      @default(false)
  auctionEnabled       Boolean      @default(false)  // opt-in module
  createdBy            String       // Super Admin user ID
  createdAt            DateTime     @default(now())
  updatedAt            DateTime     @updatedAt

  rounds               Round[]
  teams                Team[]
  prizes               Prize[]
  problems             Problem[]    // only used if auctionEnabled
  settings             EventSettings?
  admins               EventAdmin[]
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

### 4.3 Event Rounds

```prisma
model Round {
  id            String     @id @default(cuid())
  eventId       String
  order         Int        // 1, 2, 3, 4, 5
  name          String     // "Strategic Bidding", "Final Pitch"
  description   String?
  startTime     DateTime?
  endTime       DateTime?
  roundType     RoundType
  isActive      Boolean    @default(false)

  event         Event      @relation(fields: [eventId], references: [id])
}

enum RoundType {
  SUBMISSION      // PPT/file upload round
  BIDDING         // Virtual auction round (auction module only)
  PRESENTATION    // Pitch/demo round
  QUIZ            // Q&A / assessment
  CRISIS          // Crisis simulation
  GENERAL         // Generic / custom
}
```

### 4.4 Teams

```prisma
model Team {
  id              String       @id @default(cuid())
  registrationId  String       @unique  // FP26-0001
  eventId         String
  teamName        String
  teamSize        Int
  status          TeamStatus   @default(PENDING)
  hearAboutUs     String?
  pointBalance    Int          @default(1000)  // auction module only
  problemWon      String?                       // auction module only
  checkInStatus   Boolean      @default(false)
  submittedAt     DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  event           Event        @relation(fields: [eventId], references: [id])
  members         TeamMember[]
  submissions     Submission[]
  transactions    PointTransaction[]
}

enum TeamStatus {
  PENDING
  SHORTLISTED
  WAITLISTED
  REJECTED
  CHECKED_IN
}
```

### 4.5 Team Members

```prisma
model TeamMember {
  id        String   @id @default(cuid())
  teamId    String
  userId    String?  // linked if they have a portal account
  name      String
  rollNo    String
  year      String   // "1st" / "2nd"
  branch    String
  email     String
  phone     String
  isLead    Boolean  @default(false)

  team      Team     @relation(fields: [teamId], references: [id])
  user      User?    @relation(fields: [userId], references: [id])

  @@unique([rollNo, teamId])
}
```

### 4.6 Submissions

```prisma
// Generic — handles PPT, PDF, links, or any deliverable type
model Submission {
  id            String          @id @default(cuid())
  teamId        String
  eventId       String
  roundId       String?
  type          SubmissionType
  fileUrl       String?         // Cloudinary URL
  fileName      String?
  fileSize      Int?            // bytes
  externalLink  String?         // for link-type submissions
  submittedAt   DateTime        @default(now())
  updatedAt     DateTime        @updatedAt
  reviewNotes   String?         // admin shortlisting notes
  score         Float?          // if scored by admin

  team          Team            @relation(fields: [teamId], references: [id])
}

enum SubmissionType {
  PPT
  PDF
  DOCUMENT
  LINK
  IMAGE
}
```

### 4.7 Virtual Points & Transactions (Auction Module)

```prisma
// Only used when Event.auctionEnabled = true
model PointTransaction {
  id          String   @id @default(cuid())
  teamId      String
  eventId     String
  amount      Int      // negative = deduction
  reason      String   // "Bid: Problem 3", "Crisis R4 penalty"
  adminNote   String?
  createdAt   DateTime @default(now())
  createdBy   String   // admin user ID

  team        Team     @relation(fields: [teamId], references: [id])
}
```

### 4.8 Problems / Auction Items (Auction Module)

```prisma
// Only used when Event.auctionEnabled = true
model Problem {
  id           String   @id @default(cuid())
  eventId      String
  order        Int      // 1–8 display order
  title        String
  description  String
  category     String?
  isActive     Boolean  @default(true)
  assignedTeam String?  // Team ID of winning bidder

  event        Event    @relation(fields: [eventId], references: [id])
}
```

### 4.9 Prizes

```prisma
model Prize {
  id       String @id @default(cuid())
  eventId  String
  rank     Int    // 1 = winner, 2 = 1st runner-up, etc.
  label    String // "Winner", "1st Runner-Up"
  amount   Int    // in INR
  perks    String // "Trophy + Certificate"

  event    Event  @relation(fields: [eventId], references: [id])
}
```

### 4.10 Event Settings

```prisma
model EventSettings {
  id                       String    @id  // = eventId
  pptSubmissionOpen        Boolean   @default(false)
  pptSubmissionDeadline    DateTime?
  leaderboardVisible       Boolean   @default(false)  // auction module
  biddingActive            Boolean   @default(false)  // auction module
  currentPhase             String    @default("pre-event")
  allowWalkIns             Boolean   @default(false)
  updatedAt                DateTime  @updatedAt
  updatedBy                String?

  event                    Event     @relation(fields: [id], references: [id])
}
```

### 4.11 Email Log

```prisma
model EmailLog {
  id          String   @id @default(cuid())
  eventId     String?
  recipient   String   // email address
  type        String   // "REGISTRATION_CONFIRMED", "SHORTLISTED", etc.
  subject     String
  status      String   // "SENT", "FAILED"
  sentAt      DateTime @default(now())
}
```

### 4.12 Refresh Tokens

```prisma
model RefreshToken {
  id        String   @id @default(cuid())
  userId    String
  token     String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id])
}
```

---

## 5. Authentication System

### 5.1 Auth Flow

```
SIGNUP
  → User fills name, email, password
  → Account created, email verification sent
  → Email verified → can log in

LOGIN
  → Email + password submitted
  → Server validates, issues:
      accessToken   (JWT, 15 min expiry, stored in Zustand memory)
      refreshToken  (JWT, 7 days, HTTP-only cookie)

TOKEN REFRESH
  → On accessToken expiry, frontend auto-calls POST /api/auth/refresh
  → Server validates refreshToken cookie → issues new accessToken
  → Seamless for user — no re-login required

LOGOUT
  → DELETE /api/auth/logout
  → Refresh token deleted from DB + cookie cleared

PASSWORD RESET
  → User requests reset → 6-digit OTP emailed (15 min expiry)
  → OTP verified → new password set
```

### 5.2 Registration-to-Account Flow

When a team submits the registration form:
1. System checks if Member 1's email already has an account
2. If **no account** → creates one, sends "Set your password" email with a one-time setup link (48hr expiry)
3. If **account exists** → links the registration to that account
4. After shortlisting → team lead logs in to access participant dashboard + PPT submission

### 5.3 Route Guards (Frontend)

```
/events/:slug/dashboard     → requireAuth + requireRole(PARTICIPANT)
/events/:slug/submit        → requireAuth + requireShortlisted(eventSlug)
/admin/*                    → requireAuth + requireRole(EVENT_ADMIN | SUPER_ADMIN)
/admin/events/new           → requireRole(SUPER_ADMIN)
/admin/settings             → requireRole(SUPER_ADMIN)
```

All other event pages are publicly accessible without authentication.

---

## 6. Participant-Facing Features

### 6.1 Homepage — `/`

Inspired by Luma's clean event discovery layout.

- EDC header with logo + nav (Events, About, Login / Profile avatar)
- Hero section: EDC tagline + "Explore Events" CTA
- **Featured Events** section: card grid of upcoming/live events
- **Past Events** section: archived events with outcomes
- Footer: EDC links, social handles

**Event Card** shows: cover image, event name, date, venue, registration status badge (Open / Closing Soon / Closed / Upcoming), prize pool.

---

### 6.2 Events Directory — `/events`

- Grid/list of all public events
- Filter by: Status (Open / Upcoming / Past), Category (Startup / Technical / Cultural)
- Search by event name
- Each card includes "Register Now" / "View Event" CTA

---

### 6.3 Event Landing Page — `/events/:eventSlug`

Modelled after Devfolio event pages — clean, energetic, mobile-first. All content is rendered dynamically from the `Event` and related tables.

#### Sections

**Hero**
- Full-width cover image
- Event name, tagline, date, venue
- Registration status badge
- Countdown timer (days : hours : minutes : seconds) to event date
- Primary CTA: "Register Now" → `/events/:slug/register`
- Secondary CTA: "View My Dashboard" (if logged in and already registered)
- After `registrationDeadline`: button switches to "Registration Closed" (disabled, grey) automatically

**About**
- Event description (rich text from admin)
- "What makes it different" comparison block (configurable per event)

**Rounds / Format**
- Visual horizontal step-by-step timeline component
- Each step: icon + round name + time + one-line description
- Rendered from `Round` table — works for any event format, not just Founder's Pit

**Schedule**
- Full day timeline: Time | Activity | Description

**Prizes**
- Prize cards rendered from `Prize` table
- Rank, amount in ₹, perks

**Eligibility & Rules**
- Rendered from `event.eligibility` field + rules list

**FAQ Accordion**
- Configurable per event from admin settings
- Default FAQs:
  - Can I participate alone? → No, minimum 2 members.
  - What do I submit? → A 3-slide PPT: Problem | Who it affects | Why it matters.
  - Last date to register? → April 10, 2026.
  - When are results announced? → April 12, 2026.
  - Any registration fee? → No, completely free.
  - Do I need business knowledge? → No, open to all.

**Footer CTA**
- "Ready to build your startup?" + Register button

---

### 6.4 Team Registration Form — `/events/:eventSlug/register`

Available only when `event.registrationOpen = true` AND current time < `registrationDeadline`. Enforced both client-side and server-side.

#### Multi-Step Form Structure

```
STEP 1 — TEAM INFO
  Team Name             Text          Required | max 40 chars
  Team Size             Dropdown      Required | 2 / 3 / 4
  How did you hear?     Dropdown      Optional | Instagram / LinkedIn /
                                                Classmate / Professor /
                                                WhatsApp / Other

STEP 2 — MEMBER DETAILS  (repeated per team size selected)
  [FOR EACH MEMBER 1–4]
  Full Name             Text          Required
  Roll Number           Text          Required | unique, checked on blur via API
  Year                  Dropdown      Required | 1st Year / 2nd Year
  Branch                Text          Required
  Email                 Email         Required | validated format
  Phone                 Number        Required | exactly 10 digits

STEP 3 — REVIEW & SUBMIT
  Read-only summary of all entered details
  Checkbox: "I confirm all details are correct and all members are
             eligible students of JSS University, Noida."
  [Submit Registration]   ← disabled until checkbox is checked
```

**UX Notes:**
- Progress bar at top: Step 1 → Step 2 → Step 3
- "Next" and "Back" navigation between steps, form state preserved
- Member 2, 3, 4 blocks appear/collapse dynamically based on Team Size
- Roll No. uniqueness: API call on blur → inline error shown immediately if duplicate

#### On Success
- Full-page confirmation screen
- Shows: Team Name, Registration ID (`FP26-0001`), "Check your email" message
- Copy button for Registration ID
- Option to "Set up your account now" if email not yet registered
- "Share" button: copy link to event page

#### Error States
- Duplicate Roll No. → `"This roll number is already registered"`
- Registration closed → redirect to closed state screen
- Server error → toast notification, form state fully preserved

#### Registration Closed State
- After `registrationDeadline`: form replaced with closed banner
- Controlled by `EventSettings.registrationOpen` toggle (admin can override)
- Deadline also enforced server-side — API returns `403` if registration is closed

#### Admin View
Route: `/admin/events/:eventSlug/registrations`
- Full table with filters: Status, Year, Branch, Team Size, Date Range
- Search: by team name, roll number, name, email
- Individual team detail drawer: all member info + submission status + status change + internal notes
- Bulk status update → triggers batch emails
- CSV export of all registrations including all member fields

---

### 6.5 Participant Dashboard — `/events/:eventSlug/dashboard`

Access: Authenticated participants only. Inspired by Unstop's participant portal.

```
┌─────────────────────────────────────────────────────────┐
│  FOUNDER'S PIT 2026             [Avatar]  [Logout]      │
├──────────────┬──────────────────────────────────────────┤
│              │                                          │
│  Overview    │   MAIN CONTENT AREA                      │
│  My Team     │                                          │
│  Submissions │                                          │
│  Schedule    │                                          │
│  Leaderboard │                                          │
│  Help        │                                          │
│              │                                          │
└──────────────┴──────────────────────────────────────────┘
```

#### Overview Tab
- Registration status card: `PENDING / SHORTLISTED / WAITLISTED / REJECTED` with colour badge
- Registration ID + date registered
- Event date countdown timer
- **Next action prompt** (contextual):
  - PENDING → "Shortlisting in progress. We'll notify you by April 12."
  - SHORTLISTED → "Submit your PPT before [deadline]" + CTA button
  - WAITLISTED → "You're on the waitlist. We'll notify you if a spot opens."
  - REJECTED → "Thank you for applying. Stay tuned for our next event."
- Quick links: Event Schedule, Rulebook (PDF), WhatsApp Group

#### My Team Tab
- Team name + Registration ID
- Table of all members: Name | Roll No. | Year | Branch | Email
- Edit option: team lead only, available only while status is PENDING

#### Submissions Tab
- Active only if team is SHORTLISTED
- Current submission status: Not Submitted / Submitted (filename + timestamp)
- Upload area: drag-and-drop or click-to-browse
- Accepts `.pptx` or `.pdf`, max 25 MB
- Re-submission allowed before deadline (replaces previous file)
- Submission history: list of all uploads with timestamps
- Deadline countdown banner

#### Schedule Tab
- Full event day schedule
- Venue / room assignments (if configured by admin)

#### Leaderboard Tab
- Embedded read-only leaderboard (same data as `/events/:slug/leaderboard`)
- Only visible when `EventSettings.leaderboardVisible = true`
- Hidden tab if auction module is not enabled for this event

#### Help Tab
- Event coordinator name + email
- FAQ accordion
- "Report an issue" form → sends email to admin

---

### 6.6 Public Leaderboard — `/events/:eventSlug/leaderboard`

Only accessible when `EventSettings.leaderboardVisible = true` and `Event.auctionEnabled = true`.

- Auto-refreshes every 10 seconds via polling
- Designed to render cleanly at full-screen 1080p on a projector

```
FOUNDER'S PIT 2026 — LIVE LEADERBOARD
Last updated: 10:34:22 AM

Rank   Team Name         Points    Problem Won
──────────────────────────────────────────────
🥇 1   Team Alpha         820       Problem 3
🥈 2   Team Beta          750       Problem 7
🥉 3   Team Gamma         690       Problem 1
   4   Team Delta         640       —
   5   Team Epsilon       580       Problem 5
   ...
```

- Rank changes animate (rows slide up/down) on each refresh
- "Problem Won" shows `—` until assigned by admin
- Zero admin controls on this view

---

## 7. Admin Portal

### 7.1 Super Admin Dashboard — `/admin/dashboard`

Top-level overview across ALL events on the platform.

```
PLATFORM OVERVIEW
┌──────────┬──────────┬─────────────────┬─────────────────┐
│  Total   │  Active  │ Total           │ Total           │
│  Events  │  Events  │ Registrations   │ Participants    │
│    8     │    1     │    312          │   ~900          │
└──────────┴──────────┴─────────────────┴─────────────────┘

ACTIVE EVENTS
  Founder's Pit 2026 | Apr 15 | Registration Open | 47 teams registered
  [Manage Event →]

UPCOMING EVENTS (draft / scheduled)
  ...

RECENT PLATFORM ACTIVITY (audit log)
  ...
```

---

### 7.2 Create New Event — `/admin/events/new`

A multi-step form. This is what makes the platform fully multi-event.

```
STEP 1 — BASICS
  Event Title, Slug (auto-generated, editable), Tagline,
  Description (rich text), Cover Image, Logo

STEP 2 — LOGISTICS
  Event Date, Venue, Eligibility, Entry Fee, Max Teams,
  Team Size Min, Team Size Max

STEP 3 — PRIZES
  [+ Add Prize]: Rank | Label | Amount (₹) | Perks

STEP 4 — ROUNDS
  [+ Add Round]: Round Name | Round Type | Description | Start Time | End Time

STEP 5 — MODULE OPTIONS
  Enable Auction/Virtual Points System   [Toggle]
  (If enabled → unlocks Problems setup and Leaderboard admin)

STEP 6 — PROBLEMS (only shown if auction enabled)
  [+ Add Problem]: Title | Description | Category | Display Order

STEP 7 — SETTINGS & PUBLISH
  Registration Deadline, PPT Submission Deadline,
  Make Event Public [Toggle], Registration Open [Toggle]
  [Save as Draft]   [Publish Event]
```

---

### 7.3 Event Admin Home — `/admin/events/:eventSlug`

```
FOUNDER'S PIT 2026 — ADMIN
April 15, 2026 | JSS University, Noida

┌──────────┬─────────────┬──────────────┬─────────────┬───────────┐
│Registered│ Shortlisted │  Submitted   │ Checked In  │ Days Left │
│  Teams   │   Teams     │    PPTs      │             │           │
│   47     │    0/24     │    0/24      │    0/24     │    26     │
└──────────┴─────────────┴──────────────┴─────────────┴───────────┘

QUICK TOGGLES (instant save)
  Registration      [OPEN ●]    closes April 10
  PPT Submission    [CLOSED ○]  opens after shortlisting
  Leaderboard       [HIDDEN ○]  (auction module — show during bidding)
  Bidding Active    [OFF ○]     (auction module — enable on event day)

NAVIGATION TABS
  Registrations | Submissions | Shortlist | Leaderboard | Communications | Settings
```

---

### 7.4 Registrations — `/admin/events/:eventSlug/registrations`

**Table Columns:** Registration ID | Team Name | Size | Lead Name | Lead Email | Year | Branch | Status | Registered At | Actions

**Filters:** Status, Year, Branch, Team Size, Date Range  
**Search:** Team name, Roll No., Name, Email  
**Bulk Actions:** Select multiple → Change Status → triggers batch emails  
**Export:** All registrations as CSV (all member fields included)

**Team Detail Drawer (slide-in panel):**
- Full member table
- Submission status
- Status change dropdown
- Internal notes field
- Email history for this team

---

### 7.5 Submissions — `/admin/events/:eventSlug/submissions`

**Table Columns:** Team Name | Registration ID | Status (Submitted ✅ / Not Submitted ⏳) | File Name | Size | Submitted At | Actions (Preview | Download | Add Note)

**Filters:** Submitted / Not Submitted  
**Bulk Download:** All submissions as ZIP  
**File Preview:** PDF inline in sidebar; PPTX → direct download  
**Review Notes:** Admin notes per submission (internal only)  
**Score Field:** Optional numeric score per submission

---

### 7.6 Shortlisting Interface — `/admin/events/:eventSlug/shortlist`

```
SHORTLISTING — FOUNDER'S PIT 2026
Target: 24 teams   |   Shortlisted so far: 0   |   Pending review: 47

[View All] [Pending] [Shortlisted] [Waitlisted] [Rejected]

PENDING REVIEW (47)
┌──────────────────────────────────────────────────────────────────┐
│ FP26-0023  Team Zenith  3 members  2nd year  Submitted PPT ✅    │
│            [View PPT]  [Shortlist ✓]  [Waitlist]  [Reject ✗]   │
│            Notes: ___________________________                    │
└──────────────────────────────────────────────────────────────────┘

[Confirm All Decisions]  ← sends batch emails to all teams
```

- PPT preview accessible inline from this page
- Internal notes saved per team (not sent to participant)
- "Confirm All" button: sends emails to shortlisted, waitlisted, and rejected teams in one batch
- Warning shown if fewer than 24 teams are shortlisted before confirming

---

### 7.7 Communications — `/admin/events/:eventSlug/communications`

```
SEND EMAIL

  To:           [Shortlisted Teams ▾]
                Options: All / Shortlisted / Waitlisted /
                         Rejected / Checked-In / Custom Selection

  Template:     [Select template ▾]   (or write custom)
  Subject:      ___________________________
  Body:         [Rich text editor]
                Variables: {{teamName}}, {{registrationId}},
                           {{memberName}}, {{submissionDeadline}},
                           {{eventDate}}, {{eventName}}

  [Preview Email]   [Send to X teams]

EMAIL HISTORY
  Date       | Type                     | Sent To    | Status
  Mar 25     | Registration Confirmed   | 47 teams   | Sent ✅
  ...
```

**Built-in Email Templates:**
- Registration Confirmed
- Shortlisted — You're In!
- Rejected — Thank You for Applying
- Waitlisted — You're on the List
- PPT Submission Reminder (24h before deadline)
- Event Day Reminder (day before)
- Winners Announcement
- Thank You / Post-Event

---

### 7.8 Event Settings — `/admin/events/:eventSlug/settings`

```
GENERAL
  Event Title, Tagline, Description, Cover Image, Logo,
  Event Date, Venue, Eligibility

REGISTRATION
  Registration Open         [Toggle]
  Registration Deadline     [Date + time picker]
  Max Teams                 [Number]
  Team Size Min / Max       [Number]

SUBMISSIONS
  PPT Submission Open       [Toggle]
  PPT Submission Deadline   [Date + time picker]
  Accepted File Types       [.pptx, .pdf]
  Max File Size             [Number in MB]

EVENT DAY
  Allow Walk-ins            [Toggle]
  Current Phase             [Dropdown: Phase 1–6, Post Event]

AUCTION MODULE   (only shown if Event.auctionEnabled = true)
  Leaderboard Visible       [Toggle]
  Bidding Active            [Toggle]

DANGER ZONE   (Super Admin only)
  Archive Event             [Button]
  Delete Event              [Button + double confirmation]

[Save Settings]
```

All setting changes logged with `updatedBy` and `updatedAt` (audit trail).

---

## 8. Auction & Virtual Points Module (Event-Specific)

> **Note:** This is an optional module, enabled per event via `Event.auctionEnabled = true`. It is not part of the core event management system. For events that don't use it, all auction-related UI (Leaderboard tab, bidding toggles, problem setup) is hidden entirely.

For Founder's Pit 2026, this module powers the **Strategic Bidding Round (Round 2, 10:00–11:00 AM on April 15)** and **Crisis Round point adjustments (Round 4)**.

### 8.1 How the Auction Works

- 24 teams, each starts with **1,000 virtual points**
- 8 problem statements are auctioned one at a time
- Teams bid their points to claim a problem — top 3 highest bidders per problem are assigned that problem
- Points spent on a losing bid are still deducted (strategic risk element)
- Remaining points carry forward into the Crisis Round (R4), where adjustments can be made

### 8.2 Admin Control Panel — `/admin/events/:eventSlug/leaderboard`

Two-column layout designed for event-day use.

```
┌────────────────────────────┬───────────────────────────────────┐
│  LEADERBOARD (LIVE)        │  CONTROL PANEL                    │
│                            │                                   │
│  Rank  Team      Points    │  [BID ENTRY]                      │
│  ─────────────────────     │  Team:    [Select Team ▾]         │
│  1  Alpha        820       │  Problem: [Select Problem ▾]      │
│  2  Beta         750       │  Bid Amt: [____]  (max: 820)      │
│  3  Gamma        690       │  [Submit Bid]                     │
│  ...                       │                                   │
│                            │  ─────────────────────────────    │
│  [Refresh now]             │  [MANUAL ADJUSTMENT]              │
│                            │  Team:    [Select Team ▾]         │
│                            │  Type:    [Add / Deduct]          │
│                            │  Amount:  [____]                  │
│                            │  Reason:  [____________] Required │
│                            │  [Apply]                          │
│                            │                                   │
│                            │  ─────────────────────────────    │
│                            │  [PROBLEM ASSIGNMENT]             │
│                            │  P1: [Assign winner ▾]            │
│                            │  ...                              │
│                            │  P8: [Assign winner ▾]            │
│                            │                                   │
│                            │  ─────────────────────────────    │
│                            │  [↩ UNDO LAST ACTION]             │
│                            │  [⚠ RESET ALL]  (Super Admin)     │
│                            │  [⬇ EXPORT CSV]                   │
└────────────────────────────┴───────────────────────────────────┘

TRANSACTION LOG
Time      | Team    | Action               | Δ Points  | Admin
10:34:22  | Alpha   | Bid: Problem 3       | -180      | Admin
10:36:10  | Gamma   | Crisis R4 penalty    | -50       | Admin
```

**Admin Panel Features:**

| Feature | Description |
|---|---|
| Team list | All 24 teams with live point balance |
| Bid entry | Select Team + Problem + Amount → deducts from balance with confirmation dialog |
| Manual adjustment | Add or deduct points with required reason field (crisis round use) |
| Problem assignment | Mark which problem each team won |
| Undo last action | Reverses the most recent `PointTransaction` — shows what will be undone before confirming |
| Reset all | Resets ALL teams to 1,000 points — double confirmation — SUPER_ADMIN only — disabled once `biddingActive = true` |
| Export | CSV: Team Name | Final Points | Problem Won | All Transactions |

**Bid Entry Rules:**
- Bid cannot exceed team's current balance → blocked with inline error
- Confirmation dialog shows new balance preview before submission
- Every bid logs a `PointTransaction` record with reason

### 8.3 Public Leaderboard — `/events/:eventSlug/leaderboard`

- Visible when `EventSettings.leaderboardVisible = true`
- Polls `GET /api/events/:slug/leaderboard` every 10 seconds
- Designed for projector display at 1080p full-screen
- Shows: Rank | Team Name | Points | Problem Won (or `—`)
- Rank change animations on each refresh
- No edit controls whatsoever

### 8.4 Auction API Routes

```
GET  /api/events/:slug/leaderboard              Public — all teams + balances
POST /api/admin/events/:slug/leaderboard/bid    Admin — submit bid
POST /api/admin/events/:slug/leaderboard/adjust Admin — manual point adjustment
POST /api/admin/events/:slug/leaderboard/assign Admin — assign problem to team
POST /api/admin/events/:slug/leaderboard/undo   Admin — undo last transaction
POST /api/admin/events/:slug/leaderboard/reset  Super Admin — full reset
GET  /api/admin/events/:slug/leaderboard/transactions  Admin — full log
GET  /api/admin/events/:slug/leaderboard/export Admin — CSV export
```

---

## 9. API Route Map

```
# ── AUTH ─────────────────────────────────────────────────────────
POST   /api/auth/signup                    Create new account
POST   /api/auth/login                     Login, receive tokens
POST   /api/auth/logout                    Invalidate refresh token
POST   /api/auth/refresh                   Get new access token
POST   /api/auth/forgot-password           Send OTP to email
POST   /api/auth/verify-otp                Verify OTP
POST   /api/auth/reset-password            Set new password
POST   /api/auth/setup-password            First-time setup via link
GET    /api/auth/me                        Get current user session

# ── EVENTS (PUBLIC) ──────────────────────────────────────────────
GET    /api/events                         List all public events
GET    /api/events/:slug                   Get single event details
GET    /api/events/:slug/rounds            Get event rounds
GET    /api/events/:slug/leaderboard       Live leaderboard (auction module)

# ── REGISTRATION ─────────────────────────────────────────────────
POST   /api/events/:slug/register          Submit team registration
GET    /api/events/:slug/check-rollno      Check roll no. uniqueness (on blur)

# ── PARTICIPANT ───────────────────────────────────────────────────
GET    /api/participant/registration       My team's registration + status
PATCH  /api/participant/registration       Edit team details (pre-shortlist only)
POST   /api/participant/submit             Upload PPT/deliverable
GET    /api/participant/submissions        My submission history

# ── ADMIN — EVENTS ────────────────────────────────────────────────
GET    /api/admin/events                   List all events
POST   /api/admin/events                   Create new event
GET    /api/admin/events/:slug             Get event details + stats
PATCH  /api/admin/events/:slug             Update event details
PATCH  /api/admin/events/:slug/settings    Update event settings

# ── ADMIN — REGISTRATIONS ─────────────────────────────────────────
GET    /api/admin/events/:slug/registrations           All teams
GET    /api/admin/events/:slug/registrations/:id       Team detail
PATCH  /api/admin/events/:slug/registrations/:id       Update status
POST   /api/admin/events/:slug/registrations/bulk      Bulk status update
GET    /api/admin/events/:slug/registrations/export    CSV export

# ── ADMIN — SUBMISSIONS ───────────────────────────────────────────
GET    /api/admin/events/:slug/submissions             All submissions
GET    /api/admin/events/:slug/submissions/:id         Single submission
PATCH  /api/admin/events/:slug/submissions/:id         Add notes / score
GET    /api/admin/events/:slug/submissions/export      ZIP download

# ── ADMIN — COMMUNICATIONS ────────────────────────────────────────
GET    /api/admin/events/:slug/emails                  Email history
POST   /api/admin/events/:slug/emails/send             Send email to group
GET    /api/admin/events/:slug/emails/templates        List templates

# ── ADMIN — AUCTION MODULE ────────────────────────────────────────
GET    /api/events/:slug/leaderboard                   Public leaderboard
POST   /api/admin/events/:slug/leaderboard/bid         Submit bid
POST   /api/admin/events/:slug/leaderboard/adjust      Manual adjustment
POST   /api/admin/events/:slug/leaderboard/assign      Assign problem to team
POST   /api/admin/events/:slug/leaderboard/undo        Undo last transaction
POST   /api/admin/events/:slug/leaderboard/reset       Full reset (super admin)
GET    /api/admin/events/:slug/leaderboard/transactions Full transaction log
GET    /api/admin/events/:slug/leaderboard/export      CSV export
```

---

## 10. Email Notifications

All emails use template variables: `{{teamName}}`, `{{registrationId}}`, `{{memberName}}`, `{{eventName}}`, `{{submissionDeadline}}`, `{{eventDate}}`. Every email is logged in the `EmailLog` table.

| Trigger | Recipient | Subject |
|---|---|---|
| Registration submitted | Team Lead | "Registration Confirmed — [Event Name]" — includes Registration ID + next steps |
| Account auto-created | Team Lead | "Set Your Password — EDC Portal" — one-time link, 48hr expiry |
| Shortlisted | Team Lead | "You're In! — [Event Name]" — PPT submission link + deadline |
| Rejected | Team Lead | "[Event Name] — Application Update" — encouraging, invites to future events |
| Waitlisted | Team Lead | "[Event Name] — Waitlist Confirmation" — position + will notify if spot opens |
| PPT submitted | Team Lead | "PPT Received — [Event Name]" — filename + timestamp |
| PPT deadline reminder | All shortlisted teams not yet submitted | "Reminder: Submission Closes Tomorrow" — sent 24hrs before deadline |
| Event day reminder | All shortlisted + checked-in | "See You Tomorrow — [Event Name]" — venue, time, checklist |
| Admin bulk send | Any group | Custom subject + body from communications panel |

---

## 11. Frontend Component Architecture

```
src/
├── pages/
│   ├── Home.jsx
│   ├── EventsDirectory.jsx
│   ├── EventLanding.jsx
│   ├── RegisterForm.jsx
│   ├── ParticipantDashboard.jsx
│   ├── PublicLeaderboard.jsx
│   ├── auth/
│   │   ├── Login.jsx
│   │   ├── Signup.jsx
│   │   └── ForgotPassword.jsx
│   └── admin/
│       ├── SuperAdminDashboard.jsx
│       ├── EventsList.jsx
│       ├── CreateEvent.jsx
│       ├── EventAdminHome.jsx
│       ├── Registrations.jsx
│       ├── Submissions.jsx
│       ├── Shortlist.jsx
│       ├── Leaderboard.jsx           ← auction module only
│       ├── Communications.jsx
│       └── EventSettings.jsx
│
├── components/
│   ├── layout/
│   │   ├── Navbar.jsx                ← Public nav
│   │   ├── AdminSidebar.jsx          ← Admin portal nav
│   │   └── ParticipantSidebar.jsx    ← Dashboard nav
│   ├── events/
│   │   ├── EventCard.jsx             ← Reusable event card (homepage + directory)
│   │   ├── HeroSection.jsx
│   │   ├── RoundTimeline.jsx         ← Visual step-by-step component
│   │   ├── ScheduleTable.jsx
│   │   ├── PrizesSection.jsx
│   │   ├── FAQAccordion.jsx
│   │   └── CountdownTimer.jsx
│   ├── registration/
│   │   ├── RegistrationForm.jsx
│   │   ├── MemberBlock.jsx           ← Single member field group (reused per member)
│   │   ├── StepIndicator.jsx         ← Progress bar
│   │   └── SuccessScreen.jsx
│   ├── dashboard/
│   │   ├── StatusCard.jsx
│   │   ├── ActionPrompt.jsx
│   │   ├── TeamTable.jsx
│   │   └── PPTUpload.jsx
│   ├── leaderboard/                  ← auction module components
│   │   ├── LeaderboardTable.jsx
│   │   ├── LeaderboardRow.jsx        ← Animated rank row
│   │   └── AdminControls.jsx
│   └── ui/
│       ├── Badge.jsx                 ← Status badges
│       ├── Modal.jsx
│       ├── Toast.jsx
│       ├── Drawer.jsx                ← Team detail slide-in panel
│       ├── ConfirmDialog.jsx
│       └── FileUpload.jsx            ← Drag-drop upload component
│
├── store/
│   ├── authStore.js                  ← Zustand: user session + tokens
│   ├── eventStore.js                 ← Current event data
│   └── leaderboardStore.js           ← Live points state (auction module)
│
├── hooks/
│   ├── useAuth.js
│   ├── usePolling.js                 ← Leaderboard auto-refresh
│   └── useEventSettings.js
│
├── services/
│   ├── api.js                        ← Axios instance + interceptors + token refresh
│   ├── auth.service.js
│   ├── events.service.js
│   ├── registration.service.js
│   └── admin.service.js
│
└── utils/
    ├── formatDate.js
    ├── generateRegistrationId.js
    └── validators.js
```

---

## 12. Phased Build Plan

| Phase | Scope | Target Date |
|---|---|---|
| **Phase A — Foundation** | Vite project structure, Tailwind + shadcn/ui setup, Prisma schema + DB migrations, Auth system (signup / login / refresh / reset / route guards) | March 24 |
| **Phase B — Registration** | Registration form (3-step), Roll No. uniqueness API, success screen, confirmation + account-creation emails, registration closed state | March 27 |
| **Phase C — Event Page + Admin Base** | Event landing page (all sections), Admin portal shell + sidebar, Registrations admin table + filters + CSV export, team detail drawer | March 31 |
| **Phase D — Participant Dashboard** | All 5 dashboard tabs, PPT upload component, submission portal, PPT admin view + bulk ZIP download | April 5 |
| **Phase E — Shortlisting + Comms** | Shortlisting interface, bulk status updates, batch emails (shortlisted / rejected / waitlisted), communications panel with templates | April 8 |
| **Phase F — Auction Module** | Admin leaderboard + full auction system (bid / adjust / assign / undo / reset), public leaderboard with polling, transaction log | April 10 |
| **Phase G — Testing** | End-to-end: registration → shortlist → PPT submit → bidding simulation → leaderboard projector display. Fix all issues. | April 13 |
| **Code Freeze** | No deployments after April 13 EOD | April 13 EOD |
| **Event Day** | All systems live. DB backup at 8:30 AM. Admin on standby with hotfix protocol. | April 15 |

---

## 13. Non-Functional Requirements

| Requirement | Detail |
|---|---|
| **Mobile-first** | Registration form, event page, and participant dashboard must work flawlessly on mobile Chrome on Android |
| **Projector-safe leaderboard** | Public leaderboard must render at full-screen 1080p without layout breaks — test before event day |
| **Concurrent registration safety** | Roll No. uniqueness and Registration ID generation must be DB-level atomic — no race conditions with simultaneous form submissions |
| **File upload resilience** | Show upload progress bar, handle slow connections, auto-retry on timeout, clear error messaging |
| **Admin auth hardening** | All `/api/admin/*` routes return `401` for unauthenticated requests — no client-side-only gating |
| **Code freeze** | All code deployed by April 13 EOD. No deployments on April 14–15 unless critical hotfix. |
| **Pre-event DB backup** | Manual full DB export (all tables as CSV) taken at 8:30 AM on April 15 before event starts |
| **Event-agnostic core** | Every schema, component, and admin panel is parameterised by `eventSlug`. No hardcoded "Founder's Pit" logic anywhere in the core system. |
| **Module isolation** | All auction/virtual points code must be cleanly isolated — enabling or disabling `auctionEnabled` should require zero changes to core event management code |

---

*Prepared by: EDC Technical Team, JSS University Noida*  
*Document version: 1.0 | March 2026*  
*For: Founder's Pit 2026 — Platform Launch*
