# phases.md — Project Roadmap by Phase

Assume a solo/small-team build on a laptop. Each phase is designed to leave you with something *runnable* at the end.[cite: 2]

## Team Role Split (if 3-4 people)
- **Backend owner**: auth, SOS routes, alert routes, DB schema[cite: 2]
- **Frontend/Map owner**: dashboard UI, Leaflet integration, role-based routing[cite: 2]
- **Integrations owner**: weather API, risk engine, Socket.io, deployment[cite: 2]
- **Floater / Design+Demo owner**: styling pass, seed data, demo script, judging-rubric check[cite: 2]

If solo, just work the phases in order — the sequence still holds.[cite: 2]

## Phase 0 — Setup (Day 1, ~2-3 hrs)
- [ ] Init GitHub repo with `/frontend` and `/backend` folders[cite: 2]
- [ ] `npm create vite@latest frontend -- --template react`[cite: 2]
- [ ] `npm init` in backend, install express, cors, dotenv, jsonwebtoken, bcrypt, pg/prisma, socket.io[cite: 2]
- [ ] Create free Postgres DB (Supabase or Neon), get connection string[cite: 2]
- [ ] Get free OpenWeatherMap API key[cite: 2]
- [ ] Confirm frontend and backend run locally and can talk to each other (a test "ping" API route)[cite: 2]

**Checkpoint:** Frontend shows "Backend connected ✅" from a test API call.[cite: 2]

## Phase 1 — Auth & Roles (Day 1-2)
- [ ] Backend: user model, register/login routes, JWT issue/verify middleware[cite: 2]
- [ ] Frontend: Register/Login pages, AuthContext, protected routes[cite: 2]
- [ ] Role field: citizen / volunteer / admin, redirect to role-specific dashboard after login[cite: 2]

**Checkpoint:** Can register as each role and land on the correct dashboard shell.[cite: 2]

- [ ] **Deploy the bare-bones app now** — frontend to Vercel, backend to Render/Railway, DB to Supabase/Neon. Confirm login works on the live URL, not just localhost.[cite: 2]

**Why now, not Day 5:** CORS config, env vars, and WebSocket-over-HTTPS issues are the most common source of last-day panic. Surfacing them here — while the app is still simple — means you fix them once, then every later phase just adds features to something already deployed.[cite: 2]

## Phase 2 — Live Map & Alerts (Day 2-3)
- [ ] Integrate Leaflet map on dashboard[cite: 2]
- [ ] Backend: `alerts` table + CRUD routes[cite: 2]
- [ ] Weather service: fetch OpenWeatherMap data for a region, apply simple risk rule (e.g. rainfall/wind thresholds) → auto-create an alert[cite: 2]
- [ ] Frontend: alert banner + alert pins on map[cite: 2]
- [ ] Socket.io: broadcast new alerts to connected clients live[cite: 2]
- [ ] Add a small "Reconnecting..." UI indicator using `socket.io-client`'s built-in reconnection events — cheap insurance against flaky venue wifi killing the live-update demo mid-presentation[cite: 2]

**Checkpoint:** Triggering/mocking bad weather data creates a real-time alert visible on all open dashboards. Killing and restoring your wifi shows a graceful "Reconnecting..." state, not a silently broken dashboard.[cite: 2]

## Phase 3 — SOS & Volunteer Coordination (Day 3-4)
- [ ] Backend: `sos_requests` table + routes (create, list, assign, update status)[cite: 2]
- [ ] Frontend: SOS button (citizen) captures location + message[cite: 2]
- [ ] Admin/Volunteer dashboard: live list + map pins of open SOS requests[cite: 2]
- [ ] Volunteer can "Accept" → status updates live via socket to admin & citizen[cite: 2]

**Checkpoint:** Full SOS loop works end-to-end across two browser windows (citizen + volunteer).[cite: 2]

## Phase 4 — Shelters & Resources (Day 4)
- [ ] Backend: `shelters` table, seed with 5-10 sample shelters (name, location, capacity)[cite: 2]
- [ ] Frontend: Shelter Finder page — list + map, nearest-first sort[cite: 2]
  - Sort with a plain haversine distance formula in JS (backend or frontend) against the user's coords — no PostGIS needed for this scale of data[cite: 2]
- [ ] (Optional) Admin can update shelter occupancy[cite: 2]

**Checkpoint:** Citizen can find nearest shelter with live capacity.[cite: 2]

## Phase 5 — Polish & Demo Prep (Day 5)
Deployment already happened at the end of Phase 1 and has been kept live since — Day 5 is genuine polish, not a first deploy attempt.[cite: 2]
- [ ] Seed realistic demo data (a few active alerts, SOS requests, shelters)[cite: 2]
- [ ] UI pass: consistent styling, loading states, error handling[cite: 2]
- [ ] Push latest code and confirm the live deployed URL reflects all features (don't assume auto-deploy caught everything)[cite: 2]
- [ ] Write a 2-minute demo script: Login → Alert appears → SOS raised → Volunteer resolves → Shelter found[cite: 2]
- [ ] Prepare 1-page problem/solution slide referencing the original SIH26206 brief[cite: 2]
- [ ] **Check the actual SIH26206 evaluation rubric.** SIH judges sometimes probe hardware/sensor understanding even on a software-only build. Prepare one talking point on how real sensors/drones/IoT devices would plug into this same architecture (the "IoT Devices" box in the original system diagram), even though the demo mocks that data — shows understanding without requiring hardware.[cite: 2]

**Checkpoint:** Live public URL works, and the 2-minute script runs without errors.[cite: 2]

## Stretch Phase (only if ahead of schedule)
- [ ] Crowdsourced incident reporting with photo upload[cite: 2]
- [ ] Basic ML risk score (train a tiny scikit-learn model on synthetic data)[cite: 2]
- [ ] SMS alert simulation via a free API (e.g., Twilio trial)[cite: 2]