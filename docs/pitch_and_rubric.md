# SIH26206: 1-Page Pitch, Rubric Defense & Judges FAQ

## 📌 Executive Summary
**Problem Statement SIH26206:** Development of an AI/IoT-Powered Real-Time Disaster Management Platform.

During catastrophic events, emergency response fails not due to lack of goodwill, but due to **information disorder**:
1. **Unverified crowdsourced reports** cause rescue teams to waste hours investigating outdated or fabricated rumors.
2. **Distress queues treat all calls identically**, leaving dialysis patients, infants, and pregnant mothers lost in thousands of requests.
3. **Shelters become secondary disasters** when evacuees arrive at full or water-depleted safe havens.
4. **Total data blackout** paralyzes response when cellular and internet backbones fail.

**Our Solution:** A resilient, field-tested web platform engineered specifically for chaotic, low-connectivity conditions, combining automated multi-hazard risk alerting, vulnerability triage, a ground-truth confidence engine, and zero-internet SMS telemetry.

---

## 🏆 Key Architectural Differentiators

| Traditional Disaster Apps | Our SIH26206 Platform |
|---|---|
| Accepts unverified social media photos | **Anti-Misinformation Camera Gate**: Native camera capture only (`capture="environment"`), blocking gallery uploads |
| Single unverified report triggers panic | **Confidence-Tier Engine**: Dynamic promotions (`GREY` $\rightarrow$ `AMBER` $\rightarrow$ `RED`) via proximity peer verification and trusted municipal signatures |
| Flat first-come-first-served SOS queue | **Vulnerability-Based Triage**: 1-tap medical/infant tags auto-pin urgent cases to the top of a 4-column Kanban board |
| Responders duplicate each other's work | **Assignment Locking**: 409 Conflict protocol locks coordinates to one field team upon claim |
| Static shelter address lists | **5-Resource Readiness Audits & Auto-Rerouting**: If a shelter status turns `RED`, the system automatically reroutes evacuees to the nearest viable green haven |
| Hard crash on cellular outage | **Offline Telemetry Gateway**: Low-bandwidth raw SMS parser (`SHTR`, `SOS`) with local browser queueing and monotonic sync |

---

## 🛡️ Anticipated Judges Questions & Defense (Rubric Alignment)

### 1. "How would your platform interface with physical IoT sensors, weather stations, or drones?"
> **Our Answer:**
> *"Our risk engine is designed around an event-driven telemetry adapter layer (`processTelemetryAndAlert`). Any physical IoT hardware—whether a LoRaWAN river water level gauge, a smoke/particulate sensor, or a drone telemetry feed—posts standard JSON to `/api/alerts/simulate` or through our MQTT/WebSocket pipeline. In our live demo, we simulate sensor readings for floods, extreme wildfires, and earthquakes to prove the decision-engine math works deterministically without relying on fragile physical hardware on a conference stage."*

### 2. "Why did you use text-based matching rather than facial recognition for missing persons?"
> **Our Answer:**
> *"This was an intentional, responsible engineering decision. In real disaster zones, field cameras suffer from poor lighting, mud, and water distortion, which causes unacceptable false positive rates with facial recognition. Furthermore, storing and processing biometrics of vulnerable victims raises serious privacy and legal compliance concerns. Instead, we built instant attribute-based matching (name, age, distinctive features, and last-seen landmarks) synchronized directly with shelter intake rosters, which solves the immediate family reunification problem reliably without computational overhead."*

### 3. "What prevents malicious users from spamming fake hazard reports?"
> **Our Answer:**
> *"We implement a three-layer trust moat: First, reports must be captured through the live device camera—pre-existing internet photos cannot be uploaded. Second, every new report is quarantined in the `GREY` (unverified) tier and will not trigger volunteer dispatch. Third, peer confirmations require unique user accounts and enforce a database-level `unique(hazard_report_id, confirming_user_id)` constraint to prevent sybil inflation. Only reports confirmed by multiple independent citizens or a verified municipal officer reach the `RED` tier."*

### 4. "How does the system work when the internet is completely dead?"
> **Our Answer:**
> *"When internet connectivity fails, our platform switches to low-bandwidth SMS/Ham-radio packet ingestion. We developed a fixed-syntax parser (`SHTR <id> F<pct> W<1|0> B<beds>` and `SOS <lat> <lng> <type> <tag>`) that decodes raw 160-character cellular SMS or radio telemetry packets and updates shelter readiness and emergency queues directly into the state machine. In the browser, an offline queue buffers user actions and replays them with monotonic timestamp ordering upon reconnection."*

---

## 📊 Live Verification Credentials for Judges

- **Backend API Health Check:** `GET /api/health` $\rightarrow$ `200 OK`
- **Automated Test Suite:** `node verify-endpoints.js` runs 9 automated verification tests across auth, triage, shelter audits, confidence tiering, SMS telemetry, and community mobilization.
- **Seeded Demo Accounts:**
  - Citizen: `citizen@sih.gov.in` / `password123`
  - NDRF Volunteer: `volunteer@sih.gov.in` / `password123`
  - Municipal Officer (Trusted): `trusted_officer@sih.gov.in` / `password123`
  - Peer Confirmers: `confirmer1@sih.gov.in`, `confirmer2@sih.gov.in` / `password123`
