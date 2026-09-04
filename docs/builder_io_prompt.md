# Builder.io Prompts & Execution Guide for SIH-206

This guide contains the exact, copy-paste prompts and safety rules for modernizing the **SIH-206 React frontend** via Builder.io Projects/Fusion without risking the production backend, database, or WebSocket real-time loops.

---

## 1. Branch Safety (Already Prepared)
* **Production Branch:** `main` (Live on [https://sih-206.vercel.app/](https://sih-206.vercel.app/))
* **Builder.io Working Branch:** `builder-ui-redesign` (Live on GitHub: [https://github.com/avira-l07/SIH-206/tree/builder-ui-redesign](https://github.com/avira-l07/SIH-206/tree/builder-ui-redesign))

When connecting GitHub in Builder.io, always select the **`builder-ui-redesign`** branch.

---

## 2. Secrets Checklist (Zero-Leak Policy)
Only provide Builder.io with the public frontend environment variable:
* `VITE_API_URL`: `https://sih-206.onrender.com`

**NEVER provide Builder.io with:**
* `DATABASE_URL` (Neon PostgreSQL)
* `JWT_SECRET`
* Render / Vercel API tokens

---

## 3. Step 1 Prompt: Architecture Inspection (Run This First)

Paste this prompt into Builder.io to ensure it understands the codebase before writing any code:

```text
Analyze the existing SIH-206 project before making any changes.

This is an active production React (Vite) + Tailwind CSS application connected to a live Node.js/Express + Socket.io backend on Render and Neon PostgreSQL. Do NOT rebuild this application from scratch.

Your first task is ONLY to inspect and understand the current frontend architecture located in the /frontend directory.

Inspect:
1. Entry point (frontend/src/main.jsx, frontend/src/App.jsx, frontend/index.html)
2. Role routing & dashboards (CitizenDashboard.jsx, VolunteerDashboard.jsx, AdminDashboard.jsx, Login.jsx, Register.jsx)
3. State & context (frontend/src/context/AuthContext.jsx, frontend/src/context/SocketContext.jsx)
4. Reusable components (MapView.jsx, AlertBanner.jsx, SOSButton.jsx, ShelterList.jsx, ConnectionBadge.jsx, QuickRoleSwitcher.jsx)
5. Services (frontend/src/services/api.js, frontend/src/services/haversine.js)
6. Tailwind & typography (frontend/src/index.css, Space Grotesk, IBM Plex Sans, Inter)

Critical Architecture Constraints:
- Do NOT touch or modify anything in the /backend directory.
- Do NOT change or remove API calls in frontend/src/services/api.js.
- Do NOT replace working API / WebSocket data with mock JSON.
- Do NOT remove Leaflet map integration (<MapContainer>, <TileLayer>, <Marker>, <Popup>, <Circle>) or break its CSS height container.
- Do NOT remove the top-bar QuickRoleSwitcher (it is vital for live hackathon judging).
- Preserve the Socket.io event names ('alert:new', 'sos:created', 'sos:status_changed', 'shelter:occupancy_changed').

Please provide a concise architecture summary identifying:
1. Component hierarchy and state flow
2. Primary files responsible for the UI layout
3. The safest incremental steps to modernize the visual styling without breaking functionality.
Do NOT make code modifications yet.
```

---

## 4. Step 2 Prompt: UI Modernization & Polish

Once Builder.io provides the analysis, give it this prompt to execute the redesign:

```text
Redesign and modernize the frontend UI of the SIH-206 application on the builder-ui-redesign branch.

IMPORTANT: This is a visual and UX modernization task, NOT a rewrite. All existing backend integrations, WebSockets, JWT authentication, and business logic must remain 100% operational.

Design Guidelines (Emergency Response / Field-Ops Aesthetic):
- Color Palette: Maintain high-contrast, functional urgency colors:
  * Primary background: Warm off-white / paper (#F6F4EF)
  * Text / Headings: Near-black slate green (#14231F)
  * Critical / Emergency Distress: Brick red (#B23A2E)
  * Safe / Resolved / Shelters Available: Deep forest green (#2E6E4E)
  * Watch / Advisory: Amber / ochre (#C97A2B)
  * Hairline borders: Muted sand (#D8D3C7)
- Layout: Map-first layout (60-65% viewport for Leaflet map, docked collapsible panels for dispatch / shelters / metrics).
- Typography: Clear hierarchy using Space Grotesk for technical headers, Inter/IBM Plex Sans for data, tabular numbers for coordinates and timestamps.
- Avoid consumer SaaS clichés: No loud purple/blue gradient washes, no heavy drop shadows on every card, no distracting looping animations except for active emergency SOS pins.

Key Screens & Components to Polish:
1. Login & Register: Clean, high-impact tactical card with prominent demo quick-fill buttons.
2. Top Navbar: Refined status header with the LIVE SYNC badge, user identifier, and quick role toggle.
3. Citizen Dashboard: Prominent accessible SOS button, live SOS state tracker, and proximity-sorted shelter cards with bed availability pills.
4. Volunteer Dispatch Console: Clean tactical queue with distance markers, hazard type badges, and one-click 'Accept Dispatch' / 'Mark Resolved' actions.
5. NDMA Admin Console: Situational metrics cards, emergency alert broadcast modal, and the AI / IoT Sensor Risk simulator.
6. Mobile Responsiveness: Seamless stacked layout for phones (map on top, action panel below).

Requirements:
- Reuse existing components where possible.
- Ensure all forms, buttons, popups, and WebSocket listeners function identically.
- Ensure `npm run build` succeeds with zero errors.
- Commit changes incrementally or open a Pull Request against the main branch.
```

---

## 5. Review & Merge Workflow

```
Builder.io (visual edits)
       │
       ▼
GitHub Pull Request (builder-ui-redesign -> main)
       │
       ├── Review diff on GitHub
       └── Click "Merge pull request"
              │
              ▼
       Vercel auto-deploys
              │
              ▼
   https://sih-206.vercel.app/
```
