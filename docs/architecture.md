# architecture.md - SIH26206 Disaster Management

## 1. App Flow (Simplified for Web MVP)

```
Citizen/Volunteer/Admin (Browser)
       │
       ▼
Frontend (React web app)
       │ REST API calls (JWT auth) & WebSocket
       ▼
Backend (Node.js/Express)
       ├──► Database (PostgreSQL / SQLite via Prisma)
       ├──► Weather API (OpenWeatherMap + fallback simulator)
       ├──► WebSocket/Socket.io (live alert + SOS updates)
       ├──► Rule-based Risk Engine (simple logic)
       ├──► Verification Service (confidence-tier scoring for crowdsourced reports)
       └──► Offline Sync Queue (simulated — timestamps + staleness flags for "mesh"/SMS-style data)
```

**User flow example (SOS):**
1. Citizen logs in -> sees dashboard map.
2. Citizen taps "SOS" -> shares location + message -> (optional) tags a vulnerability (infant/elderly/pregnant/dialysis).
3. Backend saves SOS, broadcasts via WebSocket. Vulnerability-tagged SOS is flagged `priority: urgent` and sorted to the top of the triage queue.
4. Admin/Volunteer dashboard updates in real time, shows pin on map (color/urgency reflects tag).
5. Volunteer accepts -> status changes to "In Progress" -> "Resolved" (locks the request to that volunteer to prevent duplicate dispatch).

**User flow example (Hazard report verification):**
1. Citizen submits a hazard report using the in-app camera only (no gallery upload) — e.g. "flooded road, waist-deep."
2. Report is created with `confidence_tier: grey` and `confirmations_count: 0`.
3. Nearby users (within ~300m) get a "Confirm: is this accurate?" prompt.
4. Each confirmation increments `confirmations_count`. At 1 confirmation → `amber`. At 3+ (or one trusted/verified user) → `red`.
5. Only `amber`/`red` reports trigger volunteer dispatch or route recalculation; `grey` reports sit in a secondary review queue for an admin to manually verify.

**User flow example (Shelter audit):**
1. A citizen or admin near a shelter toggles ground-truth status: beds free, water OK, rations OK, restrooms OK, power OK.
2. Backend recalculates shelter status: `green` (available), `yellow` (near capacity/one resource low), `red` (full or a critical resource depleted).
3. If occupancy > 90% or water/rations hit zero, backend flags the shelter and the Shelter Finder / dispatch logic deprioritizes it, suggesting the next-nearest viable shelter instead.

---

## 2. Recommended Tech Stack (laptop-friendly, free-tier)

| Layer | Simplified MVP Stack (Recommended) |
|---|---|
| **Frontend** | React (Vite) + Tailwind CSS |
| **Backend** | Node.js + Express (fastest to prototype) |
| **Database** | PostgreSQL / SQLite via Prisma (plain lat/lng columns) |
| **Real-time** | Socket.io |
| **AI/Risk** | Simple if/else risk rules |
| **Verification** | Count-based confidence scoring (no ML needed — see Section 4) |
| **Maps** | Leaflet.js + OpenStreetMap (free, no API key needed) |
| **Weather** | OpenWeatherMap free API + mock fallback |
| **Auth** | JWT + bcrypt |
| **Hosting** | Vercel (frontend) + Render/Railway (backend) + Neon/Supabase (Postgres) |

---

## 3. Data Model (Core Tables)

- **users**: `id`, `name`, `email`, `password_hash`, `role` (citizen/volunteer/admin), `phone`, `lat`, `lng`, `trusted` (bool, for confidence scoring), `safetyStatus` (SAFE/NEEDS_HELP/UNKNOWN), `safetyUpdatedAt` (DateTime), `created_at`
- **alerts**: `id`, `hazard_type`, `severity`, `region`, `lat`, `lng`, `message`, `active`, `created_at`
- **sos_requests**: `id`, `user_id`, `user_name`, `user_phone`, `lat`, `lng`, `message`, `hazard_type`, `vulnerability_tags`, `batteryLevel` (Int? 0-100), `reportedByProxy` (Boolean), `subjectDescription` (String?), `citizenConfirmedResolved` (Boolean?), `priority` (NORMAL/URGENT), `status` (pending/in_progress/resolved), `assigned_volunteer_id`, `created_at`
- **shelters**: `id`, `name`, `address`, `lat`, `lng`, `capacity`, `current_occupancy`, `water_ok`, `rations_ok`, `restrooms_ok`, `power_ok`, `status` (green/yellow/red), `contact`, `active`, `last_audited_at`

