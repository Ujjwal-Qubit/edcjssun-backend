# EDC Platform Master Status and Execution Document (PRD v2 Aligned)

Document purpose:
- Provide a single, implementation-truth report of the current edc-frontend state.
- Align all remaining execution to EDC_Platform_PRD_v2.md only.
- Clarify what is implemented, what is partially implemented, and what is still pending.
- Assign actionable, role-wise tasks for Dev 1, Dev 2, and Dev 3.

Canonical source policy:
- From this point forward, EDC_Platform_PRD_v2.md is the only product source of truth.
- EDC_Event_Management_Platform_PRD.md and EDC_Platform_3Dev_Execution_Plan.md are now historical references only.
- If old plan logic conflicts with PRD v2, PRD v2 wins.

---

## 1. Current Project Snapshot

### 1.1 Frontend stack in this repository
- React + Vite application.
- React Router based route graph.
- Zustand stores for auth and auction leaderboard state.
- Axios API client with auth header injection.
- Tailwind/CSS utility based UI.
- Admin and Auction layers implemented under src/our/views.

### 1.2 Current high-level module layout
- Public pages: src/our/views/Main.jsx, src/our/views/Events.jsx, src/our/views/EventDetail.jsx.
- Auth pages: src/our/views/auth/Login.jsx, Signup.jsx, ForgotPassword.jsx, SetupPassword.jsx.
- Participant pages: src/our/views/participant/ParticipantRegister.jsx, ParticipantDashboard.jsx, ParticipantSubmission.jsx.
- Admin pages: src/our/views/admin/Dashboard.jsx, EventsList.jsx, CreateEvent.jsx, EventAdminHome.jsx and tabs under src/our/views/admin/components.
- Auction module: src/our/views/auction/AuctionAdmin.jsx, AuctionBoard.jsx.
- Services: src/services/api.js, src/services/admin.service.js, src/services/auction.service.js.
- Stores: src/store/authStore.js, src/store/leaderboardStore.js.

### 1.3 Routing currently live in frontend
- Public:
  - /
  - /events
  - /events/:slug
  - /:eventSlug/register
  - /:eventSlug/dashboard
  - /:eventSlug/submit/:roundId
- Admin:
  - /admin/dashboard
  - /admin/events
  - /admin/events/new
  - /admin/events/:eventSlug
- Auction standalone:
  - /auction/:eventSlug/admin
  - /auction/:eventSlug/board
- Auth:
  - /auth/login
  - /auth/signup
  - /auth/forgot-password
  - /auth/setup-password

---

## 2. PRD v2 Alignment Summary (Executive Status)

Overall implementation maturity vs PRD v2:
- Public discovery and visual event pages: Partial (UI-rich, data static).
- Authentication and role guards: Partial (UI exists, real enforcement disabled).
- Participant portal: Partial (scaffolded pages, mock-only form behavior).
- Admin portal: Partial to advanced scaffold (broad feature surface, mostly mock-backed).
- Auction standalone module: Implemented as separate module scaffold, mock-backed.
- Backend contract integration: Not complete in this repo (expected in backend repo).

Status now:
- Done:
  - Route skeletons for auth, public, participant, admin, auction.
  - Admin tabs for registrations, shortlist, submissions, communications, settings, judging, check-in.
  - 7-step create-event wizard with validations and draft support.
  - Auction standalone UI and store/service scaffold.
- In progress:
  - Converting mocks to real API integration.
  - Enforcing auth/role gating.
  - Participant dashboard and submission flows to PRD v2 behavior matrix.
- Blocked:
  - Full completion depends on backend APIs matching PRD v2 contracts.
- Next:
  - Execute developer-specific backlog in Section 7 with strict PRD v2 acceptance criteria.

---

## 3. Detailed Implementation Audit by PRD v2 Area

## 3.1 Authentication system (PRD v2 Section 6)
Current state:
- Auth pages are implemented visually.
- Login writes mock user and token into Zustand store.
- RequireAuth guard currently returns Outlet unconditionally (auth checks commented out).
- API layer clears auth on 401 but does not perform refresh token flow.

What is implemented:
- UI paths for login/signup/forgot/setup-password.
- Basic auth store with setAuth and clearAuth.

