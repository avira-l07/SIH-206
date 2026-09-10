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

### 0:45 - 1:30 | Scene 2: Control-Room Verification, Triage Tags & Citizen Rescue Closure
1. **Presenter Narration:**
   > *"In chaotic floods, first responders blindly chase raw civilian panic signals, causing duplicate dispatches and chaos. Our 5-stage Triage Kanban introduces Control-Room Verification, casualty START tagging, and a closed-loop citizen verification system."*
2. **Action on Screen (Citizen Dashboard):**
   - Click the big red **SOS button**.
   - Note the **Device Telemetry**: Shows real-time battery status (`⚡ 12% Battery - CRITICAL LOW (Auto-Urgent Priority)`).
   - Toggle **Proxy SOS**: *"Reporting on behalf of elderly neighbor Mrs. Joshi, wheelchair user on 2nd floor"*.
   - Select vulnerability chip: **Dialysis Patient** $\rightarrow$ Transmit Signal.
3. **Action on Screen (Command Console & Volunteer Triage Kanban):**
   - Switch to the Command view and open **Triage Kanban**.
   - The distress call enters Column 1 (**1. REPORTED**), pinned to the top with a red accent bar, critical battery badge, and proxy distress description.
   - **Control-Room Gate:** Point out that plain volunteers cannot claim unverified signals. The dispatcher clicks **VERIFY TICKET** $\rightarrow$ Incident transitions to Column 2 (**2. VERIFIED**).
   - Volunteer clicks **Accept Dispatch** $\rightarrow$ Moves into **3. EN ROUTE / ON SCENE** and activates the atomic **Assignment Lock** (blocks duplicate dispatch with HTTP 409).
   - Point to the **Suggested Asset Match**: *"Suggested: Rescue Boat (Zodiac) • 1.2km away"* with one-tap mobilization call.
   - Responder assigns casualty START triage tag: **RED // IMMEDIATE** (life threat extrication priority).
   - Step through the sequential lifecycle: `On Scene` $\rightarrow$ `Evacuated` $\rightarrow$ `Medical Handover` $\rightarrow$ `Mark Rescued`.
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

### 2:15 - 2:45 | Scene 4: Shelter Readiness Audits, Depletion Alerts & Supply Manifest
1. **Presenter Narration:**
   > *"Evacuees often walk kilometers only to find their shelter is out of water or overflowing. Our Shelter Readiness engine calculates combined readiness and coordinates verified supply shipments."*
2. **Action on Screen (Shelter Finder & Logistics):**
   - Open the **Emergency Shelters** panel. Show the 5-resource status bar plus numeric reserves (`Water Liters Remaining`, `Rations Units Remaining`).
   - Ground audit reports water below threshold (e.g. 140L < 200L reserve threshold) $\rightarrow$ Shelter turns **RED**.
   - **Role-Scoped Depletion Alert:** A high-visibility banner flashes across Volunteer and Admin consoles: *"CRITICAL SHELTER INVENTORY DEPLETION: Kurla Relief Camp water below safety reserve!"* (Privately gated from citizens to prevent panic).
   - Click **Log Relief Shipment** / **Supplies**: Opens the Relief Supply-Demand Gap & Shipment Manifest.
   - Click **Log Verified Inbound Shipment**: Input 50 verified drinking water crates $\rightarrow$ Submits verified shipment receipt, increments fulfilled inventory, and automatically updates the remaining deficit in real time!

---

### 2:45 - 3:00 | Scene 5: Zero-Internet Resilience (Local Relay & Airplane Mode PWA Queue)
1. **Presenter Narration:**
   > *"When municipal power grids and cellular towers collapse, our platform doesn't die. Devices continue operating locally: the presentation laptop acts as an emergency local-network relay with zero internet uplink, and when even the relay is out of range, the PWA Service Worker and IndexedDB store distress signals safely on the phone with client-side idempotency."*
2. **Action on Screen & Physical Phone:**
   - **Step A (Physical Phone in Airplane Mode):** Turn on **Airplane Mode** on the demo phone (cutting all Wi-Fi and cellular).
   - **Step B (Offline SOS Dispatch):** Click **SEND SOS // EMERGENCY HELP** on the phone, select `FLOOD`, check `Dialysis Patient`, and submit.
   - **Step C (Zero Data Loss Confirmation):** The modal immediately shows: *"Offline Outage: SOS Distress Signal Queued Locally"*. The `ConnectionBadge` displays `OFFLINE (1 QUEUED)`. The distress packet is held safely in persistent IndexedDB.
   - **Step D (Restoring Link & Auto-Flush):** Turn off Airplane Mode (reconnecting to the laptop's Wi-Fi hotspot).
   - **Step E (Live Synchronized Reception):** The phone detects connection and auto-flushes the queued batch (`POST /api/offline/sync-batch`). The `ConnectionBadge` switches to `LIVE RELAY`. The Admin situation dashboard immediately receives the priority distress beacon via WebSocket with `relayedViaLocalHub: true`!
   - **Stage Safety Net (Presenter Control):** If presenting on a single laptop without physical phones, click the floating **OFFLINE & RELAY TOOLS** button in the bottom right, click **TRIGGER OUTAGE SIMULATION**, queue an SOS and SMS (`SHTR 104 F0 W1 B15`), then click **RESTORE CONNECTIVITY** to demonstrate the exact same batch flush!

---

## 🎯 Pre-Demo Setup & Stage Rehearsal Logistics
1. **Local Hotspot Relay (Hub-and-Spoke):**
   - Turn on **Windows Mobile Hotspot** on your presentation laptop (turn off cellular data on the laptop if using a USB dongle; the hotspot should have no internet uplink).
   - When the backend starts, note the printed LAN IP (e.g. `http://192.168.137.1:5000` or `http://10.90.155.181:5000`).
   - Connect your 2–3 rehearsal phones to the laptop's hotspot Wi-Fi.
2. **PWA Service Worker on Phones (LAN Secure Context):**
   - Because browsers enforce Service Worker registration only over HTTPS or localhost, open Chrome on each demo phone and visit:
     `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
   - Enable the flag, enter your laptop's URL (e.g., `http://192.168.137.1:5173`), and tap **Relaunch**.
   - Open `http://<laptop-LAN-IP>:5173` on the phone. The emergency Service Worker will register and cache the application shell and map tiles.
3. **Stage Safety Fallback:**
   - Always keep Tab 1 open to NDMA Admin/Volunteer Dispatch and Tab 2 open to Citizen view.
   - The manual toggle in **OFFLINE & RELAY TOOLS** guarantees 100% stage control even if venue Wi-Fi misbehaves!