### Resilience, Triage & Verification Tables
- **sos_requests**: `id`, `user_id`, `user_name`, `user_phone`, `lat`, `lng`, `message`, `hazard_type`, `vulnerability_tags`, `batteryLevel` (Int? 0-100), `reportedByProxy` (Boolean), `subjectDescription` (String?), `citizenConfirmedResolved` (Boolean?), `priority` (NORMAL/URGENT), `status` (PENDING, VERIFIED, EN_ROUTE, ON_SCENE, EVACUATED, HANDED_OVER_TO_MEDICAL, RESOLVED, CANCELLED), `triageTag` (IMMEDIATE/DELAYED/MINOR/DECEASED), `cancelReason` (String?), `assigned_volunteer_id`, `created_at`, `updated_at`
- **shelters**: `id`, `name`, `address`, `lat`, `lng`, `capacity`, `current_occupancy`, `water_ok`, `rations_ok`, `restrooms_ok`, `power_ok`, `waterLitersRemaining` (Int?), `waterThreshold` (Int?), `rationsUnitsRemaining` (Int?), `rationsThreshold` (Int?), `status` (GREEN/YELLOW/RED), `contact`, `active`, `last_audited_at`
- **hazard_reports**: `id`, `user_id`, `userName`, `lat`, `lng`, `hazard_note`, `severityBenchmark` (ANKLE/KNEE/WAIST/SUBMERGED), `photo_url` (in-app capture only), `confidence_tier` (GREY/AMBER/RED/DISPUTED/RESOLVED), `confirmations_count`, `created_at`
- **hazard_confirmations**: `id`, `hazard_report_id`, `confirming_user_id`, `voteType` (CONFIRM/FALSE/RESOLVED), `created_at`, `updated_at` — compound unique constraint `@@unique([hazardReportId, confirmingUserId])` with upsert support
- **civilian_assets**: `id`, `user_id`, `ownerName`, `contact`, `type`, `assetType` (BOAT/FOUR_BY_FOUR/MEDICAL/EQUIPMENT), `title`, `description`, `lat`, `lng`, `available`, `created_at`
- **supply_requests**: `id`, `shelter_id`, `item_name`, `quantity_needed`, `quantity_fulfilled`, `unit`, `status` (OK/LOW/CRITICAL), `updated_at`
- **supply_shipments**: `id`, `shelter_id`, `supply_request_id`, `item_name`, `quantity_claimed`, `quantity_verified`, `logged_by_user_id`, `received_at`
- **missing_persons**: `id`, `reported_by`, `name`, `age`, `description`, `last_seen_lat`, `last_seen_lng`, `status` (searching/matched/found), `matched_report_id` (nullable)
- **offline_sync_log**: `id`, `raw_payload`, `parsed_data` (JSON), `source_node`, `received_at`, `synced_at`

---

## 4. Verification & Risk Logic (rule-based, explainable AI)

### 4.1 SOS Ticket 7-State Lifecycle & Ownership State Machine (Sprint 3)
```
[ PENDING ]
     │ (Admin: PATCH /api/sos/:id/verify)
     ▼
[ VERIFIED ] ──────── (Admin solo demo fast path can claim from PENDING)
     │
     │ (Volunteer / Admin claim: PATCH /api/sos/:id/assign)
     │ [Atomic assignment lock; generic /status bypass strictly forbidden]
     ▼
[ EN_ROUTE ]
     │ (Ownership Guard: assigned responder or Admin only)
     ▼
[ ON_SCENE ]
     ├──► [ RESOLVED ] (Direct resolution for minor incidents)
     ▼
[ EVACUATED ]
     │
     ▼
[ HANDED_OVER_TO_MEDICAL ]
     │
     ▼
[ RESOLVED ]
     │ (Citizen closes loop: PATCH /api/sos/:id/citizen-verify)
     ├── confirmed: true  ──► [ Permanent Safe Closure ]
     └── confirmed: false ──► [ REOPENED → PENDING + URGENT ]

* Terminal Cancellation: PATCH /api/sos/:id/cancel requires cancelReason;
  allowed only by assigned responder or Admin, transitions to CANCELLED.
```