What is missing for PRD v2:
- Real signup/login/refresh/logout flows.
- Role-aware route guards for PARTICIPANT/JUDGE/EVENT_ADMIN/SUPER_ADMIN.
- Judge portal guard path and assignment checks.
- Cross-subdomain cookie behavior validation.

Status: Partial.

## 3.2 Public-facing discovery and event pages (PRD v2 Section 7)
Current state:
- Main and Events pages are implemented with strong visual quality.
- EventDetail exists with rich presentation and participant CTAs.
- Data source is local eventsData, not API-driven.

What is implemented:
- Event browsing and detail page experience.
- CTA pathing into participant register/dashboard.

What is missing for PRD v2:
- Event directory filtering/sorting based on live backend data.
- EventLanding sections that are fully config-driven (tracks, dynamic rounds, dynamic FAQ, schedule from backend).
- Registration mode dependent CTA logic from backend event config.

Status: Partial.

## 3.3 Participant registration and dashboard (PRD v2 Sections 7.4 and 8)
Current state:
- ParticipantRegister, ParticipantDashboard, ParticipantSubmission pages were added and routed.
- These pages currently run in mock mode and do not call participant APIs.
- Dashboard timeline uses local mockRounds constants.

What is implemented:
- Route surface and navigation continuity.
- Basic forms and success states.

What is missing for PRD v2:
- ParticipationMode logic (SOLO_ONLY / TEAM_ONLY / BOTH).
- RegistrationMode behavior (OPEN_ACCESS / APPLICATION_REVIEW / INVITE_ONLY).
- Per-round dynamic submission type handling (FILE/LINK/FORM/MIXED).
- Eligibility-based submission unlock and hard deadline enforcement.
- Real participant registration/submission/history endpoints.
- QR/check-in visibility and status sync.

Status: Partial.

## 3.4 Admin portal core (PRD v2 Section 9)
Current state:
- Admin dashboard, events list, create event wizard, event admin home, and all major tabs are present.
- Tab modules are feature-rich UI scaffolds and mostly call adminService.
- adminService currently runs with USE_MOCK = true.

What is implemented:
- Broad UI surface for all critical admin workflows.
- Event list with search/filter/sort.
- EventAdminHome quick controls and tabbed operations.
- Registrations table with filter, bulk actions, detail drawer, notes/email actions.
- Submissions table with filtering and bulk reminder/mark received controls.
- Shortlist workflow with grouped status save.
- Communications composer with template fill and history panel.
- SettingsTab with structured payload shape:
  - toggles
  - deadlines
  - limits
  - communications
  - automation
- JudgingTab and CheckInTab basic overviews present.

What is missing for PRD v2:
- Real API wiring and server-backed persistence.
- Complete parity with PRD columns/filters/actions in each table.
- Review workflows with actual file preview/download integration.
- Judge invite/remove and per-round criterion edit flows.
- QR scan based check-in actions and walk-in workflows.
- Full audit logging and hard role restrictions.

Status: Partial to advanced scaffold.

## 3.5 Event configuration system (PRD v2 Section 10)
Current state:
- CreateEvent has 7-step flow and validates many fields.
- SettingsTab supports structured settings editing.

What is implemented:
- Slug generation/check call.
- Local draft save/restore for create event form.
- Form sections for rounds, prizes, auction toggles, publish flags.

What is missing for PRD v2:
- Full participationMode and registrationMode controls in wizard (as explicit typed config).
- Full track management and round-level submission settings parity.
- Persisted configuration map synchronized to backend schema and runtime behavior.

Status: Partial.

## 3.6 Judging and scoring (PRD v2 Section 11)
Current state:
- JudgingTab exists and loads overview data.
- No dedicated judge portal route in frontend yet.

What is implemented:
- Admin-side readout scaffold for judges and score overview.

What is missing for PRD v2:
- Judge portal UI (/judging/:eventSlug) and scoring forms.
- Judge assignment authorization enforcement.
- Criteria-weight scoring UI and score normalization workflow.
- Results publish actions and downstream participant visibility logic.

Status: Early partial.

## 3.7 Communications system (PRD v2 Section 12)
Current state:
- CommunicationsTab supports recipients, templates, message composition, scheduling, attachment placeholders, history.
- Service is mock-backed now.

What is implemented:
- Good UI scaffold for compose/send/history.
- Variable tags and template helper behavior.

