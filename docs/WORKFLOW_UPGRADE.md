# Workflow upgrade — 10 October 2026

## Delivered

- Citizen **My requests** keeps every owned help request accessible. All/active/completed filters, request-specific safety confirmation and optional timelines keep the default dashboard small. The compact tracker and confirmation banner are hidden while the full history is open.
- Shared rescue events record creation, verification, assignment, progress, triage, cancellation, reopening and citizen confirmation with actor and time. Online, queued and SMS reports use the same event contract. Events and recipient inbox entries commit in the same transaction as the rescue change. Failed transitions and idempotent replay do not add history.
- Approved volunteers can start or end their shift. Both simple dispatch and the optional triage board show approved responder duty, active assignment count and whether the last location update is within 15 minutes. Explicitly off-duty volunteers cannot receive or claim new assignments; their current rescues remain actionable. Existing accounts have **availability not set**, rather than an invented on-duty value. Manual assignment remains available for these legacy accounts.
- The persistent activity inbox contains rescue updates for the citizen/assigned responder/operators, public advisories for registered accounts, and restock notices for approved responders. Records have a cursor, unread count, individual acknowledgment and mark-all-read. Source alert/restock changes and notices commit together. Reload/reconnect refreshes the inbox; socket hints contain no private message content. Revoked approval removes access to responder-only history.
- The inbox uses a native modal dialog with focus containment, Escape dismissal and focus restoration. Frontend session verification no longer logs a full Axios request/error. Unknown report coordinate accuracy is displayed honestly in the triage board.

## Verification

- Backend: **28 passing tests**, including timeline ownership, concurrent dispatch, off-duty rejection, current workload/location freshness, inbox pagination and ownership, revoked approval, offline replay, and forced event/notification insertion failures proving source rollback.
- Frontend: **10 passing tests**, clean lint and successful production build. The existing approximately 535 KB entry-bundle warning remains.
- Route inventory: **83 mounted method/path pairs**, **80 literal frontend API calls**, **0 unmatched calls**. Variable-built paths are also exercised by the API lifecycle tests and browser workflow.
- Browser: disposable citizen, volunteer and operator accounts on separate origins; two citizen requests, verification, dispatch, live workload changes, off-duty exclusion, every rescue stage, citizen confirmation, history filters, inbox acknowledgment/reload persistence and Escape focus restoration. Citizen history/inbox checked at 390 and 320 CSS pixels; operator dispatch checked at 390 pixels, with no horizontal overflow. No browser console errors during the three-role workflow.
- Development database: additive schema applied after backup at backend/backups/before-schema-1791575785597.db. Hash comparisons verified every original row and column unchanged across all 15 existing tables. No reset or demo seed was run against this database. The normal API and console respond on ports 5000 and 5177.

Screenshots: [citizen history](workflow-history-ui.png), [operator dispatch](workflow-dispatch-ui.png), [activity inbox](workflow-inbox-ui.png), [phone inbox](workflow-mobile-ui.png).

## Boundaries and remaining work

Historical transition times cannot be reconstructed: older requests explicitly say their earlier timeline is unavailable. Older alert/restock records are not fabricated into notifications; recording begins with this upgrade. This inbox records application activity and does not claim SMS/push delivery receipts.

The subsequent [individual role audit](ROLE_AUDIT.md) delivers acknowledgment deadlines, replacement requests and manual reassignment, profile editing and citizen withdrawal, with 33 backend and 12 frontend passing tests. Scheduled escalation, asset reservation/release, shelter intake and automatic missing-person matching remain future extensions. Production MFA/session revocation, real delivery providers, physical-device/offline testing, retention and scale testing remain outstanding. The local development schema setup is not a reviewed production migration.
