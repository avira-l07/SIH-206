# SIH26206 — Real-Time Disaster Response & Early Warning Platform

A centralized, real-time emergency preparedness and response platform built for the **Smart India Hackathon (SIH Problem Statement SIH26206)**.

The platform provides a unified situational awareness console connecting **citizens in distress**, **field rescue volunteers**, and **NDMA / disaster management authorities**.

---

## System Architecture

```
[ Citizen / Volunteer / Admin Devices ]
                  |
         (HTTPS + WSS / Socket.io)
                  v
       [ React Frontend (Vite) ]
                  |
          (REST API JSON + JWT)
                  v
       [ Express Backend Server ]
                  |
     +------------+------------+--------------------+
     |                         |                    |
     v                         v                    v
[ SQLite / Prisma     ]  [ Weather API / ]  [ Rule-Based Risk ]
[ Relational State DB ]  [ OpenWeatherMap ] [ Threshold Engine]
```

---

## Field-Ops Design System

Built strictly adhering to emergency-response UX principles (`design.md`):
- `--ink: #14231F` (near-black green, high contrast, non-fatiguing)
- `--paper: #F6F4EF` (warm off-white background)
- `--safe: #2E6E4E` (deep forest green for resolved incidents / available shelters)
- `--watch: #C97A2B` (amber/ochre for advisory alerts)
- `--critical: #B23A2E` (brick red, reserved strictly for live SOS distress and active emergencies)
- `--line: #D8D3C7` (hairline dividers)
- **Task-first layout:** urgent actions and role queues first; maps and planning tools open when needed.
- **Tabular figures:** Monospaced alignment for coordinates, counts, and timestamps.

---

## Core Capabilities by Role

### 1. Citizen Resilience Console
- Single-tap accessible **SEND SOS** distress trigger with browser GPS coordinate capture.
- Live SOS status tracker (`PENDING` → `VERIFIED` → `EN_ROUTE` → `ON_SCENE` → `EVACUATED` → `HANDED_OVER_TO_MEDICAL` → `RESOLVED`).
- Proximity-sorted shelter locator calculated using the JavaScript Haversine formula.
- Real-time emergency banner for active regional hazards.

### 2. Field Volunteer Dispatch Console
- Live queue of unassigned incoming distress calls sorted by proximity to the responder.
- One-click **ACCEPT DISPATCH** -> instantly notifies citizen and operations center via WebSockets.
- Acknowledge dispatch, report replacement needs, advance rescue stages and record closure evidence.

### 3. NDMA Situational Command Center
- Situational metrics: Active Hazard Count, Pending SOS Calls, Available Shelter Capacity.
- **Broadcast Official Alert** tool: Pushes urgent alerts with hazard radii to all connected devices.
- **AI / IoT Risk Simulator**: Drives the rule-based risk engine on weather and environmental telemetry to demonstrate automated disaster early-warning.
  > The platform uses a deterministic, threshold-based risk engine (`riskEngine.service.js`) that evaluates current sensor/telemetry values against defined thresholds (e.g. rainfall > 60mm/h triggers a flood risk flag). This is an explainable rules engine, not a multi-tier cascading-consequence prediction model — we chose transparency and auditability over an unproven predictive claim.

---

## SIH alignment and telemetry

SIH26206 is AICTE Student Innovation in Disaster Management. The available statement emphasizes mitigation and planning before, during and after disasters; it does not establish a mandatory AI/IoT architecture or numerical KPI. This implementation uses deterministic warning rules, with optional live weather. See [the current gap upgrade](docs/GAP_UPGRADE.md) and [pilot measurement plan](docs/PILOT_PLAN.md).

### Telemetry Ingestion & Architecture:
> "The platform accepts telemetry data (rainfall, water level, seismic readings) via a JSON HTTP endpoint (`/api/alerts/simulate`), designed to be compatible with real sensor gateways in a production deployment. No physical LoRaWAN hardware or network server integration is included in this submission — telemetry is currently simulated/demo data unless a real `OPENWEATHER_API_KEY` is configured, in which case live weather data is used."

