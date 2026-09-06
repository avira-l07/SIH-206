# phases.md — Project Roadmap by Phase

Assume a solo/small-team build on a laptop. Each phase is designed to leave you with something *runnable* at the end.

**Note on scope:** The PRD's Should-have features (shelter audits, vulnerability triage, verification tiers, hazard route polygons) add real work. If you're a solo builder or short on days, treat Phase 3.5 and the shelter-audit part of Phase 4 as the features to protect — they're your strongest differentiators — and let the Stretch Phase slip first if time runs out.

## Team Role Split (if 3-4 people)
- **Backend owner**: auth, SOS routes, alert routes, verification/confidence-tier logic, DB schema
- **Frontend/Map owner**: dashboard UI, Leaflet integration, role-based routing, hazard polygon overlays
- **Integrations owner**: weather API, risk engine, Socket.io, offline-simulation toggle, deployment
- **Floater / Design+Demo owner**: styling pass, seed data (including seeded "nearby confirmer" accounts), demo script, judging-rubric check

If solo, just work the phases in order — the sequence still holds, but budget extra time around Phase 3.5.

## Phase 0 — Setup (Day 1, ~2-3 hrs)
- [x] Init GitHub repo with `/frontend` and `/backend` folders
- [x] `npm create vite@latest frontend -- --template react`
- [x] `npm init` in backend, install express, cors, dotenv, jsonwebtoken, bcrypt, pg/prisma, socket.io
- [x] Create free Postgres DB (Supabase or Neon), get connection string (with SQLite local demo fallback)
- [x] Get free OpenWeatherMap API key (with graceful offline mock weather scenarios)
- [x] Confirm frontend and backend run locally and can talk to each other (a test "ping" API route)

**Checkpoint:** Frontend shows "Backend connected ✅" from a test API call.

## Phase 1 — Auth & Roles (Day 1-2)
- [x] Backend: user model (add `trusted` boolean field now — cheap to add early, needed later for confidence scoring), register/login routes, JWT issue/verify middleware
- [x] Frontend: Register/Login pages, AuthContext, protected routes
- [x] Role field: citizen / volunteer / admin, redirect to role-specific dashboard after login
- [x] Prepare cloud deployment setup (`docs/deployment_guide.md`) for Render backend, Neon Postgres, and Vercel frontend.

**Checkpoint:** Can register as each role and land on the correct dashboard shell.

## Phase 2 — Live Map & Alerts (Day 2-3)
- [x] Integrate Leaflet map on dashboard
- [x] Backend: `alerts` table + CRUD routes
- [x] Weather service: fetch OpenWeatherMap data for a region, apply simple risk rule (e.g. rainfall/wind thresholds) → auto-create an alert
- [x] Frontend: alert banner + alert pins on map
- [x] Socket.io: broadcast new alerts to connected clients live
- [x] Add a small "Reconnecting..." UI indicator using `socket.io-client`'s built-in reconnection events — cheap insurance against flaky venue wifi killing the live-update demo mid-presentation

**Checkpoint:** Triggering/mocking bad weather data creates a real-time alert visible on all open dashboards. Killing and restoring your wifi shows a graceful "Reconnecting..." state, not a silently broken dashboard.

## Phase 3 — SOS & Volunteer Coordination (Day 3-4)
- [x] Backend: `sos_requests` table + routes (create, list, assign, update status), include `vulnerability_tags` field now
- [x] Frontend: SOS button (citizen) captures location + message + optional vulnerability tag (infant/elderly/pregnant/dialysis)
- [x] Admin/Volunteer dashboard: Kanban-style board (Reported → Verified → Dispatched → Rescued) instead of a flat list — urgent (tagged) requests auto-sort to top
- [x] Volunteer can "Accept" → locks assignment to that volunteer, status updates live via socket to admin & citizen

**Checkpoint:** Full SOS loop works end-to-end across two browser windows (citizen + volunteer). A vulnerability-tagged SOS visibly appears above a normal one in the queue.

## Phase 3.5 — Trust & Verification Layer (Day 4) — NEW
This is your differentiator phase — most competing teams won't have this.
- [x] Backend: `hazard_reports` + `hazard_confirmations` tables, confidence-tier calculation (grey/amber/red per the rules in architecture.md)
- [x] Frontend: hazard report form using in-app camera capture only (block gallery upload), pin coloring by tier
- [x] Seed 3-4 demo "nearby confirmer" accounts so you can trigger amber → red transitions live during the demo
- [x] Dispatch/routing logic only acts on amber/red reports; grey reports go to a simple admin review list

