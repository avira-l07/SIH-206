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
[ PostgreSQL / Prisma ]  [ Weather API / ]  [ Rule-Based Risk ]
[ Relational State DB ]  [ OpenWeatherMap ] [ AI/IoT Engine   ]
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
- **Map-first layout:** 60-65% map split with side docking for quick situational scanning.
- **Tabular figures:** Monospaced alignment for coordinates, counts, and timestamps.

---

## Core Capabilities by Role

### 1. Citizen Resilience Console
- Single-tap accessible **SEND SOS** distress trigger with browser GPS coordinate capture.
- Live SOS status tracker (`PENDING` -> `IN_PROGRESS` -> `RESOLVED`).
- Proximity-sorted shelter locator calculated using the JavaScript Haversine formula.
- Real-time emergency banner for active regional hazards.

### 2. Field Volunteer Dispatch Console
- Live queue of unassigned incoming distress calls sorted by proximity to the responder.
- One-click **ACCEPT DISPATCH** -> instantly notifies citizen and operations center via WebSockets.
- One-click **MARK RESOLVED** -> marks distress resolved and clears queue.

### 3. NDMA Situational Command Center
- Situational metrics: Active Hazard Count, Pending SOS Calls, Available Shelter Capacity.
- **Broadcast Official Alert** tool: Pushes urgent alerts with hazard radii to all connected devices.
- **AI / IoT Risk Simulator**: Drives the rule-based risk engine on weather and environmental telemetry to demonstrate automated disaster early-warning.

---

## SIH Evaluation Rubric Defense: AI & IoT Architecture

Judges often probe how a software platform satisfies the "AI/IoT-powered" requirement when physical hardware is not present at the booth:

### Talking Point for Judging:
> *"Our telemetry ingestion pipeline is built with a plug-and-play architecture. In production, physical field hardware (LoRaWAN flood river-gauge sensors, seismic accelerometers, and thermal drone cameras) transmit JSON packets to our `/api/alerts/simulate` endpoint. For today's demonstration, our gateway simulator generates identical real-time telemetry packets (e.g., rainfall rate in mm/h, wind gust speed, and smoke index). The risk evaluation engine processes thresholds and dispatches warnings identically, proving full end-to-end readiness for hardware integration without hardware fragility during the presentation."*

### Telemetry Packet Specification:
```json
{
  "region": "Kurla East - Mithi Catchment",
  "lat": 19.0726,
  "lng": 72.8845,
  "telemetry": {
    "rain1h": 75.0,
    "windSpeed": 45.0,
    "temp": 27.2,
    "humidity": 95,
    "seismic": 0.0,
    "smokeIndex": 12
  }
}
```

---

## 2-Minute Demo Presentation Script

1. **Step 1 (Citizen):** Log in as **Citizen** (or click the quick-fill button). Point out the 65% situation map, active alert banner, and shelters sorted by distance.
2. **Step 2 (Trigger SOS):** Click **SEND SOS**. Confirm the coordinates and message. Note the red pulsing status tracker: *"Awaiting volunteer dispatch"*.
3. **Step 3 (Volunteer):** In the top bar `DEMO VIEW`, switch to **Volunteer**. Point out the unassigned SOS call that arrived instantly without page refresh. Click **ACCEPT DISPATCH**.
4. **Step 4 (Admin):** Switch to **NDMA Admin**. Show the real-time metrics cards reflecting active operations.
5. **Step 5 (AI/IoT Risk):** Under the **AI / IoT Risk Simulator**, click **TRIGGER SENSOR RISK EVALUATION**. Show the risk engine calculating a 92/100 flood score and broadcasting an automatic emergency alert across all connected client dashboards.

---

## Quick Start (Local Run)

### Backend:
```bash
cd backend
npm install
node prisma/seed.js
npm start
# Server runs on http://localhost:5000
```

### Frontend:
```bash
cd frontend
npm install
npm run dev
# App runs on http://localhost:5173
```

### Seed Demo Accounts:
- **Citizen:** `citizen@sih.gov.in` / `password123`
- **Volunteer:** `volunteer@sih.gov.in` / `password123`
- **Admin:** `admin@sih.gov.in` / `password123`