What is missing for PRD v2:
- Real delivery metrics from email provider webhook data.
- Complete audience segmentation and backend-backed scheduling queue.
- Reliable template catalog synchronization from API.

Status: Partial.

## 3.8 Auction module standalone (PRD v2 Section 13)
Current state:
- Auction is correctly separated in standalone routes and views.
- Dedicated service and store exist.
- Mock mode enabled in auction service.

What is implemented:
- Admin control panel scaffold.
- Public board scaffold with polling.
- Transaction/action flows in store abstraction.

What is missing for PRD v2:
- Password/auth gate for auction admin control panel.
- Real backend actions and DB-backed transaction consistency.
- Full init bridge and export behavior from real API.

Status: Partial scaffold, architecture direction correct.

---

## 4. Critical Gaps and Risks (Must Resolve for PRD v2 Compliance)

1) Auth gate disabled
- RequireAuth currently does not enforce authentication or roles.
- Risk: Admin routes are effectively public in current frontend behavior.

2) Mock-mode dependency
- admin.service.js and auction.service.js both run with USE_MOCK = true.
- Participant pages are also static/mock and not API-integrated.
- Risk: UI can appear complete while production behavior is absent.

3) Route contract drift vs PRD v2
- Participant routes currently use /:eventSlug/... while PRD v2 specifies /events/:slug/... for key participant paths.
- If not normalized now, deep-linking and documentation drift will grow.

4) API path drift
- Example: dashboard stats in admin service requests /admin/events/stats while PRD v2 specifies /api/admin/stats.
- Potential integration break unless reconciled via agreed contract mapping.

5) Missing judge portal
- PRD v2 requires /judging/:eventSlug with judge role enforcement.
- This is not yet implemented in frontend.

---

## 5. Legacy-to-v2 Re-Alignment Directive

Immediate rule for all developers:
- Stop adding features based on old v1/legacy execution assumptions.
- Before any PR merge, verify task acceptance criteria against PRD v2 sections.

Required process changes:
1. PR template must include: PRD v2 section(s) covered.
2. Any API endpoint discrepancy must be documented in a shared contract sheet.
3. No new mock-only UI merges without explicit migration ticket.
4. All new route additions must follow PRD v2 URL structure unless temporary compatibility route is intentionally kept.

---

## 6. What Has Already Been Implemented (Consolidated)

Frontend implemented assets of high value:
- Admin architecture:
  - Dashboard, events list, create event wizard, event admin home.
  - Registrations, submissions, shortlist, communications, settings tabs.
  - Judging and check-in overview tabs.
- Auction architecture:
  - Standalone admin and board routes/pages.
  - Centralized leaderboard store and service abstraction.
- Participant scaffolding:
  - Register, dashboard, submit page routes and UI.
- Auth scaffolding:
  - Login/signup/forgot/setup pages.
- Route map and layout:
  - Public layout + admin layout separation.

Important note:
- This is significant scaffold work, but PRD v2 completion requires converting these scaffolds into integrated, guarded, config-driven, backend-backed workflows.

---

## 7. Developer-Wise Task Lists (PRD v2 Only)

This section is the execution contract from current state to PRD v2 compliance.

## 7.1 Dev 1 (Backend/API owner) remaining tasks
Even if some backend work started from old documents, all current and future backend tasks must now match PRD v2.

High priority:
1. Finalize route contracts exactly per PRD v2 Section 14 or publish accepted mapping sheet.
2. Implement authentication routes with refresh-token cookie flow and role claims.
3. Implement admin stats endpoint expected by frontend and PRD v2.
4. Implement structured EventSettings GET/PATCH payload shape.
5. Implement unified registrations endpoint returning solo + team with type discriminator.
6. Implement submissions review endpoints (filters, updates, exports).
7. Implement judging routes (judge invite, score aggregation, publish results).
8. Implement check-in routes (scan/manual/export) and QR token validation.
9. Implement communications routes (history/templates/send/schedule).
10. Implement auction standalone endpoints with action logging and export.

Done definition for Dev 1:
- Postman/OpenAPI contract shared.
- All listed endpoints pass integration tests.
- Environment supports frontend integration without contract workarounds.