### 4.2 Casualty Triage Tags (Decision 0.2)
- Responders classify casualties using START triage tags (`PATCH /api/sos/:id/triage-tag`):
  - `IMMEDIATE` (Red): Life-threatening, immediate extrication required.
  - `DELAYED` (Yellow): Serious condition, stable for transport.
  - `MINOR` (Green): Walking wounded.
  - `DECEASED` (Black): Non-salvageable on ground.
- Strictly guarded: Citizens and unrelated volunteers receive HTTP 403 Forbidden.

### 4.3 Combined Shelter Readiness Formula & Depletion Alerts (Decision 0.4)
```
occupancy_pct = current_occupancy / capacity;
isNumericRed = (waterLitersRemaining < waterThreshold) || (rationsUnitsRemaining < rationsThreshold);
isBooleanRed = (water_ok === false) || (rations_ok === false);

if (occupancy_pct >= 0.9 || isNumericRed || isBooleanRed) {
    status = 'RED';
} else if (occupancy_pct >= 0.7) {
    status = 'YELLOW';
} else {
    status = 'GREEN';
}
```
- **Role-Scoped Sockets:** Threshold crossings trigger `shelter:restock_needed` scoped exclusively to `role:VOLUNTEER` and `role:ADMIN` socket rooms. Protected from civilian public exposure.

### 4.4 Relief Supply-Demand Gap & Shipment Manifest (Decision 0.5)
- Standardized single model: `SupplyRequest` tracking `quantityNeeded` and `quantityFulfilled` (no redundant on-hand field).
- Inbound deliveries logged via `POST /api/supply-shipments`:
  - Records `quantityClaimed` and `quantityVerified`.
  - Atomically increments `SupplyRequest.quantityFulfilled`.
  - Calculates and returns `remainingDeficit = max(0, quantityNeeded - quantityFulfilled)`.

### 4.5 Hazard-Specific Asset Mobilization Matching
- `GET /api/assets/suggestions?lat=...&lng=...&hazardType=...`:
  - Hazard matching rule:
    - `FLOOD` → Prioritizes `BOAT`.
    - `LANDSLIDE`, `EARTHQUAKE`, `ROAD_BLOCK` → Prioritizes `FOUR_BY_FOUR`, `TRUCK`.
    - `FIRE`, `MASS_CASUALTY` → Prioritizes `MEDICAL`.
  - Ranked order: Matching assets listed first, sorted by Haversine distance; closer non-matching assets retained to ensure full mobilization visibility.

---

## 5. Offline Resilience: Local Relay & Persistent PWA Queue

During major disasters, municipal power grids fail and cellular infrastructure goes dark. The platform addresses zero-internet and low-bandwidth scenarios using a three-tiered fallback architecture:

```
[Cellular / Internet Uplink Lost]
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Local Network Relay Hub (Hub-and-Spoke Mesh)             │
│    - Presentation laptop or local router acts as emergency  │
│      Wi-Fi hotspot with zero internet/WAN uplink.           │
│    - Backend binds to 0.0.0.0; clients auto-resolve LAN IP. │
└─────────────────────────────────────────────────────────────┘
         │
         ▼ (When even Local Relay is out of range / disconnected)
┌─────────────────────────────────────────────────────────────┐
│ 2. Client-Side Persistent Offline Queue (IndexedDB)         │
│    - PWA Service Worker (sw.js) caches app shell & tiles.   │
│    - SOS distress calls & ground hazard reports are held    │
│      locally in IndexedDB with client idempotency keys.     │
│    - Leaflet/OSM map tiles cached locally (cache-first).    │
└─────────────────────────────────────────────────────────────┘
         │
         ▼ (On link restoration or entering Local Hub range)
┌─────────────────────────────────────────────────────────────┐
│ 3. Monotonic Batch Reconnect Sync & Idempotency Engine      │
│    - Automatically flushes via `POST /api/offline/sync-batch`│
│      on browser `online` event or app boot.                 │
│    - Backend rejects duplicate replay via idempotency keys.  │
│    - Synchronized beacons broadcast instantly to dispatch.   │
└─────────────────────────────────────────────────────────────┘
```

