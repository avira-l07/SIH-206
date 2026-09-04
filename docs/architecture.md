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
       └──► Rule-based Risk Engine (simple logic)
```

**User flow example (SOS):**
1. Citizen logs in -> sees dashboard map.
2. Citizen taps "SOS" -> shares location + message.
3. Backend saves SOS, broadcasts via WebSocket.
4. Admin/Volunteer dashboard updates in real time, shows pin on map.
5. Volunteer accepts -> status changes to "In Progress" -> "Resolved".

---

## 2. Recommended Tech Stack (laptop-friendly, free-tier)

| Layer | Simplified MVP Stack (Recommended) |
|---|---|
| **Frontend** | React (Vite) + Tailwind CSS |
| **Backend** | Node.js + Express (fastest to prototype) |
| **Database** | PostgreSQL / SQLite via Prisma (plain lat/lng columns) |
| **Real-time** | Socket.io |
| **AI/Risk** | Simple if/else risk rules |
| **Maps** | Leaflet.js + OpenStreetMap (free, no API key needed) |
| **Weather** | OpenWeatherMap free API + mock fallback |
| **Auth** | JWT + bcrypt |
| **Hosting** | Vercel (frontend) + Render/Railway (backend) + Neon/Supabase (Postgres) |

---

## 3. Data Model (Core Tables)

- **users**: `id`, `name`, `email`, `password_hash`, `role` (citizen/volunteer/admin), `phone`, `lat`, `lng`, `created_at`
- **alerts**: `id`, `hazard_type`, `severity`, `region`, `lat`, `lng`, `message`, `active`, `created_at`
- **sos_requests**: `id`, `user_id`, `user_name`, `user_phone`, `lat`, `lng`, `message`, `hazard_type`, `status` (pending/in_progress/resolved), `assigned_volunteer_id`, `created_at`
- **shelters**: `id`, `name`, `address`, `lat`, `lng`, `capacity`, `current_occupancy`, `contact`, `active`