### Telemetry Packet Specification:
```json
{
  "region": "Chamoli - Badrinath Corridor",
  "lat": 30.4074,
  "lng": 79.3248,
  "telemetry": {
    "rain1h": 75.0,
    "windSpeed": 45.0,
    "temp": 18.2,
    "humidity": 95,
    "seismic": 0.0,
    "smokeIndex": 12
  }
}
```

---

## Offline Resilience & Field Relay Architecture

> "Offline resilience is implemented via a local-hub relay architecture: devices connect to a local network hub (no internet uplink required), and a Service Worker + IndexedDB queue on each device persists actions taken while disconnected, auto-syncing once connectivity to the hub or internet is restored. This is a hub-and-spoke local relay, not a peer-to-peer Bluetooth/Wi-Fi Direct mesh network — true ad-hoc mesh relay would require native mobile code beyond this web platform's scope."

---

## 2-Minute Demo Presentation Script

1. **Citizen:** Log in, complete a preparedness checklist under More → Planning and field tools, then submit a help request with checked coordinates.
2. **Operator:** Verify the request, assign an approved on-duty volunteer and inspect the request history.
3. **Volunteer:** Acknowledge the assignment. Request a resource booking; its owner accepts in their Bookings tool. Advance the rescue stages.
4. **Shelter staff:** Record an arrival with explicit matching consent. Review a family candidate, confirm evidence, then record departure.
5. **Recovery:** Citizen reports damage/aid, operator assigns work, volunteer records completion. Inspect actual timing samples and provider delivery states. Custom telemetry is DEMO, never a validated forecast probability. Demo account switching is under More and is disabled in production.

---

## Quick Start (Local Run)

Use Node.js 24 or later for the development SQLite backup command. Keep secrets in local environment files; do not commit them.

Backend (PowerShell):

```powershell
cd backend
npm ci
# For a fresh checkout only; preserve an existing .env.
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
# Edit .env with a private JWT_SECRET and the desired development settings.
npm run db:setup
npm start
```

The backend defaults to port 5000. `db:setup` backs up an existing local SQLite database before applying non-destructive schema changes. Startup/build do not reset or seed the database. Existing local databases need this explicit schema step after pulling these changes.

Frontend (another terminal):

```powershell
cd frontend
npm ci
npm run dev
```

Vite defaults to port 5173 and proxies API/socket requests to the backend. Set `VITE_API_URL` for a separately hosted backend; frontend environment variables are public and must never contain secrets.

For administrator provisioning, set `ADMIN_NAME`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` in a private environment, then run `npm run admin:create` from `backend`. The command refuses existing accounts and requires a password of at least 12 characters. Remove these provisioning variables afterward. Volunteers register normally and need an administrator to approve field access.

### Optional disposable demo

Seeding erases the selected development database. Use a separate disposable database and enable both flags explicitly:

```powershell
cd backend
$env:DATABASE_URL='file:./demo.db'
$env:ENABLE_DEMO='true'
$env:RESET_DEMO_DATA='true'
npm run db:setup
npm run seed
Remove-Item Env:RESET_DEMO_DATA
npm start
```

Development demo accounts use `citizen@sih.gov.in`, `volunteer@sih.gov.in` and `admin@sih.gov.in`, with password `password123`. These are public fixtures. Production startup rejects privileged accounts with this password, and production seeding is disabled. Demo UI tools are shown in development; leave `VITE_ENABLE_DEMO=false` in production.

### Checks and audit

Run `npm test` in both workspaces; run `npm run lint` and `npm run build` in `frontend`. Backend tests use their own temporary database and disable external delivery.

See [the project audit](docs/PROJECT_AUDIT.md) for repaired issues, verification results and remaining limitations, and [the deployment guide](docs/deployment_guide.md) for production configuration.

See [the second audit](docs/SECOND_AUDIT.md) for cross-role workflow fixes, current security limitations, SIH26206 alignment and [the route inventory](docs/ROUTE_INVENTORY.md).
