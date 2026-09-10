# SIH26206 Deployment & PostgreSQL Migration Guide

Follow these 4 simple steps to migrate the database to PostgreSQL and deploy the platform live to Render and Vercel for judging.

---

## Step 1: Create a Free PostgreSQL Database on Neon (60 seconds)

1. Open [https://console.neon.tech/](https://console.neon.tech/) and sign in with GitHub or Google (Free tier, no credit card required).
2. Click **Create Project**, name it `sih26206-db`, and click **Create**.
3. Under **Connection Details**, copy the connection string:
   ```text
   postgresql://<username>:<password>@<ep-xyz>.neon.tech/neondb?sslmode=require
   ```
4. Paste this connection string in your chat response. Antigravity will automatically update `.env`, switch `schema.prisma` to `provider = "postgresql"`, run `npx prisma db push`, and seed the live database with demo accounts, shelters, and alerts.

---

## Step 2: Push Repository to GitHub

In your terminal in `d:\SIH`:
```bash
# Create a new private or public repo on github.com (e.g. "sih26206-disaster-management")
git remote add origin https://github.com/<your-username>/<your-repo-name>.git
git branch -M main
git push -u origin main
```

---

## Step 3: Deploy Backend to Render (Free Web Service)

1. Go to [https://dashboard.render.com/](https://dashboard.render.com/) -> Click **New +** -> **Web Service**.
2. Select **Build and deploy from a Git repository** -> Connect your GitHub repo.
3. Configure settings:
   - **Name:** `sih26206-api`
   - **Root Directory:** `backend`
   - **Runtime:** `Node`
   - **Build Command:** `npm install && npx prisma generate`
   - **Start Command:** `node src/server.js`
   - **Plan:** Free
4. Add **Environment Variables** under the Environment tab:
   - `DATABASE_URL`: *(Your Neon PostgreSQL connection string from Step 1)*
   - `JWT_SECRET`: `sih26206-disaster-response-jwt-secret-key-2026`
   - `CORS_ORIGIN`: `*` *(or your Vercel URL)*
   - `OPENWEATHER_API_KEY`: `mock_mode_active` *(or real key)*
   - `PORT`: `5000`
5. Click **Deploy Web Service**.
6. Note your Render URL (e.g., `https://sih26206-api.onrender.com`).
   - Test health check: `https://sih26206-api.onrender.com/api/health`

---

## Step 4: Deploy Frontend to Vercel

1. Go to [https://vercel.com/new](https://vercel.com/new) -> Import your GitHub repository.
2. Configure project:
   - **Framework Preset:** Vite
   - **Root Directory:** `frontend` (Click Edit and select `frontend`)
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
3. Add **Environment Variable**:
   - `VITE_API_URL`: `https://sih26206-api.onrender.com` *(Your Render backend URL from Step 3 without trailing slash)*
4. Click **Deploy**.
5. Once deployed, Vercel gives you your production link:
   `https://sih26206-disaster-management.vercel.app`

---

## Step 5: Test Full Demo Flow on Live URL

Open the Vercel link in two browser tabs or on your phone + laptop:
1. Citizen logs in and triggers SOS with GPS location.
2. Volunteer in the second window sees the live pin pulse via WebSocket/WSS and clicks **ACCEPT DISPATCH**.
3. Admin triggers sensor simulation -> flood alert broadcasts in real time across both devices.

---

## Demo-Day Local Hub & RF Checklist

Complete this setup **the day before judging, not the morning of.** Router/OS settings, not code — but getting them wrong is exactly the kind of thing that silently shrinks your effective demo range and causes an on-stage stumble.

### 1. Hub Device Setup
- [ ] Confirm the backend binds to `0.0.0.0`, not `localhost` (already true per the codebase audit — just re-verify after any recent changes)
- [ ] Confirm the frontend's `resolveApiBaseUrl()` correctly resolves to the hub's LAN IP when accessed from a phone, not `localhost`
- [ ] Note the hub laptop's IP address **immediately before going on stage** — hotspot IPs can drift between sessions; don't rely on a number from yesterday's rehearsal

### 2. Wi-Fi Hotspot Radio Configuration (maximizes range, zero cost)
- [ ] **Lock to 2.4GHz, disable 5GHz** — 2.4GHz penetrates walls/obstacles further; 5GHz is faster but drops off quickly
- [ ] **Set channel width to 20MHz**, not the default 40/80MHz — concentrates signal energy, improving range at the fringes
- [ ] **Use an open (unencrypted) SSID** for the emergency network (e.g. `EMERGENCY_RESCUE_LAN`) — WPA2/WPA3 handshakes are more likely to fail at weak signal strength; an open network lets a phone associate and transmit small JSON packets even at very low signal
- [ ] Choose a memorable, unique SSID name so demo phones can find and join it quickly on stage without hunting through a list

### 3. Physical / Operational Setup
- [ ] Test actual range **in the venue** if possible before judging — venue walls, other exhibitors' wifi congestion, and metal furniture all affect real-world range differently than your rehearsal space
- [ ] If demonstrating the "roaming hub" concept (a second device physically walking into range), rehearse the walk distance and timing once, not zero times
- [ ] Have all demo phones **pre-join the emergency SSID** before going on stage, so there's no live network-selection fumbling during the pitch — the phones should already trust the network and reconnect automatically when in range

### 4. Fallback Plan
- [ ] Confirm the manual "Simulate Outage" toggle (`OfflineSimulationDrawer.jsx`) still works as a backup demo path, in case real airplane-mode/hotspot behavior is flaky on stage wifi-congested venue conditions
- [ ] Know in advance which beats of the demo script depend on real RF behavior versus the manual toggle, so if something doesn't cooperate live, you can smoothly fall back without breaking pacing