- **Local Network Relay Hub:** When cellular data towers fail, first responders or neighborhood command posts deploy a local Wi-Fi hotspot (with mobile data off) or travel router. Any phone joining the hotspot communicates locally over LAN with the incident coordination server.
- **Service Worker & Map Tile Caching:** The PWA Service Worker caches the application shell and OpenStreetMap/Carto map tiles within the operational bounding box. This enables cold app boot in airplane mode with zero network access.
- **IndexedDB Persistent Queue (`offlineQueue.js`):** Intercepts SOS distress transmissions and hazard reports when the network drops. Distress packets are stored in local device storage with unique collision-resistant idempotency keys.
- **Batch Ingestion & Idempotency:** When any network interface (local relay or restored cellular) reconnects, the client flushes queued items to `/api/offline/sync-batch`. The backend processes items individually in isolated try/catch blocks, enforces idempotency to prevent duplicate database records, and immediately broadcasts alerts to dispatch consoles over WebSockets.
- **Stage Safety Override:** A manual outage simulation toggle in `OfflineSimulationDrawer.jsx` is retained as a presenter safety net alongside real `navigator.onLine` / fetch-failure interception.

---

## 6. Public Alert Reach: Zero-Account Registry & Multi-Channel Delivery

To close the critical vulnerability where emergency alerts only reach pre-authenticated citizens, the platform implements three unauthenticated, additive broadcast layers:

```
[Incident Commander / NDMA Admin / Automated Weather Trigger]
                          │
                          ▼
             POST /api/alerts (or /simulate)
                          │
       ┌──────────────────┼─────────────────────────┐
       ▼                  ▼                         ▼
1. WebSocket Room    2. SMS Gateway            3. Web Push Service
   (Socket.io)         (Twilio SDK)              (web-push + VAPID)
       │                  │                         │
       ▼                  ▼                         ▼
Logged-in Clients    Public Phone Registry     Service Worker (sw.js)
(Instant UI update)  (Region-scoped batch)     (Background OS Notification)
       │                                            │
       ▼                                            ▼
Max-Priority Modal                             OS Lock-Screen Alert
(Audio Siren + Takeover)                       (Persistent Interaction)
```

### 6.1 Multi-Tier Architecture Components
1. **Public Unauthenticated Registries (`PhoneRegistration`, `PushSubscription`):**
   - Decoupled from `User` account model — citizens can subscribe in seconds without registering an account.
   - **Rate-Limited Endpoints:** `POST /api/registry/phone` and `POST /api/registry/push` employ in-memory sliding window rate limits (10 req/min per IP) to suppress registration spam.
   - **Strict PII Lockdown:** Raw phone numbers and push keys are never exported or readable via any API endpoint. `GET /api/registry/stats` returns strictly aggregate numerical telemetry (`totalPhones`, `totalPushSubs`).
2. **Non-Blocking Fan-Out (`alert.controller.js`):**
   - Alert creation broadcasts instantly over WebSockets and responds immediately (HTTP 201) to the incident commander without waiting for telecom API round-trips.
   - Asynchronous fan-out executes in the background, matching subscribers by region (or wildcard subscribers).
3. **Resilient SMS Delivery (`sms.service.js`):**
   - Batched delivery using `Promise.allSettled` isolates per-number failures (e.g. unverified numbers on Twilio trial accounts or invalid subscriber numbers never block the rest of the batch).
   - Graceful fallback simulator logs delivery when credentials are unconfigured.
4. **W3C Web Push & Service Worker (`push.service.js` & `sw.js`):**
   - Uses VAPID cryptographic signatures (`web-push`).
   - Active pruning: Automatically purges dead or uninstalled subscriptions on HTTP 410 Gone / 404 responses.
   - Background push handler in `sw.js` triggers OS-level system notifications with vibration and persistent interaction flags even when the browser tab is closed (Android Chrome / installed PWA).
5. **In-App Max-Priority Takeover (`AlertBanner.jsx`):**
   - For users with the app open, receipt of a `CRITICAL` alert triggers a full-screen modal takeover with high-contrast civil defense typography.
   - Plays a synthesized dual-tone acoustic alert siren (880Hz / 660Hz) via the Web Audio API.
   - Requires explicit civilian acknowledgment tap ("I ACKNOWLEDGE THIS EMERGENCY ALERT"); does not auto-dismiss.

### 6.2 Production Roadmap: NDMA Sachet & Cell Broadcast Integration
Web platforms cannot bypass physical OS hardware Do Not Disturb (DND) or silent switches — this is an operating system privilege reserved for native telecom cell broadcasts. In a production national deployment, this platform's response coordination layer is designed to ingest and trigger feeds via **NDMA's Sachet national portal** and CAP (Common Alerting Protocol) gateways for carrier-grade cell broadcast delivery.

