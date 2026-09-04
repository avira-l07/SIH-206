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

## 4. Writing & Copy Voice
- Plain, direct, active voice: "Send SOS" not "Submit request." "Shelter full" not "Capacity exceeded."
- No filler, no apology in error states: "Location unavailable - enable GPS to send SOS" not "Oops, something went wrong!"
- Empty states give direction: "No active alerts in your area" (calm, informative) rather than a blank panel.

---

## 5. Accessibility Floor
- Color contrast AA minimum, especially for alert-severity colors on the paper background.
- Status never conveyed by color alone - pair with text/icon.
- Keyboard-navigable SOS button (critical for stress situations, motor-impaired users).
- Responsive down to a single mobile column (map on top, alerts/actions below).