## 7.2 Dev 2 (Participant + public frontend owner) remaining tasks
High priority:
1. Convert public events and event detail pages to backend-driven data.
2. Implement full registration mode behavior matrix:
   - OPEN_ACCESS
   - APPLICATION_REVIEW
   - INVITE_ONLY
3. Implement participation mode logic:
   - SOLO_ONLY
   - TEAM_ONLY
   - BOTH
4. Replace participant mock pages with API-backed workflows:
   - registration load/edit
   - submission create/update/history
   - round-specific unlock and deadline handling
5. Build participant dashboard tabs as per PRD v2 conditional visibility logic.
6. Add QR, check-in status, and action prompts from live status.
7. Align participant route patterns to PRD v2 canonical route structure.
8. Implement auth refresh flow and participant role guards.

Done definition for Dev 2:
- Participant journey from discovery to submission works end-to-end on live APIs.
- No hardcoded mock rounds or fake status transitions remain.
- All participant pages pass mobile acceptance checks.

## 7.3 Dev 3 (Admin + auction frontend owner) remaining tasks
High priority:
1. Re-enable RequireAuth with role checks and redirect behavior.
2. Keep admin tab architecture; replace mock responses with real service integration.
3. Ensure EventsList/CreateEvent/EventAdminHome contracts align with PRD v2 payloads.
4. Complete registrations tab parity with PRD table/filter/action requirements.
5. Complete submissions tab parity with real preview/download/review actions.
6. Complete shortlist workflow for application-review events only.
7. Expand JudgingTab to full judge management and score publishing controls.
8. Expand CheckInTab with QR/manual actions and attendance export.
9. Harden SettingsTab and quick toggles against backend validation/errors.
10. In auction module, add admin auth/password gate and complete API-backed controls.

Done definition for Dev 3:
- Admin and auction workflows are auth-enforced and API-backed.
- USE_MOCK removed from production path.
- No alert-based placeholders remain in critical operations.

---

## 8. Shared Integration Tasks (Cross-Developer)

1. Contract sync workshop (Dev 1 + Dev 2 + Dev 3)
- Freeze endpoint names, payloads, enum values, status strings.

2. Route compatibility plan
- Decide whether to migrate immediately to /events/:slug/... or support temporary dual paths.

3. End-to-end smoke suite
- Auth login/logout/refresh.
- Register (solo and team) flows.
- Application review and shortlisting.
- Submission cycle.
- Check-in and judging.
- Auction admin actions and board refresh.

4. Release checklist
- Remove mock flags.
- Enable real guards.
- Validate environment variables.
- Confirm email and file workflows.

---

## 9. Recommended Execution Sequence (From Current State)

Phase A: Contract and Security First (Immediate)
- Enable route guards in frontend.
- Confirm API contract parity with PRD v2.

Phase B: Participant and Admin Core Integration
- Participant registration/dashboard/submission real APIs.
- Admin registrations/submissions/shortlist/settings/communications real APIs.

Phase C: Advanced Modules
- Judging portal and full judge workflows.
- Check-in QR scan and attendance exports.
- Auction real endpoint integration + auth hardening.

Phase D: Hardening and Launch Readiness
- Cross-browser and mobile QA.
- Performance and error-state cleanup.
- Final PRD v2 compliance sign-off.

---

## 10. PRD v2 Compliance Checklist

Must be true before declaring platform complete:
- All role guards enforced and tested.
- All participant and admin flows operate without mocks.
- Event config fully drives UI behavior (no event-specific hardcoding).
- Judge and check-in modules behave per PRD v2.
- Auction remains standalone and operational with real backend.
- Route map and API map documented and matching implementation.

---

## 11. Immediate Next Actions (Actionable)

Now:
1. Dev 1 publishes final endpoint map against PRD v2 route list.
2. Dev 3 enables RequireAuth role guard and keeps temporary bypass only behind explicit dev flag if needed.
3. Dev 2 starts replacing participant mock state with API calls and status-driven UI.

This week:
4. Complete first full API-backed pass of:
   - Admin registrations
   - Participant registration/submission
   - Settings update
5. Run shared end-to-end smoke tests and record failures.

After that:
6. Close judging/check-in/auction hardening tasks.
7. Lock release criteria and freeze mock paths.

---

Prepared for: EDC multi-developer execution reset to PRD v2
Prepared from: Live repository implementation audit
Scope: Frontend repository state + PRD v2 alignment instructions
