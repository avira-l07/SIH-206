# SIH26206 gap upgrade — 10 October 2026

Find new workflows under **More → Planning and field tools** and security controls under **More → Account security**. Main dashboards retain task-first layouts. Earlier work is recorded in ROLE_AUDIT.md and WORKFLOW_UPGRADE.md.

The subsequent SOS/offline-map fixes and current verification results are recorded in [SOS_OFFLINE_UPGRADE.md](SOS_OFFLINE_UPGRADE.md).

| Previous gap | Added or corrected |
|---|---|
| Before/during/after innovation | Preparedness → response/resource/shelter/family coordination → recovery work; focused proposed pilot and evidence plan |
| Impact | Actual timing distributions/sample counts, citizen confirmations, labeled warning reviews and JSON export; baseline explicitly unmeasured |
| Field communication | Durable SMS/push jobs, receipts/provider acceptance, rejected-throttle retries, uncertain-send protection and signed inbound/status webhooks |
| Resource coordination | Incident-linked holds, owner acceptance/decline/release, double-booking prevention, 15-minute pending expiry, incident-close release |
| Shelter/family connection | Private named intake, atomic capacity/occupancy, replay protection, departures, consented suggestions, staff review, mistaken-match revocation and consent withdrawal |
| Recovery | Private damage/aid/task cases, assignment, conflicts, evidence/history, completion and operator reopening |
| Warning provenance | MANUAL/LIVE_WEATHER/DEMO sources, observation time, rule evidence, protected source labeling and no probability claims |
| Routing | Search expiring reviewed corridors; travel modes and specified recent flood obstruction exclusion; unavailable-route feedback and connector warnings |
| Preparedness/accessibility | English/Hindi checklist, offline account-specific saved plans/drafts, practice recording, native dialogs, responsive loading/error/retry forms |
| Account security | Encrypted TOTP and one-use recovery, production operator setup gate, session/socket revocation, password recovery/change, verified contacts, identity-reference review and district permissions |
| Abuse/operations | Shared DB rate buckets, overdue acknowledgment escalation, delivery/challenge retention, concurrent-read/load check and restore rehearsal |
| Complexity/performance | Secondary tools load on demand; landing page/QR scanner separate. Main bundle about 290 kB, citizen dashboard about 80 kB, previously about 538/456 kB |
| Presentation | Unsupported mandatory AI/IoT, fresh-photo guarantees, automatic identification, field-tested and Sybil-proof claims corrected |

## Connected roles

Citizen lists a resource; assigned approved volunteer requests it for an active incident; owner accepts in Bookings. Closure releases its bookings. Citizen reports damage/aid under Recovery; operator assigns work, volunteer completes it with evidence, citizen sees history. Staff record arrivals/consent, review family candidates, correct mistakes, withdraw consent and record departures. Audits cannot reduce occupancy below remaining named arrivals.

District responders see/modify only their district's records. A global coordinator reviews identity references and jurisdiction; changing district revokes sessions and is refused during active work. Legacy unknown district/ownership/history stays unknown, rather than receiving inferred values.

## Configuration and external work

Development setup backs up SQLite before additive changes. Production requires reviewed migrations; startup never seeds/pushes schemas.

Use a stable MFA_ENCRYPTION_KEY (32 random bytes, base64) in production. Development generates ignored backend/.mfa-key. Preserve this key separately with backups; its loss/change prevents decrypting authenticator secrets and delivery recipients. Never expose it as a frontend variable. Production operators enroll their own authenticator. Reset requires a verified email, one-use expiring emailed token and MFA when enabled.

Email needs RESEND_API_KEY/EMAIL_FROM. SMS needs TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_NUMBER. TWILIO_WEBHOOK_BASE_URL must be the exact externally visible HTTPS origin; configure inbound /api/delivery/twilio/inbound and retain signed callbacks. Set DISABLE_EXTERNAL_DELIVERY=false only in the intended environment. Public phones must verify a code before real broadcast eligibility. Old unverified records are preserved and excluded from real SMS. Push needs stable VAPID keys/subject and browser consent.

ACCEPTED is provider acceptance, not device receipt. Interrupted/ambiguous sends become UNKNOWN and are not blindly resent. Only explicitly rejected throttled sends retry automatically; FAILED/UNCONFIGURED can be retried after checking providers. Terminal recipient payloads expire after 30 days; expired challenges are pruned after seven days.

Real weather requires OPENWEATHER_API_KEY. Fallback/custom readings remain DEMO with no real delivery. Official feeds and physical sensor/radio hardware are not integrated. Staff must supply/review corridor geometry; no corridor produces no route, and neither incomplete crowd data nor an app suggestion proves route safety.

Authority partnerships, an official submission rubric, measured baseline, independent warning validation and real field/device/provider tests need external evidence. Use PILOT_PLAN.md. Production still needs reviewed privacy/photo/intake identity/retention procedures, TLS, proxy configuration and infrastructure capacity. This update is not a complete compliance or penetration-testing certification.

## Verification evidence

Backend tests use a disposable DB/server with external delivery disabled. They cover existing role/security flows plus booking races, capacity/idempotent intake, matching/correction/consent/departure, recovery ownership/conflicts, private plans, district HTTP/socket/offline restrictions, RFC6238 vectors, TOTP replay/recovery, session revocation, bounded one-use challenges, shared quotas, signed receipts, worker claims and escalation. Frontend tests cover queue failures/account isolation, refresh/navigation and offline plans. Browser review uses synthetic records.

local-load-check.json records actual controlled 60-concurrent-read local SQLite timings/failures, not field or production capacity. A contention failure was fixed by coalescing overlapping reads for the exact authorization scope, with no completed-result TTL cache.

Run node backend/scripts/restore-rehearsal.js <backup-path> to restore to a disposable copy, check integrity/every row hash and leave live DB untouched. Route inventory checks literal URLs against mounted routes; dynamic forms are exercised separately through integration/browser checks.

Security references: [OWASP MFA](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html), [OWASP recovery](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), [RFC6238](https://www.rfc-editor.org/rfc/rfc6238), [Twilio signatures](https://www.twilio.com/docs/usage/security), [Resend API](https://resend.com/docs/api-reference/emails/send-email).

### Final local results

- 48 backend tests and 13 frontend tests passed; frontend lint and production build passed.
- Route inventory: 126 mounted method/path combinations, 88 literal frontend API calls, zero unmatched calls.
- Both production-dependency audits reported zero known advisories at verification time; this is a package advisory check, not proof of complete application security.
- Additive SQLite upgrade increased tables from 17 to 29. Hashes of every original row/column matched after migration. The preserved pre-upgrade backup passed integrity and restoration checks for all 102 original records across 17 tables; the rehearsal did not modify the live database.
- Browser checks on disposable records connected citizen recovery reporting, operator assignment, volunteer evidence/completion and citizen history; incident resource request/owner acceptance; consented shelter intake/manual family match; unavailable and reviewed route/map states; operator impact and delivery panels.
- Mobile layouts checked at 390 and 320 pixels. Dialog closing returns keyboard focus to More; successful sign-in clears old sign-out notices. Competing dispatch/withdrawal returns a consistent conflict response. Resource bookings remain visible and releasable by the replacement assigned responder.

Screenshots contain synthetic preview data: [Citizen recovery](gap-citizen-recovery.png), [mobile recovery](gap-mobile-recovery.png), [route assessment](gap-route-guidance.png). Live records were not used for browser testing.
