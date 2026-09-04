# PRD - SIH26206: AI/IoT-Powered Disaster Management Platform

## 1. What to Build
A web application that centralizes disaster preparedness and response for citizens, rescue teams, and government agencies. Core idea: one dashboard that collects data (weather/GIS/crowdsourced/sensor), predicts risk, alerts people in real time, and coordinates resources during a disaster.

**Problem it solves:**
- Delayed alerts and communication during disasters
- Lack of real-time data & situation awareness
- Poor coordination among agencies & volunteers
- Limited public awareness and preparedness

**Scope for the working prototype (laptop-buildable):**
- Web app only (skip native mobile app - Flutter/React Native - for MVP)
- Simulated/mocked sensor & IoT data (no real drones/hardware needed)
- One real free data source (weather API) + mocked GIS/hazard data
- Focus on 3 hazard types max for demo: `FLOOD`, `EARTHQUAKE`, `FIRE`

---

## 2. Target Users

| User | Need |
|---|---|
| **Citizen** | Get real-time alerts, find shelters, request SOS help |
| **Volunteer / Rescue Team** | See live incidents, coordinate response, update status |
| **Government / NDMA Agency** | Monitor dashboard, manage resources, send official alerts |

---

## 3. Core Features (MVP-prioritized)

### Must-have (Demo-critical)
1. **Live Situation Dashboard** - map view with active alerts/incidents
2. **Real-time Disaster Alerts** - push/banner alerts by region & hazard type
3. **SOS / Emergency Request** - citizen submits location + help needed
4. **Shelter Finder** - list/map of nearby shelters with capacity
5. **Role-based login** - Citizen / Volunteer / Admin

### Should-have
6. **Hazard Mapping & basic risk prediction** (rule-based, not full ML for MVP)
7. **Resource & Volunteer management** (assign SOS to nearest volunteer)
8. **Multi-channel alert simulation** (in-app + email; SMS optional/mocked)

### Nice-to-have (stretch, only if time permits)
9. Crowdsourced incident reporting with photo upload
10. Basic ML/AI risk score using historical + weather data
11. Offline alert simulation (SMS/IVR - mock only)

---

## 4. Success Criteria for Demo
- A citizen can register, see an alert, and raise an SOS in under 1 minute
- An admin can see the SOS appear live on the dashboard map
- A volunteer can accept an SOS and mark it resolved
- Weather-based alert auto-generates for a selected region (from real API / simulator)

---

## 5. Out of Scope for MVP
- Real drone/satellite integration
- Production-grade IoT sensor network
- Full multi-language, multi-region compliance
- Payment gateway (not needed for disaster response)
