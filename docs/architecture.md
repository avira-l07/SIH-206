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

### Resilience & Verification Tables
- **hazard_reports**: `id`, `user_id`, `userName`, `lat`, `lng`, `hazard_note`, `severityBenchmark` (ANKLE/KNEE/WAIST/SUBMERGED), `photo_url` (in-app capture only), `confidence_tier` (GREY/AMBER/RED/DISPUTED/RESOLVED), `confirmations_count`, `created_at`
- **hazard_confirmations**: `id`, `hazard_report_id`, `confirming_user_id`, `voteType` (CONFIRM/FALSE/RESOLVED), `created_at`, `updated_at` — compound unique constraint `@@unique([hazardReportId, confirmingUserId])` with upsert support (allows vote correction, blocks identical duplicate spam within 2 seconds)
- **civilian_assets**: `id`, `user_id`, `asset_type` (boat/tractor/generator/medical/etc.), `description`, `lat`, `lng`, `contact`, `active`
- **supply_requests**: `id`, `shelter_id`, `item_name`, `quantity_needed`, `quantity_fulfilled`, `updated_at`
- **missing_persons**: `id`, `reported_by`, `name`, `age`, `description`, `last_seen_lat`, `last_seen_lng`, `status` (searching/matched/found), `matched_report_id` (nullable)
- **offline_sync_log** (simulated mesh/SMS ingestion): `id`, `raw_payload` (e.g. `"SHTR 104 F0 W1 B15"`), `parsed_data` (JSON), `source_node` (e.g. `"Mobile Node #4"`), `received_at`, `synced_at`

---

## 4. Verification & Risk Logic (rule-based, no ML required)

**Confidence tier calculation (Sprint 2 multi-vote evaluation order):**
```
1. resolvedVotes (trusted OR >= 2) → RESOLVED (cleared from active hazard view, queryable)
2. falseVotes    (trusted OR >= 2) → DISPUTED (quarantined from active dispatch, visible as hatched)
3. confirmVotes  (trusted OR >= 3) → RED (fully verified ground emergency)
4. confirmVotes  (>= 1)            → AMBER (preliminary verification)
5. else                            → GREY (unverified, review only)
```

**Battery null-safe auto-triage (Decision 0.1):**
```
isUrgent = (vulnerability_tags.length > 0) || (batteryLevel !== null && batteryLevel <= 15);
priority = isUrgent ? "URGENT" : "NORMAL";
```
*Null safety ensures desktop/unsupported browser sessions (where `batteryLevel === null`) never coerce to 0 and falsely trigger urgent priority.*

**Citizen rescue verification loop (Item 1.3):**
- Responders mark SOS `RESOLVED`.
- Citizen dashboard surfaces confirmation card:
  - `confirmed: true` → `citizenConfirmedResolved: true`, ticket closed permanently.
  - `confirmed: false` → Reopens to `PENDING`, sets `priority: "URGENT"`, unassigns volunteer, prepends `"[REOPENED BY CITIZEN: RESCUE INCOMPLETE]"` to message, re-alerts commanders.
- Guarded by authorization: only the original author citizen (or Admin) can invoke `PATCH /api/sos/:id/citizen-verify`.

**Privacy-preserving safety lookup (Decision 0.3):**
- `GET /api/auth/safety-lookup?query=...` requires authentication (`req.user` must exist).
- Sliding-window in-memory rate limiting (20 requests/minute per user) blocks account enumeration.
- Response payload shape: `{ status: "SAFE"|"NEEDS_HELP"|"UNKNOWN", asOf: "<timestamp>" }` — strictly omits queried phone, name, or email to prevent PII exposure.

**Shelter status calculation** (runs on every audit update):
```
occupancy_pct = current_occupancy / capacity
if occupancy_pct >= 0.9 OR NOT water_ok OR NOT rations_ok  → red
else if occupancy_pct >= 0.7                                → yellow
else                                                          → green
```

These are intentionally simple, explainable rules — call this out in your pitch as "rule-based AI-assisted triage," which is honest and still satisfies most SIH rubrics better than a black-box model you can't explain under Q&A.

---

## 5. Offline/Mesh Simulation (no real hardware needed)

For the demo, "offline mesh" and "SMS ingestion" are simulated at the application layer:
- A **"Simulate network outage"** toggle switches the current browser session to local-only mode; new reports/audits queue in local state instead of hitting the API.
- A small **SMS-syntax parser** (e.g. `SHTR 104 F0 W1 B15` → shelter #104, 0% full, water available, 15 beds free) accepts typed input from a "simulated SMS gateway" box and writes to `offline_sync_log`.
- On "reconnect," queued items sync and appear with a `synced_at` timestamp; anything in `offline_sync_log` older than 2 hours renders visually faded (staleness indicator) until refreshed.

This proves the concept and data model without needing a real Bluetooth/Wi-Fi Direct stack or telecom SMS gateway.
