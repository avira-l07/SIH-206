# design.md - Visual & UX Direction

## 1. Design Brief
This is an emergency-response tool used in stressful, time-critical moments - by citizens in danger, volunteers coordinating in the field, and officials scanning for situational awareness. The design must read as **calm, clear, and trustworthy under pressure**, not like a generic SaaS dashboard. **Clarity beats decoration everywhere.**

---

## 2. Token System

### Color (Functional, not decorative - communicates urgency level)
- `--ink`: `#14231F` - near-black green, primary text (avoid pure black)
- `--paper`: `#F6F4EF` - warm off-white background, easy on eyes for long monitoring sessions
- `--safe`: `#2E6E4E` - deep green, "resolved / safe / shelter available"
- `--watch`: `#C97A2B` - amber/ochre, "watch / moderate risk"
- `--critical`: `#B23A2E` - brick red, "critical / active SOS" - used sparingly, only for real alerts
- `--line`: `#D8D3C7` - hairline borders/dividers
- `--card`: `#FFFFFF` - clean stark card backing
- `--surface`: `#EFECE4` - subtle panel contrast
- `--unverified`: `#9A968C` - neutral grey, reserved specifically for unverified/grey-tier crowdsourced reports (distinct from the ink/line greys so it reads as "status," not just muted text)

### Typography
- **Headings:** Space Grotesk or IBM Plex Sans (condensed, technical, legible at small sizes - fits a monitoring-tool feel)
- **Body/data:** IBM Plex Sans or Inter - one family, varying weight, calm rather than decorative
- **Numbers (counts, coordinates, timestamps):** tabular figures, slightly smaller, muted color - this is a data tool, not a magazine

### Layout
- **Left-aligned throughout:** working tool, not a marketing page; centered text slows scanning in a crisis.
- **Map-first layout:** map occupies 60-65% of the dashboard, alerts/SOS list docked to side panel.
- **Status communicated by color + icon + text label together:** never color alone (accessibility for colorblind first responders).

---

## 3. Principles Specific to This Product
1. **Severity is the only thing allowed to be loud.** Everything else stays quiet (muted borders, no shadows, no gradients) so that a red "critical" marker actually stands out when it matters.
2. **No countdown/urgency gimmicks for their own sake.** Real emergencies don't need fake hype - avoid pulsing animations except on genuinely live/active items.
3. **One clear action per screen.** Citizen dashboard's main job is "raise SOS" or "see alert" - don't compete with secondary features visually.
4. **Numbers over icons where precision matters.** "3 shelters, 42 people sheltered" beats a vague icon - responders need facts fast.
5. **Avoid startup-dashboard clichés:** no soft rounded SaaS cards with drop shadows on everything, no purple/blue gradient washes, no all-caps tracked-out labels.

---

## 4. New Component Patterns (for the trust/audit/triage features)

**Confidence-tier badge & map markers** (for hazard reports - Sprint 2 update)
- Grey (`--unverified`) dot + label "Unconfirmed" — flat, no border, deliberately unremarkable so it doesn't compete visually with real alerts.
- Amber (`--watch`) dot + label "1 confirmation" — same weight as existing watch-severity styling, no new pattern needed.
- Red (`--critical`) dot + label "Verified (3+)" — same weight as existing critical styling.
- **Disputed (`--unverified` + hatched/striped pattern):** diagonal 45deg repeating stripes over `#9A968C` with `✕` icon and dashed border. Never introduces an unharmonized new color; stays visible on map so live debunking of false reports is demonstrable during crisis evaluation.
- **Resolved (muted `#6B7F76`):** faded/muted pin with `✓` icon, kept visible in active view so problem-solving progress is legible to both citizens and commanders.
- Never show a confidence tier as a percentage or progress bar — a discrete tier reads faster under stress than a number you have to interpret.

**Structured Water-Depth Benchmarks & Route Obstruction**
- Standardized depth benchmarks: `ANKLE` (passable on foot/cars), `KNEE` (high clearance only), `WAIST` (route blocked, boat needed), `SUBMERGED` (ceiling/roof level, life threat).
- High water levels (`WAIST` and `SUBMERGED`) render a high-visibility dashed red/amber route obstruction perimeter ring (150m-250m) on the map alerting navigation and dispatchers that the route is impassable.

**Shelter capacity text relabeling**
- Low occupancy (<70%): "Open floor space" (replaces generic "Adequate Space")
- Moderate/High (70-89%): "Packed – seating only" (replaces vague "Nearing Limit")
- Critical (>=90%): "Full – divert arrivals" (replaces passive "At Capacity")

**Shelter readiness gauge**
- Reuse the existing `--safe`/`--watch`/`--critical` tokens directly — this is literally the same severity system applied to a different subject, so no new color language is needed.
- Show as a compact horizontal bar with the 5 audited items (beds/water/rations/restrooms/power) as small labeled ticks, not a single blended score — responders need to know *which* resource failed, not just that something did.

**Vulnerability tag chip** (on SOS cards)
- Small outlined chip, text-only label ("Dialysis patient," "Infant," "Elderly"), ink-colored border — deliberately not red/alarming on its own, since the *position* in the triage queue (pinned to top) carries the urgency, not the chip color. Reserve `--critical` for the SOS status itself.

**Triage Kanban board**
- Four columns (Reported → Verified → Dispatched → Rescued) using `--surface` column backgrounds and `--card` for individual request cards — consistent with the existing flat, non-shadowed card style elsewhere in the product.
- Urgent (vulnerability-tagged) cards get a left-edge accent bar in `--critical`, not a full-card highlight — keeps the "severity is the only loud thing" principle intact even on a busier screen.

**"I Have / I Can" civilian asset pins** (stretch feature)
- Distinct icon shape (not a dot) so responders never confuse a civilian-asset pin with a hazard or SOS pin at a glance — use a simple outlined shape in `--ink`, not a status color, since availability isn't a severity signal.

---

## 5. Writing & Copy Voice
- Plain, direct, active voice: "Send SOS" not "Submit request." "Shelter full" not "Capacity exceeded."
- No filler, no apology in error states: "Location unavailable - enable GPS to send SOS" not "Oops, something went wrong!"
- Empty states give direction: "No active alerts in your area" (calm, informative) rather than a blank panel.
- New copy for verification states: "Unconfirmed report - awaiting nearby confirmation" rather than anything that sounds like an accusation of the reporter ("Unverified" alone can read as distrustful; pair it with a next-step framing).

---

## 6. Accessibility Floor
- Color contrast AA minimum, especially for alert-severity colors and the new `--unverified` grey on the paper background.
- Status never conveyed by color alone - pair with text/icon (this applies to confidence tiers and shelter readiness ticks too, not just alerts).
- Keyboard-navigable SOS button (critical for stress situations, motor-impaired users).
- Responsive down to a single mobile column (map on top, alerts/actions below); Kanban board collapses to a single-column, filterable list on mobile rather than horizontal scroll.
