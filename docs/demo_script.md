# SIH26206: 3-Minute Live Stage Demo Script

**Objective:** Showcase the platform's four differentiators (Multi-hazard IoT simulation, Vulnerability Triage, Ground-truth Peer Verification, and Offline Mesh/SMS resilience) in under 180 seconds with zero downtime risk.

---

## ⏱️ Timeline & Actions Breakdown

### 0:00 - 0:45 | Scene 1: Multi-Hazard Telemetry & Rapid Automated Alerting
1. **Presenter Narration:**
   > *"When disaster strikes, every second of delayed communication costs lives. Here is our NDMA Command Console monitoring multi-hazard environmental telemetry in real time."*
2. **Action on Screen (Admin Dashboard):**
   - Show the **Situational Overview Map** with active regional alerts and radii.
   - Go to the **AI / IoT Risk Simulator** on the right panel.
   - Select **Kurla East (Torrential Flood Scenario: 75mm/h)** $\rightarrow$ Click **TRIGGER SENSOR RISK EVALUATION**.
   - **Result:** The system evaluates rainfall $>60\text{mm/h}$, immediately generates an official `CRITICAL // FLOOD` alert, and broadcasts it over WebSockets. An alert banner flashes across all dashboards.

---

### 0:45 - 1:30 | Scene 2: Vulnerability Triage, Battery Telemetry & Citizen Rescue Closure
1. **Presenter Narration:**
   > *"In standard disaster systems, all distress calls enter a flat list. Responders cannot tell whose battery is dying or who is bedridden. Our platform introduces Vulnerability & Telemetry Triage with a closed-loop citizen rescue verification."*
2. **Action on Screen (Citizen Dashboard):**
   - Click the big red **SOS button**.
   - Note the **Device Telemetry**: Shows real-time battery status (`⚡ 12% Battery - CRITICAL LOW (Auto-Urgent Priority)`).
   - Toggle **Proxy SOS**: *"Reporting on behalf of elderly neighbor Mrs. Joshi, wheelchair user on 2nd floor"*.
   - Select vulnerability chip: **Dialysis Patient** $\rightarrow$ Transmit Signal.
3. **Action on Screen (Volunteer Console):**
   - Switch to the Volunteer view and switch to **Triage Kanban**.
   - Point out that the call auto-pins directly to the top with a red accent bar, critical battery badge, and proxy distress description.
   - Click **Claim Dispatch** $\rightarrow$ Show **Assignment Lock** (prevents duplicate dispatch).
   - Click **Mark Rescued**.
4. **Action on Screen (Citizen Dashboard - Rescue Closure Loop):**
   - Citizen console immediately pops up the **Rescue Closure Verification Card**: *"Rescue team marked ticket resolved. Has help arrived?"*
   - Show the two options: Tap **YES** to permanently close, or **NO** to instantly reopen to PENDING with URGENT priority if responders left prematurely.

---

### 1:30 - 2:15 | Scene 3: Anti-Misinformation, Structured Depth & Route Obstruction
1. **Presenter Narration:**
   > *"Social media crowdsourcing during disasters is plagued by fake rumors and panic. Our Ground-Truth Trust Engine actively debunks false reports while calculating road navigability from structured water depths."*
2. **Action on Screen (Citizen View):**
   - Open **Report Ground Hazard**.
   - Select structured depth benchmark: **Waist-deep** (required before dispatch).
   - Submit report: *"Subway junction flooded waist-deep"*.
   - Point to the map: It renders a **dashed route obstruction ring (150m radius)** warning drivers that the road is impassable. Starts at **GREY pin**.
3. **Action on Screen (Anti-Misinformation Live Beat):**
   - Switch to Confirmer #1: Prompt surfaces with three voting options: `Confirm Hazard`, `Mark False / Rumor`, `Mark Resolved`.
   - Confirmer marks **Mark False / Rumor**.
   - Second false vote arrives $\rightarrow$ The pin immediately flips to **DISPUTED (hatched/striped grey pin with ✕)** and is quarantined from active dispatch!
   - Highlight the **Vote Correction Feature**: If a user mis-taps, they can tap another option to update their vote (upsert) without being locked out.

---

### 2:15 - 2:45 | Scene 4: Shelter Readiness Audits & Automated Evacuation Rerouting
1. **Presenter Narration:**
   > *"Evacuees often walk kilometers only to find their shelter is out of water or overflowing. Our Shelter Readiness engine prevents this."*
2. **Action on Screen (Shelter Finder):**
   - Open the **Emergency Shelters** panel. Show the compact 5-resource status bar: `Beds`, `Water`, `Food`, `Sanitation`, `Power`.
   - Click **Audit** on the nearest shelter $\rightarrow$ Toggle Water to **Depleted** or set Occupancy to 95%.
   - **Result:** The shelter turns **RED**. The platform immediately displays an **Automated Evacuation Reroute Banner**:
     > *"NEAREST SHELTER IS AT CAPACITY / DEPLETED — Auto-Rerouting to nearest viable safe haven: Don Bosco Relief Hub (1.8 km away)"*
   - Click **Supplies**: Point out the live supply-demand gap matrix tracking infant formula, insulin vials, and potable water.

---

### 2:45 - 3:00 | Scene 5: Zero-Internet Resilience (Offline Mesh & SMS Telemetry)
1. **Presenter Narration:**
   > *"When the cell towers collapse, the platform continues operating at the application layer."*
2. **Action on Screen (Offline & SMS Drawer):**
   - Click **OFFLINE & SMS TOOLS** floating button in bottom right.
   - Toggle **Simulate Network Outage**: Point out that local actions queue in browser storage without crash.
   - In the **Simulated SMS Gateway**, type/click sample payload: `SHTR 104 F0 W1 B15`.
   - Click **Send Simulated SMS Telemetry**.
   - **Result:** The SMS telemetry parser extracts Shelter ID 104, restores water, updates free beds to 15, and commits to the municipal sync log with an audit timestamp.

---

## 🎯 Pro-Tips for Stage Delivery
- Keep two browser tabs open side-by-side (Tab 1: NDMA Admin / Volunteer, Tab 2: Citizen / Confirmer).
- Show the role switcher in the navbar to seamlessly demonstrate cross-role synchronization.
- If wifi drops, the platform continues functioning thanks to the local SQLite fallback and simulated offline gateway!
