# rules.md — What to Use, What to Avoid

## ✅ Use This

**Frontend**
- React (Vite) — fast setup, huge ecosystem[cite: 1]
- Tailwind CSS — quick, clean styling without writing custom CSS[cite: 1]
- Leaflet.js + OpenStreetMap tiles — free maps, no billing/API key needed[cite: 1]
- Axios or fetch — API calls[cite: 1]
- Socket.io-client — live updates (SOS pins, new alerts)[cite: 1]
  - Use its built-in reconnection events to show a small "Reconnecting..." indicator — protects the live-demo experience on flaky venue wifi[cite: 1]
- Plain haversine distance formula (JS, ~10 lines) — for "nearest shelter" sorting; no PostGIS needed at this data scale[cite: 1]

**Backend**
- Node.js + Express — fastest to get REST APIs running[cite: 1]
- JWT for auth — simple, stateless, well-documented[cite: 1]
- bcrypt for password hashing[cite: 1]
- Socket.io (server) — real-time push to dashboards[cite: 1]
- dotenv — manage API keys/secrets[cite: 1]

**Database**
- PostgreSQL (via Supabase or Neon free tier) — relational, handles lat/lng fine with plain columns[cite: 1]
- Prisma or Sequelize ORM — avoids writing raw SQL under time pressure[cite: 1]

**External APIs**
- OpenWeatherMap (free tier) — real weather-based alert triggers[cite: 1]
- OpenStreetMap Nominatim — free geocoding (address → lat/lng)[cite: 1]

**Deployment (for demo link)**
- Vercel — frontend hosting, one-command deploy[cite: 1]
- Render or Railway — backend hosting, free tier[cite: 1]
- Supabase/Neon — managed Postgres, free tier[cite: 1]

## ❌ Avoid This (for MVP / hackathon timeframe)

- **Docker/Kubernetes** — adds setup overhead with no visible demo value[cite: 1]
- **MQTT / real IoT sensor integration** — you have no physical sensors; mock this data instead[cite: 1]
- **Full computer-vision/ML pipeline** — training real models eats days; use a simple rule-based "risk score" (e.g., rainfall > X mm → High flood risk) and call it AI-assisted for the demo, or use a pretrained scikit-learn model on a small dataset if there's time[cite: 1]
- **Native mobile apps (Flutter/React Native)** — the brief only requires a laptop web app; building two frontends doubles your work for no extra demo credit[cite: 1]
- **MongoDB + PostgreSQL both** — pick one DB (PostgreSQL) to avoid data-sync complexity[cite: 1]
- **Payment gateway integration** — irrelevant to disaster response, don't build it[cite: 1]
- **Multi-cloud (AWS+Firebase+GCP)** — pick ONE hosting path; multi-cloud is a production concern, not a hackathon one[cite: 1]
- **Over-engineering auth** (OAuth, SSO, 2FA) — simple email/password + JWT is enough[cite: 1]
- **Building admin analytics/BI dashboards** — a live map + list view is enough to demonstrate "situation awareness"[cite: 1]

## General Principles
- Build the **thinnest working slice first** (login → dashboard → SOS → map pin), then layer features.[cite: 1]
- Every feature should be demoable in under 60 seconds.[cite: 1]
- Prefer mocked/seeded data over waiting on real integrations that could fail live during judging.[cite: 1]
- Keep secrets (API keys) in `.env`, never hard-coded or committed.[cite: 1]
- **Deploy early, not on the last day.** Get a bare-bones version live (even just auth) right after Phase 1 — CORS, env vars, and WebSocket-over-HTTPS issues are far cheaper to fix when the app is simple than when it's feature-complete.[cite: 1]
- **Check the actual SIH evaluation rubric** before finalizing scope — confirm what "AI/IoT-powered" needs to satisfy, even if the demo mocks sensor data. Judges may ask how it would extend to real hardware.[cite: 1]