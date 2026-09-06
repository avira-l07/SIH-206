# PRD - SIH26206: AI/IoT-Powered Disaster Management Platform

## 1. What to Build
A web application that centralizes disaster preparedness and response for citizens, rescue teams, and government agencies. Core idea: one dashboard that collects data (weather/GIS/crowdsourced/sensor), predicts risk, alerts people in real time, coordinates resources during a disaster, and **verifies ground-truth data so responders can trust it under chaotic, low-connectivity conditions.**

**Problem it solves:**
- Delayed alerts and communication during disasters
- Lack of real-time data & situation awareness
- Poor coordination among agencies & volunteers
- Limited public awareness and preparedness
- **Unverified/duplicate crowdsourced reports causing wasted or misdirected rescue effort**
- **Total data blackout when networks go down mid-disaster**
- **No visibility into on-ground resource gaps (shelters, supplies, civilian assets) until it's too late**

**Scope for the working prototype (laptop-buildable):**
- Web app only (skip native mobile app - Flutter/React Native - for MVP)
- Simulated/mocked sensor & IoT data (no real drones/hardware needed)
- One real free data source (weather API) + mocked GIS/hazard data
- Focus on 3 hazard types max for demo: `FLOOD`, `EARTHQUAKE`, `FIRE`
- Offline/mesh features are **simulated in-browser** (no real Bluetooth/SMS gateway needed for MVP demo — see Section 7)

---

## 2. Target Users

| User | Need |
|---|---|
| **Citizen** | Get real-time alerts, find shelters, request SOS help, report hazards/resources on the ground |
| **Volunteer / Rescue Team** | See live incidents, coordinate response, update status, see verified vs. unverified reports |
| **Government / NDMA Agency** | Monitor dashboard, manage resources, send official alerts, see supply-demand gaps |

---

## 3. Core Features (MVP-prioritized)

### Must-have (Demo-critical) — unchanged from before, these are your foundation
1. **Live Situation Dashboard** — map view with active alerts/incidents
2. **Real-time Disaster Alerts** — push/banner alerts by region & hazard type
3. **SOS / Emergency Request** — citizen submits location + help needed
4. **Shelter Finder** — list/map of nearby shelters with capacity
5. **Role-based login** — Citizen / Volunteer / Admin

### Should-have (this is where your new ideas plug in — high value, still buildable)
6. **Hazard Mapping & basic risk prediction** (rule-based, not full ML for MVP)
7. **Resource & Volunteer management** (assign SOS to nearest volunteer)
8. **Multi-channel alert simulation** (in-app + email; SMS optional/mocked)
9. **Shelter Readiness & Resource Audits** — citizens/admins toggle bed/water/rations/power status per shelter; color-coded gauge (green/yellow/red); auto-flag + redirect when a shelter crosses 90% occupancy or runs out of water
10. **Vulnerability-Based SOS Triage** — one-tap tags for infants, bedridden elders, pregnant women, dialysis patients; Kanban board (Reported → Verified → Dispatched → Rescued); urgent tags auto-jump the queue and lock coordinates to one team to prevent duplicate dispatch
11. **Confidence-Tier Verification for Crowdsourced Reports** — in-app-only camera capture (no gallery upload) + peer-confirmation prompts to users within ~300m; pins colored grey (unverified) / amber (1 confirmation) / red (3+ confirmations or trusted user); dispatch only fires on amber/red, grey stays in a review queue
12. **Hyper-Local Hazard & Route Navigability** — geotagged hazard reports (water depth, fallen trees, downed lines) rendered as hazard polygons on the map; blocked road segments auto-excluded from suggested rescue/relief routes

### Nice-to-have (stretch — pitch as roadmap if time-constrained, but build a thin working version if possible)
13. **Civilian Asset & Skill Mobilization** — "I Have / I Can" listings (boats, tractors, generators, off-duty medics) as a filterable map layer within 2km of active incidents
14. **Relief Supply-Demand Gap Mapping** — simple table/matrix per shelter of requested vs. available critical supplies (baby formula, insulin, chlorine tablets), flagging shortages
15. **Missing Persons Registry (text-based, not facial recognition for MVP)** — name/age/description/last-seen-location matching between filed reports and shelter intake lists, with a simple similarity score
16. **Basic ML/AI risk score** using historical + weather data
17. Crowdsourced incident reporting with photo upload (superseded/extended by #11 above)

### Explicitly deferred (mention only as "future work" in your pitch — do not attempt to build)
- **Facial-recognition matching** for missing persons (accuracy + biometric privacy risk too high for hackathon timeline)
- **Real Bluetooth/Wi-Fi Direct mesh networking** and live 2G SMS gateway integration (simulate the *data format and UI*, not the actual radio/telecom layer)
- **Multi-dialect voice-to-text NLP** (build for one language only if attempted at all)
- Real drone/satellite integration
- Production-grade IoT sensor network
- Full multi-language, multi-region compliance
- Payment gateway (not needed for disaster response)

---

## 4. Success Criteria for Demo
- A citizen can register, see an alert, and raise an SOS in under 1 minute
- An admin can see the SOS appear live on the dashboard map
- A volunteer can accept an SOS and mark it resolved
- Weather-based alert auto-generates for a selected region (from real API / simulator)
- **A crowdsourced hazard report starts grey, gets peer-confirmed live during the demo, and turns red — visibly proving the trust mechanism works**
- **A shelter crossing 90% occupancy visibly flags and the dashboard suggests the nearest alternative**
- **A vulnerability-tagged SOS (e.g. "dialysis patient trapped") visibly jumps above a normal SOS in the triage queue**

---

## 5. Out of Scope for MVP
- Real drone/satellite integration
- Production-grade IoT sensor network
- Full multi-language, multi-region compliance
- Payment gateway (not needed for disaster response)
- Facial recognition, real mesh/SMS radio layers, multi-dialect NLP (see Section 3 deferred list)

---

## 6. Data Privacy & Trust Notes (add this — judges will ask)
- Citizen phone numbers and precise GPS are sensitive; note that in production these would be encrypted at rest and access-restricted to verified responders only.
- In-app-only camera capture (no gallery upload) exists specifically to reduce fake/recycled-image reports — state this explicitly in your pitch as a deliberate anti-misinformation design choice.
- Any missing-persons or vulnerability data should have a stated retention/deletion policy even if not implemented in the demo.

---

## 7. How to "Fake" the Hard Stuff Convincingly for a Demo
You don't need real hardware to make these features land — you need a believable simulation:
- **Offline mesh:** show a toggle "Simulate network outage" that switches a device to local-only mode, queues reports, then "syncs" them with a visible timestamp/staleness indicator once reconnected. This demonstrates the concept without a real Bluetooth stack.
- **SMS ingestion:** build a small parser for a fixed syntax (e.g. `SHTR 104 F0 W1 B15`) that a demo user can literally type into a "simulated SMS gateway" input box, and show it populate the shelter-audit dashboard. Judges care that the *parsing logic* exists, not that a real telecom API is wired up.
- **Peer confirmation:** simulate multiple "nearby users" with seeded demo accounts so you can trigger amber → red transitions live on stage.
