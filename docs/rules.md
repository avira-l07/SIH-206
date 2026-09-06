# rules.md — What to Use, What to Avoid

## ✅ Use This

**Frontend**
- React (Vite) — fast setup, huge ecosystem
- Tailwind CSS — quick, clean styling without writing custom CSS
- Leaflet.js + OpenStreetMap tiles — free maps, no billing/API key needed
- Axios or fetch — API calls
- Socket.io-client — live updates (SOS pins, new alerts, confidence-tier changes)
  - Use its built-in reconnection events to show a small "Reconnecting..." indicator — protects the live-demo experience on flaky venue wifi
- Plain haversine distance formula (JS, ~10 lines) — for "nearest shelter" sorting and "nearby confirmer" radius checks; no PostGIS needed at this data scale
- Native browser camera capture (`<input capture="environment">` or `getUserMedia`) for hazard-report photos — blocks gallery upload with zero extra libraries, which is your anti-misinformation design choice
- Base64 photo storage directly on the hazard report record — deliberate hackathon scope decision that avoids external S3/Cloudinary infrastructure dependencies during presentation

**Backend**
- Node.js + Express — fastest to get REST APIs running
- JWT for auth — simple, stateless, well-documented
- bcrypt for password hashing
- Socket.io (server) — real-time push to dashboards
- dotenv — manage API keys/secrets
- Count-based confidence scoring (plain SQL count + a threshold check) — this is your "verification AI," and it's honest to describe it as rule-based rather than ML in front of judges

**Database**
- PostgreSQL (via Supabase or Neon free tier) — relational, handles lat/lng fine with plain columns
- Prisma or Sequelize ORM — avoids writing raw SQL under time pressure
- A `unique(hazard_report_id, confirming_user_id)` constraint on the confirmations table — cheap way to stop one user inflating a confidence tier alone

**External APIs**
- OpenWeatherMap (free tier) — real weather-based alert triggers
- OpenStreetMap Nominatim — free geocoding (address → lat/lng)

**Deployment (for demo link)**
- Vercel — frontend hosting, one-command deploy
- Render or Railway — backend hosting, free tier
- Supabase/Neon — managed Postgres, free tier

## ❌ Avoid This (for MVP / hackathon timeframe)

- **Docker/Kubernetes** — adds setup overhead with no visible demo value
- **MQTT / real IoT sensor integration** — you have no physical sensors; mock this data instead
- **Full computer-vision/ML pipeline** — training real models eats days; use a simple rule-based "risk score" (e.g., rainfall > X mm → High flood risk) and call it AI-assisted for the demo, or use a pretrained scikit-learn model on a small dataset if there's time
- **Facial recognition for missing-persons matching** — accuracy on low-quality field photos is genuinely hard to get right in a hackathon window, and it raises biometric-privacy questions you don't want to field live. Build simple text/attribute matching (name, age, description, last-seen location) instead, and mention facial matching only as a labeled future-work item
- **Real Bluetooth/Wi-Fi Direct mesh networking or a live SMS/telecom gateway** — simulate this at the application layer instead (an in-browser "simulate offline" toggle + a typed SMS-syntax parser); building the real radio/telecom layer is an infra project on its own, not a hackathon feature
- **Multi-dialect voice-to-text NLP** — if you attempt voice input at all, scope it to one language/dialect as a proof of concept; don't promise multi-dialect coverage you can't demo
- **Native mobile apps (Flutter/React Native)** — the brief only requires a laptop web app; building two frontends doubles your work for no extra demo credit
- **MongoDB + PostgreSQL both** — pick one DB (PostgreSQL) to avoid data-sync complexity
- **Payment gateway integration** — irrelevant to disaster response, don't build it
- **Multi-cloud (AWS+Firebase+GCP)** — pick ONE hosting path; multi-cloud is a production concern, not a hackathon one
- **Over-engineering auth** (OAuth, SSO, 2FA) — simple email/password + JWT is enough
- **Building admin analytics/BI dashboards** — a live map + list/Kanban view is enough to demonstrate "situation awareness"

## General Principles
- Build the **thinnest working slice first** (login → dashboard → SOS → map pin), then layer features.
- Every feature should be demoable in under 60 seconds.
- Prefer mocked/seeded data over waiting on real integrations that could fail live during judging — this applies doubly to the verification feature: seed your "nearby confirmer" accounts ahead of time rather than hoping real users trigger it live.
- Keep secrets (API keys) in `.env`, never hard-coded or committed.
- **Deploy early, not on the last day.** Get a bare-bones version live (even just auth) right after Phase 1 — CORS, env vars, and WebSocket-over-HTTPS issues are far cheaper to fix when the app is simple than when it's feature-complete.
- **Check the actual SIH evaluation rubric** before finalizing scope — confirm what "AI/IoT-powered" needs to satisfy, even if the demo mocks sensor data. Judges may ask how it would extend to real hardware.
- **Be upfront about scope, not silent about it.** For every feature you deliberately deferred (facial recognition, real mesh networking, multi-dialect NLP), have one sentence ready explaining why it was cut and how the current architecture would support it later — this reads as engineering judgment, not as a gap.