**Checkpoint:** Submitting a hazard report shows it grey, confirming it from a second seeded account flips it amber, a third flips it red — all visible live on the map.

## Phase 4 — Shelters & Resources (Day 4-5)
- [x] Backend: `shelters` table, seed with 5-10 sample shelters (name, location, capacity), add `water_ok`/`rations_ok`/`restrooms_ok`/`power_ok`/`status` fields
- [x] Frontend: Shelter Finder page — list + map, nearest-first sort
  - Sort with a plain haversine distance formula in JS (backend or frontend) against the user's coords — no PostGIS needed for this scale of data
- [x] Shelter audit toggle (citizen/admin) updates status live via the status-calculation rule; color-coded gauge (green/yellow/red)
- [x] When a shelter flips to red (90%+ full or a critical resource depleted), Shelter Finder auto-suggests the next-nearest green/yellow shelter

**Checkpoint:** Citizen can find nearest shelter with live capacity. Toggling a shelter to "full/no water" visibly flags it red and redirects the suggestion.

## Phase 5 — Polish & Demo Prep (Day 5-6)
Deployment guide and configurations are established; this phase is verified, tested, and demo-ready.
- [x] Seed realistic demo data (a few active alerts, SOS requests including one vulnerability-tagged, shelters, 1-2 hazard reports at each confidence tier)
- [x] UI pass: consistent styling, loading states, error handling
- [x] Automated test suite: `node verify-endpoints.js` validates all endpoints, models, and transition logic
- [x] Write a 3-minute demo script (`docs/demo_script.md`): Login → Alert appears → SOS raised (show vulnerability tag jump the queue) → Hazard report confirmed live (grey→amber→red) → Shelter flips to red and reroutes → Volunteer resolves
- [x] Prepare 1-page problem/solution slide referencing the original SIH26206 brief, plus one slide listing deferred features (`docs/pitch_and_rubric.md`) — clearly labeled "future work"
- [x] Check the actual SIH26206 evaluation rubric (`docs/pitch_and_rubric.md`). Prepared talking points on how real sensors/drones/IoT devices plug into the architecture.

**Checkpoint:** Live local prototype and verification suite run cleanly, and the 3-minute script runs without errors.

## Stretch Phase (Implemented Ahead of Schedule!)
- [x] Civilian Asset & Skill Mobilization — "I Have / I Can" listings (boats, 4x4s, generators, medics, HAM radio) with one-click direct dispatch contact
- [x] Relief Supply-Demand Gap Mapping — inventory matrix per shelter tracking critical shortages (infant formula, insulin, drinking water)
- [x] Missing Persons Registry — text/attribute-based matching (name/age/description) with automated shelter roster matches (Shipped in Sprint 1)
- [x] SMS ingestion simulation — fixed syntax parser (`SHTR <id> F<pct> W<1|0> B<beds>` and `SOS <lat> <lng> <type> <tags>`) with simulated outage queueing and batch sync
- [x] Route Obstruction Rendering — spatial obstruction perimeter rings rendered dynamically for `WAIST` and `SUBMERGED` hazard reports (Shipped in Sprint 2)
- [ ] Basic ML risk score (train a tiny scikit-learn model on synthetic data) (Covered by rule-based IoT risk engine per PRD Section 3.6)

### Strategic Prioritization Rationale (Decision 0.5)
In Sprint 2, Route Obstruction Rendering was paired with Structured Water-Depth Benchmarks (`ANKLE`, `KNEE`, `WAIST`, `SUBMERGED`) because structured physical depth data directly dictates route navigability and evacuation corridor safety on the live map. Missing Persons intake & bulletin matching had already been built in the backend in Sprint 1 (`/api/missing-persons`); coupling depth benchmarks to spatial obstruction rendering yielded maximum field-operational fidelity and high visual clarity during live judging demos.

## Deferred — do not attempt in this timeline (mention only as future work in the pitch)
- Facial-recognition matching for missing persons (accuracy & biometric privacy concerns — see `docs/pitch_and_rubric.md`)
- Real Bluetooth/Wi-Fi Direct mesh networking or live telecom SMS gateway integration (simulated via application-layer gateway)
- Multi-dialect voice-to-text NLP (future scope)
