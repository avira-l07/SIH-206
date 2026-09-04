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
