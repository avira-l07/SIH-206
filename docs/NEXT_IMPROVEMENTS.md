# Next improvements

Reviewed on 10 October 2026. The first implementation batch now delivers citizen request history, transactional rescue timelines, volunteer duty/workload/location freshness, a persistent activity inbox, citizen withdrawal/profile editing, and assignment acknowledgment/replacement/reassignment. See [workflow upgrade](WORKFLOW_UPGRADE.md) for scope and verification. The table below preserves the original recommendations; remaining work is identified here.

## Recommended build and remaining work

Complete the handoffs between citizens, volunteers and operators while keeping the new dashboards simple. Add optional request detail views and shared workflow records, rather than expanding the default dashboards.

| Order | Improvement | Original gap | Completion check |
|---|---|---|---|
| 1 | Citizen request history and detail view | `CitizenDashboard` uses `.find()` to show one active SOS and one pending confirmation. There is no navigable list of all the citizen's requests. | Two active requests remain independently visible and actionable; cancelled and completed requests can be reviewed; each account sees only its own records. |
| 2 | Shared rescue timeline | `SOSRequest` stores current state and timestamps, without a dedicated lifecycle event model. Earlier transition times and responsible actors cannot be reconstructed reliably. | Each successful verification, assignment, stage change, cancellation and citizen confirmation appends an authorized event in the same transaction. All three roles see permitted details; retries do not duplicate events. |
| 3 | Volunteer availability and better operator dispatch | The operator selector lists approved volunteer names. `User` has no on-duty availability or location update timestamp, and the selector does not show workload. | Operator sees on-duty responders, active assignments and location freshness. Assignment remains manual, with an acknowledgment deadline, escalation/reassignment rules and atomic ownership checks. Stale GPS never produces a confident nearest-responder claim. |
| 4 | Persistent activity inbox | Live socket events refresh views but do not form a durable unread activity history. Many workflows still use blocking browser alerts. | Assignment, rescue progress, restock and alert messages remain available after reload/reconnect. In-app notices are readable and acknowledgeable. Actual SMS/push delivery is shown only when provider evidence supports it. |
| 5 | Community resource reservation and release | Assets have an availability boolean and nearby suggestions, without a booking/dispatch contract. | Approved responders request an asset, owner accepts, and it becomes reserved for one incident. Concurrent reservations cannot succeed; cancellation/completion releases it; contact details remain access-controlled. |
| 6 | Shelter intake and missing-person reconciliation | The bulletin supports search/status changes; intake records and automated report-to-intake suggestions are missing. | Authorized staff record arrivals/departures and review explainable possible matches. Matches require human confirmation; contact details, consent, correction and deletion have defined access rules. |

## Finish the reliability and usability foundation

- Replace blocking `alert()` feedback with inline errors or accessible notices. Give dialogs names, initial focus, keyboard containment, Escape behavior and focus restoration. Test with keyboard and a screen reader, following [W3C's modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).
- Add clear profile/settings flows, Hindi/English labels, readable field labels, and map selection for incident coordinates with manual numeric entry retained. Do not describe saved coordinates as a fresh GPS fix.
- Reduce the entry bundle, load scanners and advanced views on demand, and test the production service worker on real Android/iOS devices. Cover cold offline start, interrupted submission, restored connectivity, account change, app update and missing map tiles. [Service worker guidance](https://web.dev/learn/pwa/service-workers) explains the distinction between app-shell caching and ordinary network access.
- Add browser regressions for the three-role lifecycle, permission changes, wrong-role direct URLs, simultaneous claims and mobile navigation. Keep the existing API/concurrency regressions; literal route matching alone does not exercise every button or branch.
- Add pagination, image/storage limits and retention, structured diagnostics, backup restoration checks and load/reconnect tests before a larger pilot. Show last-known data freshness explicitly.

## Before production use

Add operator MFA, identity/phone verification, password recovery and server-side session revocation. The current logout clears local browser storage; it does not invalidate a copied JWT on the server. Review token storage and remaining diagnostic paths. The full Axios error log in `AuthContext` has been removed; session verification diagnostics now contain only a status or network-unavailable label. Follow [OWASP session management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) and [MFA guidance](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html).

Real SMS inbound/outbound providers, push receipt handling, supervised QR redemption, deployment migrations, exact origins, HTTPS/WSS, persistent secrets and data retention remain unverified production requirements. Provider setup and identity decisions need separate concrete implementation and validation.

## Correct the completion claims

`docs/phases.md` has been corrected to distinguish the implemented missing-person bulletin from pending shelter intake and automatic roster matching. The current schema/routes and [second audit](SECOND_AUDIT.md) do not support those claims. Reconcile the roadmap, pitch and demo script with implemented behavior. Keep weather/risk, SMS relay and map-overlay demonstrations explicitly labelled; there is no verified trained model, real radio mesh or automated safe-route engine in this implementation.

Items 1, 2 and 4 are delivered for the supported rescue/alert/restock flows. Item 3 delivers duty, active workload, location freshness and atomic assignment checks; acknowledgment deadlines, operator attention and safe manual reassignment are now delivered. Scheduled automatic escalation remains future work. See [individual role audit](ROLE_AUDIT.md). Additional accessibility and device testing remain. Before a public pilot, prioritize session security, delivery validation and device/offline testing. Resource reservation and shelter intake are subsequent functional extensions.
