# EDC Event Management Platform — 3-Developer Execution Plan
**Target:** Event Portal live by March 30, 2026 | Auction Module later  
**Repos:** `edcjssun-frontend` (React + Vite) | `edcjssun-backend` (Node.js + Express)  
**Principle:** All three devs work in parallel from Day 1. No one waits for anyone else.

---

## Table of Contents

1. [Developer Roles at a Glance](#1-developer-roles-at-a-glance)
2. [Repo & Branch Strategy](#2-repo--branch-strategy)
3. [Shared Setup — Day 1 (Before Anyone Writes a Feature)](#3-shared-setup--day-1-before-anyone-writes-a-feature)
4. [Dev 1 — Backend, Database & APIs](#4-dev-1--backend-database--apis)
5. [Dev 2 — Participant Frontend](#5-dev-2--participant-frontend)
6. [Dev 3 — Admin Portal Frontend](#6-dev-3--admin-portal-frontend)
7. [API Contract & Mock Layer](#7-api-contract--mock-layer)
8. [Handoff Schedule](#8-handoff-schedule)
9. [Phase-by-Phase Timeline](#9-phase-by-phase-timeline)
10. [What NOT to Cross Into](#10-what-not-to-cross-into)
11. [Auction Module — Post March 30](#11-auction-module--post-march-30)
12. [Load Summary](#12-load-summary)

---

## 1. Developer Roles at a Glance

| | Dev 1 | Dev 2 | Dev 3 |
|---|---|---|---|
| **Domain** | Backend + DB + APIs + Email | Participant Frontend | Admin Portal Frontend |
| **Repo** | `edcjssun-backend` | `edcjssun-frontend` | `edcjssun-frontend` |
| **Stack** | Node.js + Express + PostgreSQL + Prisma + JWT + Cloudinary + Resend | React + Vite + Tailwind + shadcn/ui + Zustand + Axios | React + Vite + Tailwind + shadcn/ui + Zustand + Axios |
| **Works alone on** | All Express routes, Prisma schema, JWT auth, email triggers, file upload | Homepage, Events Directory, Event Landing Page, Registration Form, Participant Dashboard | Admin Dashboard, Event Creation, Registrations Table, Submissions, Shortlisting, Communications, Settings |
| **Auction module** | Auction APIs (post March 30) | Public Leaderboard page (post March 30) | Admin Leaderboard Control Panel (post March 30) |

---

## 2. Repo & Branch Strategy

### Two Separate Repos

```
edcjssun-frontend/    ← React + Vite (existing site)
edcjssun-backend/     ← Node.js + Express (new repo)
```

Never put backend on a frontend branch. Different runtimes, different deployments, different package.json.

### Deployment Targets

```
edcjssun-frontend  →  Vercel (or Netlify)       →  edcjssun.com
edcjssun-backend   →  Railway (or Render)        →  api.edcjssun.com
                         └── connects to PostgreSQL on Railway/Supabase
```

### Branch Structure — Frontend (`edcjssun-frontend`)

```
main                          ← production (edcjssun.com) — protected
dev                           ← integration branch — all PRs merge here first
  │
  ├── dev2/auth-pages          ← Dev 2
  ├── dev2/homepage-events     ← Dev 2
  ├── dev2/event-landing       ← Dev 2
  ├── dev2/registration-form   ← Dev 2
  ├── dev2/participant-dashboard ← Dev 2
  │
  ├── dev3/admin-shell         ← Dev 3
  ├── dev3/super-admin-dashboard ← Dev 3
  ├── dev3/create-event        ← Dev 3
  ├── dev3/registrations-admin ← Dev 3
  ├── dev3/submissions-shortlist ← Dev 3
  └── dev3/communications-settings ← Dev 3
```

### Branch Structure — Backend (`edcjssun-backend`)

```
main                          ← production API — protected
dev                           ← integration branch
  │
  ├── dev1/project-setup       ← Dev 1
  ├── dev1/auth                ← Dev 1
  ├── dev1/registration-api    ← Dev 1
  ├── dev1/participant-api     ← Dev 1
  ├── dev1/admin-api           ← Dev 1
  └── dev1/submission-api      ← Dev 1
```

### PR Rules

- No one pushes directly to `main` or `dev`
- Every feature branch → PR → review → merge to `dev`
- `dev` → `main` only after full testing
- Dev 1 reviews backend PRs alone (solo backend)
- Dev 2 and Dev 3 cross-review each other's frontend PRs

---

## 3. Shared Setup — Day 1 (Before Anyone Writes a Feature)

**Do this together in the first 2–3 hours. Get it done once, get it right.**

### 3.1 Frontend Repo Setup (Dev 2 leads, Dev 3 joins)

```bash
# In existing edcjssun-frontend repo
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
npx shadcn-ui@latest init
npm install react-router-dom zustand axios
```

**File structure to agree on before anyone starts:**

```
src/
├── pages/
│   ├── auth/
│   ├── admin/
│   └── (participant pages at root)
├── components/
│   ├── layout/
│   ├── events/
│   ├── registration/
│   ├── dashboard/
│   └── ui/           ← shared UI primitives (Dev 2 builds first)
├── store/            ← Zustand stores
├── services/         ← Axios + API calls
├── hooks/
└── utils/
```

**React Router setup (Dev 2 writes, Dev 3 imports):**

```jsx
// src/main.jsx — define ALL routes here on Day 1
// So Dev 2 and Dev 3 both know exactly which routes exist
// and never step on each other

<Routes>
  {/* PUBLIC — Dev 2 owns */}
  <Route path="/" element={<Home />} />
  <Route path="/events" element={<EventsDirectory />} />
  <Route path="/events/:eventSlug" element={<EventLanding />} />
  <Route path="/events/:eventSlug/register" element={<RegisterForm />} />
  <Route path="/events/:eventSlug/leaderboard" element={<PublicLeaderboard />} />

  {/* AUTH — Dev 2 owns */}
  <Route path="/auth/login" element={<Login />} />
  <Route path="/auth/signup" element={<Signup />} />
  <Route path="/auth/forgot-password" element={<ForgotPassword />} />
  <Route path="/auth/setup-password" element={<SetupPassword />} />

  {/* PARTICIPANT — Dev 2 owns */}
  <Route element={<RequireAuth />}>
    <Route path="/events/:eventSlug/dashboard" element={<ParticipantDashboard />} />
    <Route element={<RequireShortlisted />}>
      <Route path="/events/:eventSlug/submit" element={<SubmitDeliverable />} />
    </Route>
  </Route>

  {/* ADMIN — Dev 3 owns */}
  <Route element={<RequireAdmin />}>
    <Route path="/admin" element={<AdminLayout />}>
      <Route index element={<SuperAdminDashboard />} />
      <Route path="events" element={<EventsList />} />
      <Route path="events/new" element={<CreateEvent />} />
      <Route path="events/:eventSlug" element={<EventAdminHome />} />
      <Route path="events/:eventSlug/registrations" element={<Registrations />} />
      <Route path="events/:eventSlug/submissions" element={<Submissions />} />
      <Route path="events/:eventSlug/shortlist" element={<Shortlist />} />
      <Route path="events/:eventSlug/communications" element={<Communications />} />
      <Route path="events/:eventSlug/settings" element={<EventSettings />} />
      <Route path="settings" element={<PlatformSettings />} />
    </Route>
  </Route>
</Routes>
```

**Axios instance (Dev 2 writes `src/services/api.js` — Dev 3 imports it, never duplicates):**

```js
// src/services/api.js
import axios from 'axios'
import { useAuthStore } from '../store/authStore'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,  // https://api.edcjssun.com
  withCredentials: true,                   // for refresh token cookie
})

// Inject access token on every request
api.interceptors.request.use(config => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Auto-refresh on 401
api.interceptors.response.use(
  res => res,
  async err => {
    if (err.response?.status === 401 && !err.config._retry) {
      err.config._retry = true
      const { data } = await axios.post(
        `${import.meta.env.VITE_API_URL}/auth/refresh`,
        {},
        { withCredentials: true }
      )
      useAuthStore.getState().setAccessToken(data.accessToken)
      err.config.headers.Authorization = `Bearer ${data.accessToken}`
      return api(err.config)
    }
    return Promise.reject(err)
  }
)

export default api
```

**Zustand authStore (Dev 2 writes — Dev 3 reads from it, never writes to it):**

```js
// src/store/authStore.js
import { create } from 'zustand'

export const useAuthStore = create(set => ({
  user: null,
  accessToken: null,
  setUser: user => set({ user }),
  setAccessToken: token => set({ accessToken: token }),
  clearAuth: () => set({ user: null, accessToken: null }),
}))
```

**Shared UI components (Dev 2 builds on Day 1 — Dev 3 imports, never rebuilds):**

```
src/components/ui/
  Badge.jsx          ← status badges (Pending, Shortlisted, etc.)
  Toast.jsx          ← notification toasts
  Modal.jsx          ← generic modal wrapper
  Drawer.jsx         ← slide-in panel
  ConfirmDialog.jsx  ← "are you sure?" modal
  FileUpload.jsx     ← drag-drop upload component
  DataTable.jsx      ← sortable/filterable table (used heavily in admin)
  Spinner.jsx        ← loading state
  EmptyState.jsx     ← empty data state
```

**Env files:**

```bash
# edcjssun-frontend/.env.development
VITE_API_URL=http://localhost:3001/api

# edcjssun-frontend/.env.production
VITE_API_URL=https://api.edcjssun.com/api
```

---

### 3.2 Backend Repo Setup (Dev 1 alone)

```bash
mkdir edcjssun-backend && cd edcjssun-backend
npm init -y
npm install express cors cookie-parser bcryptjs jsonwebtoken prisma @prisma/client
npm install cloudinary resend multer multer-storage-cloudinary
npm install -D nodemon dotenv
npx prisma init
```

**Folder structure:**

```
edcjssun-backend/
├── prisma/
│   └── schema.prisma     ← all 12 models (see PRD Section 4)
├── src/
│   ├── index.js          ← Express app entry
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── events.routes.js
│   │   ├── registration.routes.js
│   │   ├── participant.routes.js
│   │   └── admin.routes.js
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   ├── events.controller.js
│   │   ├── registration.controller.js
│   │   ├── participant.controller.js
│   │   └── admin.controller.js
│   ├── middleware/
│   │   ├── auth.middleware.js   ← requireAuth, requireRole, requireShortlisted
│   │   └── error.middleware.js
│   ├── services/
│   │   ├── email.service.js    ← Resend wrapper + all templates
│   │   └── upload.service.js   ← Cloudinary wrapper
│   └── utils/
│       ├── generateId.js       ← FP26-0001 registration ID generator
│       └── jwt.js              ← sign/verify token helpers
├── .env
└── package.json
```

**CORS config (allow only the frontend origin):**

```js
// src/index.js
app.use(cors({
  origin: [
    'http://localhost:5173',        // Vite dev
    'https://edcjssun.com',         // production
    'https://www.edcjssun.com',
  ],
  credentials: true,               // allow cookies (refresh token)
}))
```

**Env file:**

```bash
# edcjssun-backend/.env
DATABASE_URL="postgresql://..."
JWT_ACCESS_SECRET="..."
JWT_REFRESH_SECRET="..."
JWT_ACCESS_EXPIRY="15m"
JWT_REFRESH_EXPIRY="7d"
CLOUDINARY_CLOUD_NAME="..."
CLOUDINARY_API_KEY="..."
CLOUDINARY_API_SECRET="..."
RESEND_API_KEY="..."
PORT=3001
```

---

## 4. Dev 1 — Backend, Database & APIs

**You are the single source of truth for all data and business logic. The other two devs depend on your APIs — deliver each group on time and share the Postman collection immediately after.**

---

### Phase A — Foundation (Recommended: Day 1–2)

#### Prisma Schema — Write all 12 models in one go

All models as defined in PRD Section 4. Key points:
- `User` — id, name, email, password (bcrypt), role (PARTICIPANT / EVENT_ADMIN / SUPER_ADMIN), isVerified
- `Event` — slug (unique), all event config fields, `auctionEnabled Boolean @default(false)`
- `Round` — eventId FK, order, name, roundType enum
- `Team` — registrationId (unique, FP26-0001 format), eventId FK, status enum, pointBalance (auction only)
- `TeamMember` — teamId FK, userId FK (optional), rollNo (unique per team), isLead
- `Submission` — generic, handles PPT/PDF/link, type enum
- `PointTransaction` — auction module only
- `Problem` — auction module only
- `Prize` — eventId FK, rank, label, amount
- `EventSettings` — id = eventId (1:1), all toggle fields
- `EmailLog` — recipient, type, status
- `RefreshToken` — userId FK, token (unique), expiresAt

```bash
npx prisma migrate dev --name init
npx prisma db seed    # seed Founder's Pit 2026 test data
```

#### Auth System — All 9 endpoints

```
POST /api/auth/signup            Create account, hash password, send verify email
POST /api/auth/login             Validate, issue accessToken (JWT 15m) + refreshToken (JWT 7d, HTTP-only cookie)
POST /api/auth/logout            Delete refreshToken from DB, clear cookie
POST /api/auth/refresh           Validate cookie, issue new accessToken
POST /api/auth/forgot-password   Generate 6-digit OTP, email it (15m expiry)
POST /api/auth/verify-otp        Validate OTP
POST /api/auth/reset-password    Set new password post-OTP
POST /api/auth/setup-password    First-time setup via one-time link (auto-created accounts)
GET  /api/auth/me                Return current user from token
```

**Middleware to write:**

```js
// src/middleware/auth.middleware.js

requireAuth           // verify JWT, attach user to req.user
requireRole(roles[])  // check req.user.role is in allowed roles array
requireShortlisted    // check team's status = SHORTLISTED for the given eventSlug
```

#### Deliverable after Phase A
- Postman collection with all 9 auth endpoints, sample request bodies, and expected responses
- Share with Dev 2 and Dev 3 so they can wire up real auth immediately

---

### Phase B — Public Events + Registration APIs (Recommended: Day 2–4)

```
GET  /api/events                          List all public events (status != DRAFT, isPublic = true)
GET  /api/events/:slug                    Single event with rounds + prizes
GET  /api/events/:slug/rounds             Event rounds in order
GET  /api/events/:slug/check-rollno       Query param ?rollNo=XXX — returns { taken: true/false }
POST /api/events/:slug/register           Full registration logic (see below)
```

**Registration endpoint — most critical, most complex:**

```
POST /api/events/:slug/register

Checks (in order, short-circuit on failure):
  1. Event exists and isPublic
  2. registrationOpen = true AND now < registrationDeadline
  3. Current team count < event.maxTeams
  4. All member fields present for declared teamSize
  5. All years are valid (1st or 2nd)
  6. All rollNos unique within this submission (no duplicates in payload)
  7. DB-level uniqueness check for each rollNo (atomic — use DB transaction)

On success (all in one DB transaction):
  1. Generate registrationId (FP26-XXXX — use DB sequence, not random)
  2. Create Team record
  3. Create TeamMember records for each member
  4. Check if Member 1 email already has a User account
     → If no: create User account (random temp password), send setup-password email
     → If yes: link TeamMember.userId to existing User
  5. Log EmailLog entry
  6. Send registration confirmation email (Resend)

Response: { registrationId, teamName, message }
Error responses:
  403 — registration closed
  409 — duplicate roll number (include which rollNo)
  422 — validation errors (include field-level errors)
```

#### Deliverable after Phase B
- Updated Postman collection with registration endpoints
- Dev 2 swaps mock registration for real

---

### Phase C — Participant APIs (Recommended: Day 4–6)

```
GET   /api/participant/registration        My team's full registration + member list + status
                                           (auth required — finds team by Member 1 userId)
PATCH /api/participant/registration        Edit team details
                                           (only allowed if status = PENDING)
POST  /api/participant/submit              Upload file to Cloudinary, upsert Submission record
                                           (auth + requireShortlisted middleware)
GET   /api/participant/submissions         All submission versions for my team (history)
```

**File upload flow:**

```
POST /api/participant/submit
  → multer-storage-cloudinary handles upload
  → validate: file type (.pptx or .pdf), size (< 25MB)
  → check: pptSubmissionOpen = true AND now < pptSubmissionDeadline
  → upsert Submission (one per team per event — update if exists)
  → send confirmation email
  → return: { fileUrl, fileName, fileSize, submittedAt }
```

#### Deliverable after Phase C
- Updated Postman collection
- Dev 2 wires up participant dashboard and PPT upload with real data

---

### Phase D — Admin APIs (Recommended: Day 5–8)

```
# Event management
GET    /api/admin/events                              All events (all statuses)
POST   /api/admin/events                             Create new event (with rounds, prizes)
GET    /api/admin/events/:slug                       Event details + live stats object:
                                                       { totalRegistrations, shortlisted,
                                                         submitted, checkedIn, daysToEvent }
PATCH  /api/admin/events/:slug                       Update event details
PATCH  /api/admin/events/:slug/settings              Update EventSettings (all toggle fields)

# Registrations
GET    /api/admin/events/:slug/registrations         All teams
                                                       Query params: ?status=&year=&branch=&size=&search=
GET    /api/admin/events/:slug/registrations/:id     Single team with all members
PATCH  /api/admin/events/:slug/registrations/:id     Update status, send email trigger
POST   /api/admin/events/:slug/registrations/bulk    Bulk status update + batch emails
GET    /api/admin/events/:slug/registrations/export  CSV — all teams + all member fields

# Submissions
GET    /api/admin/events/:slug/submissions           All teams, submitted/not filter
PATCH  /api/admin/events/:slug/submissions/:id       Add review notes, score
GET    /api/admin/events/:slug/submissions/export    ZIP of all uploaded files

# Communications
GET    /api/admin/events/:slug/emails                Email send history
POST   /api/admin/events/:slug/emails/send           Send email to group
                                                       Body: { to: 'shortlisted'|'all'|...,
                                                               subject, body, templateId? }
GET    /api/admin/events/:slug/emails/templates      List all built-in templates
```

**Email service — all templates to build:**

```
REGISTRATION_CONFIRMED    → sent on registration submit
SETUP_PASSWORD            → sent when account auto-created for team lead
SHORTLISTED               → sent on status change to SHORTLISTED
REJECTED                  → sent on status change to REJECTED
WAITLISTED                → sent on status change to WAITLISTED
PPT_RECEIVED              → sent on file submission
PPT_REMINDER              → sent 24h before pptSubmissionDeadline (to non-submitters)
EVENT_DAY_REMINDER        → sent day before event
CUSTOM                    → body from admin panel
```

Template variables available in all: `{{teamName}}`, `{{registrationId}}`, `{{memberName}}`, `{{eventName}}`, `{{submissionDeadline}}`, `{{eventDate}}`

#### Deliverable after Phase D
- Full Postman collection for all admin routes
- Dev 3 wires up all admin screens with real data

---

### What Dev 1 Does NOT Touch

- Any `.jsx` file
- Any frontend component
- CSS / Tailwind
- React Router
- Zustand

---

## 5. Dev 2 — Participant Frontend

**You own everything a participant sees. Build against the mock API from Day 1 — swap to real endpoints as Dev 1 delivers them.**

---

### Phase A — Foundation + Shared Setup (Recommended: Day 1)

- Lead the frontend repo setup (see Section 3.1)
- Set up React Router with all routes defined (including Dev 3's admin routes as empty placeholder pages)
- Write `src/services/api.js` (Axios instance + interceptors — the only copy)
- Write `src/store/authStore.js` (Zustand — the only copy)
- Build all shared UI primitives in `src/components/ui/`:
  - `Badge.jsx` — variants: pending (yellow), shortlisted (green), waitlisted (orange), rejected (red), checked-in (blue)
  - `Toast.jsx` — success / error / info variants
  - `Modal.jsx` — generic wrapper with backdrop
  - `Drawer.jsx` — slide-in from right, used for team detail in admin
  - `ConfirmDialog.jsx` — confirm/cancel modal
  - `FileUpload.jsx` — drag-drop zone + click-to-browse + progress bar
  - `Spinner.jsx`
  - `EmptyState.jsx`
- Set up mock API layer (`src/services/mock/`) — static JSON responses for all participant routes

---

### Phase B — Auth Pages (Recommended: Day 1–2)

**`/auth/login`**
- Email + password form
- On success: store accessToken in authStore, redirect to previous page or `/events`
- Show error on invalid credentials
- "Forgot password?" link

**`/auth/signup`**
- Name, email, password, confirm password
- On success: show "Check your email to verify your account" screen
- Link back to login

**`/auth/forgot-password`**
- Step 1: Enter email → request OTP
- Step 2: Enter 6-digit OTP
- Step 3: Set new password
- Each step on same page with state-driven UI

**`/auth/setup-password`**
- First-time password setup for auto-created accounts
- Receives token in URL query param (`?token=xxx`)
- Validate token, show set-password form
- On success → redirect to participant dashboard

**Persistent session:**
- On app load (`App.jsx`): call `GET /api/auth/me` with existing cookie
- If valid → populate authStore (user + new accessToken)
- If invalid → clear auth, redirect to login if on protected route

---

### Phase C — Homepage + Events Directory (Recommended: Day 2–3)

**`/` — Homepage**

Layout inspired by Luma:
- `Navbar` with EDC logo, "Events" link, Login / Profile avatar
- Hero: EDC tagline + "Explore Events" CTA button
- **Featured Events** section — horizontal scroll card row for upcoming/open events
- **Past Events** section — smaller card grid for completed events
- Footer: EDC social links, contact

**`EventCard` component (reusable — used in homepage, directory, admin list):**
```
Props: { event }
Shows: coverImage, title, date, venue, statusBadge, prizePool, CTA button
statusBadge logic:
  registrationOpen + before deadline  → "Registration Open" (green)
  registrationOpen + within 3 days    → "Closing Soon" (orange)
  after deadline                      → "Registration Closed" (grey)
  before registrationOpen             → "Coming Soon" (blue)
  status = COMPLETED                  → "Completed" (grey)
```

**`CountdownTimer` component (reusable):**
```
Props: { targetDate, label? }
Shows: DD : HH : MM : SS
Stops and shows "Event is live!" when targetDate reached
```

**`/events` — Events Directory**
- Grid of `EventCard` components
- Filter bar: Status (All / Open / Upcoming / Past), Category
- Search input (client-side filter on event title)
- Empty state when no results

---

### Phase D — Event Landing Page (Recommended: Day 3–5)

**`/events/:eventSlug`**

All content rendered from `GET /api/events/:slug` data. Nothing hardcoded.

**`HeroSection`:**
- Full-width cover image (from event.coverImage)
- Event logo + name + tagline
- Date, venue, registration status badge
- `CountdownTimer` to eventDate
- "Register Now" button → `/events/:slug/register`
  - Auto-disables and shows "Registration Closed" after deadline
  - Shows "View My Dashboard" if user is logged in and registered
- "Scroll to learn more" secondary CTA

**`RoundTimeline`:**
```
Visual horizontal stepper — rendered from Round[] data
Each step: icon + round name + time range + 1-line description
Steps connected by a line — completed steps filled, upcoming steps outlined
Mobile: vertical stepper
```

**`ScheduleTable`:** Full April 15 schedule — time | activity | description

**`PrizesSection`:**
- Three cards rendered from Prize[] — rank, amount (₹), perks
- Icons: 🥇 🥈 🥉

**`FAQAccordion`:** Accordion rendered from FAQ config, smooth expand/collapse animation

**Footer CTA:** "Ready to participate?" + Register button (same disabled logic as hero)

---

### Phase E — Registration Form (Recommended: Day 5–7)

**`/events/:eventSlug/register`**

Three-step form with progress indicator.

**`StepIndicator`:**
```
Step 1: Team Info  →  Step 2: Member Details  →  Step 3: Review & Submit
Progress bar fills as user advances
```

**Step 1 — Team Info:**
```
Team Name       Text input    Required | max 40 chars | no special chars except - and space
Team Size       Dropdown      2 / 3 / 4
How did you     Dropdown      Instagram / LinkedIn / Classmate / 
hear about us?                Professor / WhatsApp / Other — Optional
[Next →]
```

**Step 2 — Member Details:**
```
Renders N MemberBlock components based on selected team size
Member 1 is always "Team Lead" (labelled)

MemberBlock props: { memberIndex, isLead }
Fields:
  Full Name     Text     Required
  Roll Number   Text     Required | on blur: GET /api/events/:slug/check-rollno?rollNo=XXX
                                   show inline red error if taken
  Year          Dropdown 1st Year / 2nd Year | Required
  Branch        Text     Required
  Email         Email    Required | format validated
  Phone         Number   Required | exactly 10 digits

[← Back]  [Next →]
```

**Step 3 — Review & Submit:**
```
Read-only summary of all entered info in clean table layout
Confirmation checkbox:
  "I confirm all details are correct and all members are
   eligible students of JSS University, Noida."
[Submit Registration]  ← disabled until checkbox checked

Loading state on submit button (spinner, no double-submit)
```

**Success Screen:**
```
Full page confirmation (replaces form)
Shows:
  ✅ Registration Successful!
  Team Name: [name]
  Registration ID: FP26-XXXX  [Copy]
  "A confirmation email has been sent to [email]"
  "Set up your account now" → /auth/setup-password (if not already registered)
  [← Back to Event]  [Share Event]
```

**Error Handling:**
```
Duplicate Roll No. (409): inline field error "This roll number is already registered"
Registration closed (403): redirect to RegistrationClosed page
Network error: toast notification, form state fully preserved
Validation errors (422): highlight each failing field with message
```

---

### Phase F — Participant Dashboard (Recommended: Day 7–9)

**`/events/:eventSlug/dashboard`**

Sidebar layout with 5 tabs. Data from `GET /api/participant/registration`.

**Sidebar navigation:**
```
Overview      (always visible)
My Team       (always visible)
Submissions   (visible — disabled if not shortlisted, with tooltip)
Schedule      (always visible)
Leaderboard   (hidden if auctionEnabled = false)
Help          (always visible)
```

**Overview Tab:**
```
Registration Status Card:
  Large status badge (PENDING / SHORTLISTED / WAITLISTED / REJECTED)
  Registration ID + date submitted

Event Countdown:
  CountdownTimer to eventDate

Next Action Prompt (contextual — most important UI element):
  PENDING     → "Shortlisting results will be announced by April 12. 
                  We'll email you at [email]."
  SHORTLISTED → "Submit your PPT presentation before [deadline]"
                 [Submit Now →] button → /events/:slug/submit
  WAITLISTED  → "You're on the waitlist. We'll notify you if a spot opens."
  REJECTED    → "Thank you for applying! Stay tuned for future EDC events."

Quick Links:
  Event Schedule | Rulebook (PDF link) | WhatsApp Group
```

**My Team Tab:**
```
Team Name (heading)
Registration ID

Members table:
  Name | Roll No. | Year | Branch | Email

Edit button (team lead only, only if status = PENDING):
  Opens inline edit form for team details
  Save → PATCH /api/participant/registration
```

**Submissions Tab:**
```
If not SHORTLISTED: locked state with message "Available after shortlisting"

If SHORTLISTED:
  Current status: Not Submitted / Submitted
  If submitted: filename + file size + submitted timestamp

  Deadline banner:
    "Submission closes in X days" (orange if < 3 days, red if < 24hrs)

  Upload area (FileUpload component):
    Drag-drop zone or click-to-browse
    Accepted: .pptx, .pdf — max 25MB
    Shows upload progress bar
    On success: updates status card, sends to POST /api/participant/submit

  Submission history:
    List of all previous uploads: filename | size | timestamp
    (Re-submission replaces current but history is preserved)
```

**Schedule Tab:**
```
Full event day timeline rendered from Round data
Time | Round Name | Description | Room/Location (if set)
```

**Leaderboard Tab:**
```
Only shown if event.auctionEnabled = true AND EventSettings.leaderboardVisible = true
Embeds the same PublicLeaderboard component
Shows "Leaderboard will be visible during the event" if not yet visible
```

**Help Tab:**
```
Contact info: Event Coordinator name + email
FAQ accordion (same as landing page)
Report Issue form:
  Issue description + [Submit] → sends email to admin
```

---

### What Dev 2 Does NOT Touch

- Anything under `/admin/*` routes
- `AdminSidebar` layout
- `DataTable` (Dev 2 builds it in shared UI, but admin usage is Dev 3's domain)
- Any backend file

---

## 6. Dev 3 — Admin Portal Frontend

**You own everything admins interact with. Start with mock data and wire up real APIs as Dev 1 delivers them. Build on top of shared components Dev 2 creates — never duplicate them.**

---

### Phase A — Foundation + Admin Shell (Recommended: Day 1–2)

**Coordinate with Dev 2 on Day 1 for:**
- Repo setup (already done by Dev 2 — just pull and run)
- Confirm you're importing `api.js` and `authStore.js` from Dev 2's files — never creating your own
- Confirm which shared UI components Dev 2 is building vs. which you need to request

**Build the Admin Layout shell:**

```jsx
// AdminLayout.jsx — persistent wrapper for all /admin/* routes
// Left sidebar + main content area

AdminSidebar:
  EDC logo (top)
  Navigation:
    Dashboard          /admin
    Events             /admin/events
  
  If on an event page (eventSlug in URL params):
    ─────────── [Event Name] ───────────
    Overview           /admin/events/:slug
    Registrations      /admin/events/:slug/registrations
    Submissions        /admin/events/:slug/submissions
    Shortlisting       /admin/events/:slug/shortlist
    Communications     /admin/events/:slug/communications
    Settings           /admin/events/:slug/settings
  
  Platform Settings    /admin/settings (super admin only)
  
  User avatar + name + logout (bottom)
```

**`RequireAdmin` route guard:**
```js
// Check: user.role === 'EVENT_ADMIN' || user.role === 'SUPER_ADMIN'
// Redirect to /auth/login if not authenticated
// Redirect to / if authenticated but wrong role
```

**Mock data setup (`src/services/mock/admin.mock.js`):**
- Mock event list, mock registration list, mock submissions list
- Use for all admin screens until Dev 1 delivers admin APIs

---

### Phase B — Super Admin Dashboard + Event List (Recommended: Day 2–4)

**`/admin/dashboard` — Super Admin Overview**

```
Header: "EDC Platform — Admin"

Stats row (4 cards):
  Total Events | Active Events | Total Registrations | Total Participants

Active Events section:
  Card per active event:
    Event name, date, venue
    Registration count / max teams
    Status badge
    "Manage →" link

Upcoming / Draft Events section:
  Compact list with status badges

Recent Activity log:
  Latest admin actions (email sent, status changed, etc.)
  From EmailLog data
```

**`/admin/events` — All Events List**

```
Table with columns:
  Event Name | Date | Venue | Status | Registrations | Actions

Status badge per row (Draft / Upcoming / Registration Open / Ongoing / Completed)
Actions: Manage | Archive

[+ Create New Event] button → /admin/events/new
```

---

### Phase C — Create Event Form (Recommended: Day 3–5)

**`/admin/events/new`**

7-step form. Large, important screen — the foundation of the multi-event platform.

```
STEP 1 — BASICS
  Event Title         Text        Required
  Slug                Text        Auto-generated from title (editable)
                                  e.g. "Founder's Pit 2026" → "founders-pit-2026"
                                  API check for uniqueness on blur
  Tagline             Text        Optional
  Description         Rich text editor (use a simple one — react-quill or tiptap)
  Cover Image         FileUpload  Optional — image only
  Event Logo          FileUpload  Optional — image only

STEP 2 — LOGISTICS
  Event Date          Date + time picker
  Event End Date      Date + time (optional — for multi-day)
  Venue               Text
  Eligibility         Text        "1st & 2nd year JSS University students"
  Entry Fee           Number      Default 0 (shows "Free")
  Max Teams           Number      Default 24
  Team Size Min       Number      Default 2
  Team Size Max       Number      Default 4

STEP 3 — PRIZES
  Dynamic list — [+ Add Prize] button adds a new row
  Per prize: Rank (auto-increment) | Label | Amount ₹ | Perks | [Remove]
  At least 1 prize required

STEP 4 — ROUNDS
  Dynamic list — [+ Add Round] button
  Per round:
    Round Name        Text
    Round Type        Dropdown (Submission / Bidding / Presentation / Crisis / General)
    Description       Text
    Start Time        DateTime picker
    End Time          DateTime picker
  Drag-to-reorder rounds (sets the 'order' field)

STEP 5 — MODULE OPTIONS
  Enable Auction / Virtual Points System   [Toggle]
  Helper text: "Enables the bidding round, virtual points tracking,
                and live leaderboard for this event"
  (If ON → show Step 6. If OFF → skip to Step 7.)

STEP 6 — PROBLEMS (only if auction enabled)
  Dynamic list — [+ Add Problem] button
  Per problem:
    Title             Text
    Description       Text
    Category          Text (optional)
    Display Order     Auto-increment (drag-to-reorder)
  Minimum 1 problem required if step shown

STEP 7 — SETTINGS & PUBLISH
  Registration Deadline     Date + time picker
  PPT Submission Deadline   Date + time picker
  Make Event Public         Toggle (if off — event only visible to admins)
  Registration Open         Toggle

  Action buttons:
    [Save as Draft]   → POST /api/admin/events with status: DRAFT
    [Publish Event]   → POST /api/admin/events with status: UPCOMING + isPublic: true

Step indicator at top: 1 → 2 → 3 → 4 → 5 → (6) → 7
"Back" and "Next" between steps, state preserved across steps
```

---

### Phase D — Event Admin Home + Registrations (Recommended: Day 5–7)

**`/admin/events/:eventSlug` — Event Admin Home**

```
Event name + date + venue (header)

Stats row (5 cards, live from GET /api/admin/events/:slug):
  Registered Teams  | Shortlisted  | PPT Submitted  | Checked In  | Days to Event

Quick Toggles panel (instant save on toggle):
  Registration Open       [Toggle]   → PATCH /api/admin/events/:slug/settings
  PPT Submission Open     [Toggle]
  Leaderboard Visible     [Toggle]   (hidden if auctionEnabled = false)
  Bidding Active          [Toggle]   (hidden if auctionEnabled = false)

Tab navigation bar:
  Overview | Registrations | Submissions | Shortlist | Communications | Settings
```

**`/admin/events/:eventSlug/registrations` — Registrations Table**

```
Top bar:
  Search input (team name, roll no., name, email)
  Filter dropdowns: Status | Year | Branch | Team Size
  [Export CSV] button (right aligned)
  Registration count: "47 teams registered"

DataTable (from shared ui/DataTable.jsx):
  Columns:
    Reg. ID      | Team Name (clickable) | Size | Lead Name | Lead Email | Year | Status | Registered At | Actions
  
  Status column: Badge component
  Actions per row: [View] [Change Status ▾]
  
  Bulk select:
    Checkboxes on each row
    Bulk action bar appears when rows selected:
      "X teams selected" | [Shortlist] [Waitlist] [Reject] | [Clear]
    Confirmation modal before bulk action executes
    Shows: "This will send emails to all X teams. Confirm?"

Team Detail Drawer (opens on clicking team name):
  Slide-in panel from right (Drawer component)
  Shows:
    Team name + Registration ID + submitted date
    Member table: Name | Roll No. | Year | Branch | Email | Phone
    Submission status
    Status change dropdown + [Save] button
    Internal notes textarea
    Email history for this team
    [Close]
```

---

### Phase E — Submissions + Shortlisting (Recommended: Day 7–9)

**`/admin/events/:eventSlug/submissions`**

```
Top bar:
  Filter: [All] [Submitted] [Not Submitted]
  [Download All as ZIP] button

DataTable:
  Columns:
    Team Name | Reg. ID | Status | File Name | File Size | Submitted At | Actions
  
  Actions: [Preview] [Download] [Add Note]

File Preview Panel (Drawer):
  PDF files: inline viewer
  PPTX files: "PPTX files cannot be previewed — download to view" + [Download] button
  Review notes textarea (saved to PATCH /api/admin/.../submissions/:id)
  Score input (optional numeric — for judged events)
```

**`/admin/events/:eventSlug/shortlist` — Shortlisting Interface**

```
Header stats:
  Target: 24 | Shortlisted: X | Pending: Y | Waitlisted: Z | Rejected: W

Tab bar:
  [All] [Pending Review] [Shortlisted] [Waitlisted] [Rejected]

Per-team card (in Pending Review tab):
  Left: Team Name | Reg. ID | Size | Year
  Center: Submission status badge
  Right: Action buttons — [Shortlist ✓] [Waitlist] [Reject ✗]
  Below: Notes textarea (internal, not sent to team)
  [View PPT] button → opens file preview drawer

Warning banner if shortlisted < 24:
  "You've shortlisted X / 24 teams."

[Confirm All Decisions] button (bottom, prominent):
  ConfirmDialog: "This will send emails to all X shortlisted, Y waitlisted,
                   and Z rejected teams. This cannot be undone."
  On confirm → POST /api/admin/events/:slug/registrations/bulk + batch emails
```

---

### Phase F — Communications + Settings (Recommended: Day 9–11)

**`/admin/events/:eventSlug/communications`**

```
Left panel — Compose:
  To:       Dropdown audience selector
            All Teams / Shortlisted / Waitlisted / Rejected / Checked-In / Custom
  Template: Dropdown — select from built-in templates or "Custom"
            On template select: pre-fill subject + body
  Subject:  Text input
  Body:     Rich text editor
            Variable hint bar: click {{teamName}} etc. to insert at cursor
  
  Bottom:
    [Preview Email] → Modal showing rendered email (with sample data substituted)
    [Send to X teams] → ConfirmDialog → POST /api/admin/events/:slug/emails/send

Right panel — Email History:
  Table: Date | Type | Sent To | Status (Sent ✅ / Failed ❌)
  Compact, scrollable
```

**`/admin/events/:eventSlug/settings`**

```
Section: General
  Event Title, Tagline, Description, Cover Image, Logo (all editable)
  Event Date, Venue, Eligibility

Section: Registration
  Registration Open         Toggle
  Registration Deadline     DateTime picker
  Max Teams                 Number input
  Team Size Min / Max       Number inputs

Section: Submissions
  PPT Submission Open       Toggle
  PPT Submission Deadline   DateTime picker
  Accepted File Types       .pptx ✓  .pdf ✓  (checkboxes)
  Max File Size             Number (MB)

Section: Event Day
  Allow Walk-ins            Toggle
  Current Phase             Dropdown (Phase 1 Planning through Post Event)

Section: Auction Module  (only shown if auctionEnabled = true)
  Leaderboard Visible       Toggle
  Bidding Active            Toggle
  (Note: "Bidding Active disables the Reset All button")

Section: Danger Zone  (SUPER_ADMIN only — red bordered box)
  [Archive Event]           ConfirmDialog
  [Delete Event]            Double ConfirmDialog ("Type the event name to confirm")

[Save Settings] button — fixed at bottom, shows unsaved changes indicator
```

---

### What Dev 3 Does NOT Touch

- Anything under `/auth/*` routes
- `RequireAuth` guard (Dev 2 writes it)
- `authStore.js` or `api.js` (Dev 2 owns these)
- Any participant-facing page (`/`, `/events`, `/events/:slug`, `/events/:slug/register`, `/events/:slug/dashboard`)
- Any backend file

---

## 7. API Contract & Mock Layer

**This is how Dev 2 and Dev 3 work without waiting for Dev 1.**

### Mock Layer Structure

```
src/services/mock/
  auth.mock.js          ← mock login, signup, me responses
  events.mock.js        ← mock event list, single event, rounds
  registration.mock.js  ← mock registration submit + status
  participant.mock.js   ← mock dashboard, submission data
  admin.mock.js         ← mock registrations table, submissions, stats
```

Each mock file exports the same function signatures as the real service:

```js
// src/services/events.service.js
// Swap the import below when real API is ready

// import api from './api'                          ← real API
import * as api from './mock/events.mock'           ← mock (comment out when real is ready)

export const getEvent = (slug) => api.get(`/events/${slug}`)
```

This way swapping from mock to real is **one line change per service file** — no component code changes needed.

### API Response Shape Contract

Dev 1 must match these exact shapes. Define them on Day 1 in a shared `API_CONTRACT.md` in the backend repo.

```js
// GET /api/events/:slug
{
  id, slug, title, tagline, description,
  coverImage, logo, venue,
  eventDate, eventEndDate,
  registrationOpen, registrationDeadline,
  maxTeams, teamSizeMin, teamSizeMax,
  eligibility, entryFee, prizePool,
  status, isPublic, auctionEnabled,
  rounds: [{ id, order, name, description, startTime, endTime, roundType }],
  prizes: [{ id, rank, label, amount, perks }],
  settings: { pptSubmissionOpen, pptSubmissionDeadline, leaderboardVisible, biddingActive, currentPhase }
}

// POST /api/events/:slug/register — success
{ registrationId: "FP26-0001", teamName: "Team Alpha", message: "Registration successful" }

// POST /api/events/:slug/register — duplicate roll no.
{ error: "DUPLICATE_ROLLNO", field: "member2.rollNo", rollNo: "22BCE1234",
  message: "This roll number is already registered" }

// GET /api/participant/registration
{
  id, registrationId, teamName, teamSize, status, submittedAt,
  members: [{ name, rollNo, year, branch, email, phone, isLead }],
  submission: { fileUrl, fileName, fileSize, submittedAt } | null
}

// GET /api/admin/events/:slug
{
  ...eventFields,
  stats: { totalRegistrations, shortlisted, submitted, checkedIn, daysToEvent }
}

// GET /api/admin/events/:slug/registrations
{
  teams: [{ id, registrationId, teamName, teamSize, status, submittedAt,
            lead: { name, email, year, branch },
            hasSubmission: boolean }],
  total: 47,
  filters: { status, year, branch, teamSize }
}
```

---

## 8. Handoff Schedule

These are the points where Dev 1 hands off real APIs to Dev 2 and Dev 3.

| Recommended Day | Dev 1 Delivers | Dev 2 Does | Dev 3 Does |
|---|---|---|---|
| Day 2 EOD | Auth API (all 9 endpoints) + Postman collection | Swap mock auth → real auth. Login, signup, setup-password all working with real tokens | Same — wire up admin login with real auth |
| Day 4 EOD | Events + Registration API | Swap mock events + registration → real. Event landing page and registration form working end-to-end | Wire up events list in admin |
| Day 6 EOD | Participant API | Swap mock participant → real. Dashboard tabs showing real data, PPT upload working | — |
| Day 8 EOD | Admin API (registrations + submissions) | — | Swap mock admin data → real. Registrations table, submissions, shortlisting all working with real data |
| Day 9 EOD | Admin API (communications + settings) | — | Wire up comms panel and settings with real API |

**Rule:** Dev 1 posts in team chat the moment an API group is ready. Dev 2 / Dev 3 swap the import the same day. Don't let mock data linger after the real API is available.

---

## 9. Phase-by-Phase Timeline

*Recommended deadlines — adjust as needed. Auction module deliberately excluded from March 30 target.*

| Day | Dev 1 | Dev 2 | Dev 3 |
|---|---|---|---|
| **Day 1** | Repo setup, Prisma schema (all 12 models), DB migrations, seed data, Express app scaffold | Repo setup lead, React Router all routes, Axios instance, authStore, all shared UI components, mock layer | Pull frontend repo, Admin shell layout, AdminSidebar, RequireAdmin guard, mock admin data |
| **Day 2** | Auth API — all 9 endpoints (signup, login, logout, refresh, forgot, OTP, reset, setup, me) | Auth pages (login, signup, forgot-password, setup-password), persistent session on app load | Super Admin dashboard (mock data), Events list page |
| **Day 3** | Public Events API (GET /events, GET /events/:slug, GET /events/:slug/rounds) | Homepage (hero, EventCard, featured events, past events) | Create Event form — Steps 1 & 2 (basics + logistics) |
| **Day 4** | Registration API (POST /register + GET /check-rollno) + confirmation emails | Events Directory page, Event Landing Page — Hero + About + RoundTimeline | Create Event form — Steps 3, 4, 5, 6, 7 (prizes, rounds, modules, problems, publish) |
| **Day 5** | Participant API (GET registration, PATCH registration) | Event Landing Page — ScheduleTable + PrizesSection + FAQAccordion + Footer CTA | Event Admin Home — stats row + quick toggles |
| **Day 6** | Participant Submit API (POST /submit, GET /submissions) + upload to Cloudinary | Registration Form — Step 1 + Step 2 (MemberBlock, blur validation) | Registrations table — DataTable, filters, search, team detail Drawer |
| **Day 7** | Admin Events API (GET/POST/PATCH events, PATCH settings) | Registration Form — Step 3 + success screen + all error states | Registrations — bulk select + bulk status update + CSV export |
| **Day 8** | Admin Registrations API (all 5 endpoints) + CSV export | Participant Dashboard — Overview tab + My Team tab | Submissions table + file preview drawer |
| **Day 9** | Admin Submissions API (GET/PATCH/export) + ZIP download | Participant Dashboard — Submissions tab + PPT upload | Shortlisting interface — card view + per-team actions + confirm all |
| **Day 10** | Admin Communications API (send, history, templates) + all email templates | Participant Dashboard — Schedule tab + Help tab | Communications panel — compose + template selector + history |
| **Day 11** | **Full API review — fix any issues from Dev 2/3 feedback** | Wire up all remaining real APIs, fix any integration bugs | Event Settings page + Platform Settings, wire up all remaining real APIs |
| **Day 12** | — | **End-to-end test — full participant flow:** register → check dashboard → upload PPT | **End-to-end test — full admin flow:** create event → view registrations → shortlist → send emails → check settings |
| **Day 13** | Fix any backend bugs found in Day 12 testing | Fix any frontend bugs | Fix any frontend bugs |
| **March 30** | ✅ All APIs stable and deployed to Railway | ✅ Participant frontend deployed to Vercel | ✅ Admin portal deployed to Vercel |

---

## 10. What NOT to Cross Into

This is the most important section for keeping three people from blocking each other.

| Dev 1 must never | Dev 2 must never | Dev 3 must never |
|---|---|---|
| Write any `.jsx` or frontend component | Duplicate `api.js` — one copy only | Duplicate `api.js` or `authStore.js` — import Dev 2's files |
| Touch CSS / Tailwind | Write any Express route or controller | Write any Express route or controller |
| Create client-side state | Create a second Axios instance | Create a second Axios instance |
| Write React Router config | Write any admin page (`/admin/*`) | Write any participant page (`/`, `/events`, `/events/:slug/register`, `/events/:slug/dashboard`) |
| Deploy to Vercel | Write backend business logic | Write backend business logic |
| — | Write `AdminSidebar` or admin layout | Write `Navbar`, `EventCard`, or participant layout |
| — | Build `DataTable` twice — build it once in `ui/`, Dev 3 imports it | Re-build `Badge`, `Toast`, `Modal`, `FileUpload` — import from `ui/` |

---

## 11. Auction Module — Post March 30

After the core event portal is live and stable, all three devs return to the auction module in parallel. Estimated additional time: 5–7 days.

### Dev 1 — Auction APIs

```
GET  /api/events/:slug/leaderboard                   Public — all 24 teams + balances + problem won
POST /api/admin/events/:slug/leaderboard/bid         Validate balance, deduct, log PointTransaction
POST /api/admin/events/:slug/leaderboard/adjust      Add/deduct with reason field
POST /api/admin/events/:slug/leaderboard/assign      Assign Problem to Team (update Team.problemWon)
POST /api/admin/events/:slug/leaderboard/undo        Reverse last PointTransaction for any team
POST /api/admin/events/:slug/leaderboard/reset       Reset all to 1000 — SUPER_ADMIN only, confirm dialog
GET  /api/admin/events/:slug/leaderboard/transactions Full log with timestamps
GET  /api/admin/events/:slug/leaderboard/export      CSV: Team | Final Points | Problem Won | All Transactions
```

**Bid endpoint rules:**
- Bid amount cannot exceed `team.pointBalance` → return 422
- Use DB transaction: deduct points + log PointTransaction atomically
- Return new balance in response

### Dev 2 — Public Leaderboard Page

**`/events/:eventSlug/leaderboard`**

```
Only accessible when leaderboardVisible = true (check EventSettings on load)
If not visible: show "Leaderboard will be live during the event"

Auto-refresh via usePolling hook (GET /api/events/:slug/leaderboard every 10s):
  Poll in background, update state silently
  Show "Last updated: HH:MM:SS" timestamp

Table layout (designed for 1080p projector at full-screen):
  Large font, high contrast, dark background recommended
  Columns: Rank | Team Name | Points | Problem Won
  
  Rank badges: 🥇 🥈 🥉 for top 3
  "Problem Won": shows problem title or "—" if not yet assigned
  
  Row animation on rank change (CSS transition, positions swap smoothly)

usePolling hook:
  // src/hooks/usePolling.js
  const usePolling = (fn, interval = 10000) => {
    useEffect(() => {
      fn()  // call immediately on mount
      const id = setInterval(fn, interval)
      return () => clearInterval(id)
    }, [])
  }
```

### Dev 3 — Admin Auction Control Panel

**`/admin/events/:eventSlug/leaderboard`**

Two-column layout designed for fast live use on event day.

```
LEFT COLUMN — Live Leaderboard (auto-refreshes every 10s)
  Same data as public leaderboard
  Table: Rank | Team | Points | Problem Won
  [Refresh Now] manual trigger button
  Last updated timestamp

RIGHT COLUMN — Control Panel (4 panels, stacked)

  Panel 1: BID ENTRY
    Team dropdown (all 24 teams)
    Problem dropdown (all 8 problems)
    Bid Amount input
      → Shows "Available: X pts" below input (live, updates as team selected)
      → Red inline error if amount > available balance
    [Submit Bid] button → ConfirmDialog → POST /bid
    Dialog shows: "Deduct [X] points from [Team] for bid on [Problem]?"

  Panel 2: MANUAL ADJUSTMENT
    Team dropdown
    Type: [Add Points] / [Deduct Points] toggle
    Amount input
    Reason input (required — placeholder: "Crisis R4 penalty / Bonus points")
    [Apply] button → ConfirmDialog

  Panel 3: PROBLEM ASSIGNMENT
    List of all 8 problems
    Per problem: "Assign Winner" dropdown (all 24 teams) + [Assign] button
    Once assigned: shows "Won by [Team Name]" badge (green)
    Can be reassigned (with ConfirmDialog)

  Panel 4: ACTIONS
    [↩ Undo Last Action]
      Shows what will be undone: "Reverse: -180pts from Alpha (Bid: Problem 3)"
      ConfirmDialog before executing
    [⚠ Reset All to 1,000 pts]
      SUPER_ADMIN only (hidden for EVENT_ADMIN)
      Disabled once biddingActive = true
      Double ConfirmDialog: "Type RESET to confirm"
    [⬇ Export CSV]
      Downloads immediately, no confirmation

BELOW — Transaction Log
  Table: Time | Team | Action | Δ Points | Admin
  Most recent at top
  Auto-updates with each action taken
```

---

## 12. Load Summary

| | Dev 1 | Dev 2 | Dev 3 |
|---|---|---|---|
| **Primary scope** | Entire backend | All participant-facing pages | Entire admin portal |
| **Lines of code (est.)** | ~3,000–4,000 | ~3,500–4,500 | ~3,500–4,500 |
| **Hardest problems** | Atomic registration (concurrent submissions), JWT refresh cycle, bulk email batching, file upload to Cloudinary | 3-step registration form with dynamic member blocks, real-time Roll No. validation, persistent auth on app load | Shortlisting interface UX, bulk actions with confirmation, Create Event 7-step form |
| **Biggest dependency** | None — Dev 1 unblocks everyone else | Dev 1 for real APIs (mitigated by mock layer) | Dev 1 for real APIs (mitigated by mock layer) + Dev 2 for shared UI components |
| **Auction module est.** | 2–3 days | 1–2 days | 2–3 days |
| **Core portal target** | March 30 | March 30 | March 30 |

---

*Prepared by: EDC Technical Team, JSS University Noida*  
*Document version: 1.0 | March 2026*  
*Platform: edcjssun.com | Event: Founder's Pit 2026*
