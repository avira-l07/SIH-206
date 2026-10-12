# Individual role audit — 10 October 2026

This review follows each citizen, volunteer and operator workflow through the UI, API, authorization, database changes, timeline, notifications and live refresh. It extends the earlier project and workflow audits. It does not certify that the entire system is production ready.

## Citizen

| Gap found | Fix |
|---|---|
| No way to withdraw an accidental or duplicate request | Owners can withdraw an unassigned pending/verified request, with a required reason. Dispatched requests cannot be withdrawn. A withdrawal racing with dispatch has one winner. |
| Contact details could not be edited | My account edits name, contact phone and district. Email, identity, role and approval cannot be changed through this endpoint. Future help reports use the updated details. |
| Responder identity and replacement history were unclear | Owned requests show the assigned responder's name. Timelines include acknowledgment, replacement requests, reassignment and reasons. |
| GPS, safety-confirmation and pickup failures were difficult to interpret | Location updates show progress/success/errors; confirmation prevents duplicate submissions; pickup history has an independent error/retry state. |
| One failed fetch prevented unrelated dashboard sections from refreshing | Successful sections update independently, failed sections retain previously loaded data with a visible notice. Older fetch responses cannot replace newer live state. |

Existing owned history filters, citizen safety confirmation, shelter search, supply views, hazard reports and shared resource/missing-person entry points remain accessible. A dispatched request needs responder/operator handling; withdrawal does not silently remove work already underway.

## Volunteer

| Gap found | Fix |
|---|---|
| Operator assignments had no explicit acknowledgment | Assigned responders can acknowledge. Advancing a rescue also acknowledges it for compatibility with map/advanced controls. Repeated acknowledgment does not create duplicate events. |
| No way to ask the operator for a replacement | A responder submits a reason and remains assigned until the operator selects a replacement. Duplicate pending requests are rejected. |
| Alert Focus Map changed coordinates while the map stayed hidden | Focus Map now opens the map section. |
| Map accept-call button could remain usable while off duty | Map and list controls respect duty; the API rechecks approval and duty inside assignment transactions. Existing assignments remain actionable. |
| Dashboard data could become stale or partially disappear | Reconnect, visibility, online recovery, queue completion, live hints and periodic refresh reconcile data with stale-response guards and independent section failures. |

Current assignee ownership controls acknowledgment, replacement, triage and rescue progress. A replaced responder immediately loses update permission. Trust revocation is checked against current database state, including inside rescue mutation transactions.

## Operator

| Gap found | Fix |
|---|---|
| Active incidents could not be reassigned safely | Reassignment requires a different eligible responder, reason and expected current assignee. The transaction preserves the current rescue stage, resets acknowledgment, clears the pending replacement and notifies both responders, the citizen and operators. Stale/conflicting changes return 409. |
| No attention queue for assignments that need follow-up | Needs attention includes pending dispatch, requested replacements and overdue acknowledgments. More statistics reports replacement and overdue counts from current records. |
| Volunteer approval view lacked operational context | Team filters, loading/error/empty states, duty, workload and location freshness are shown. Revocation warns about active assignments; operators must reassign them explicitly. |
| Finding a request required scanning cards | Search by citizen name, request number or message; clear feedback for no matches. |
| Triage assignment forms opened the map when clicked | Assignment controls stop card-click propagation, keeping forms visible and usable. |
| Alert forms started with a fabricated critical example and errors were hidden behind the modal | General advisory/watch defaults, empty message/region, saved or blank coordinates, labeled controls and inline errors. The native dialog contains focus, supports Escape and restores focus. Recipient counts are not presented as delivery receipts. |

Operator assignment creates a **10-minute acknowledgment deadline**, an application default rather than a verified SIH requirement. Legacy assignments keep unknown acknowledgment/deadline fields. Overdue highlighting and reassignment are available; there is no scheduled background escalation or automatic reassignment.

## Shared security and data

- New profile and SOS endpoints enforce authentication, role, ownership, input limits and permitted lifecycle states. Profile mass assignment is rejected. Cancellation after evacuation/medical handover is rejected by the API, matching the UI.
- Rescue changes, events and recipient notifications commit together. Tests force notification failure to prove rollback. Concurrent dispatch/withdrawal and stale reassignment cannot overwrite another successful change.
- Read/write rate limits use signature-verified account IDs for authenticated accounts sharing one relay IP. Invalid, expired or forged tokens fall back to a network bucket; routes still perform normal authorization. Token rotation cannot reset an account bucket. Reads allow 600 and writes 200 per 15 minutes; SOS, hazard and login limits remain separate and tighter. These are in-process limits and need shared storage for multiple API instances.
- Dashboard consumers remove only their own listeners. Successful independent reads remain available during partial API failure.
- The development schema update was additive, with backup `backend/backups/before-schema-1791577398935.db`. Hash comparisons verified every original row/column across all **17 existing tables** unchanged. The development database was neither reset nor seeded.

## Verification

- **33 backend tests and 12 frontend tests passed**; lint clean; production build succeeded. The existing approximately 538 KB entry-bundle warning remains.
- **88 mounted method/path pairs**, **82 literal frontend API calls**, **0 unmatched calls**. Dynamically assembled assignment action paths are covered by API and browser workflows rather than the literal scanner.
- Disposable browser accounts on separate localhost origins exercised profile editing, reason-required withdrawal, citizen report → operator verification/assignment → volunteer acknowledgment/on-scene/replacement → operator reassignment → new responder acknowledgment. Old responder removal, retained stage, current names, timeline, attention queue and workload were verified live.
- Browser checks also covered search/empty team filters, volunteer Focus Map, triage form propagation, alert default values and Escape/focus behavior. Small-phone checks covered owned history/profile, volunteer replacement and operator reassignment/alert forms. The review fixture sends no real SMS or push and is separate from development data.

Screenshots: [citizen](role-citizen-fixed.png), [volunteer](role-volunteer-fixed.png), [operator](role-operator-fixed.png), [phone account](role-account-mobile.png), [phone volunteer](role-volunteer-mobile.png), [phone operator](role-operator-mobile.png).

## Remaining gaps

Asset reservation/release, shelter intake and reviewed missing-person matching, multilingual labels, and automated escalation are subsequent features. Production MFA, verified responder identity/contact information, password recovery, server-side session revocation, provider delivery receipts, real-device/offline testing, retention, backup restore and load testing remain outstanding. Some older feature dialogs still need a dedicated keyboard/screen-reader pass. Historical events and old deadlines cannot be reconstructed and are not fabricated.

The SIH26206 alignment remains the supported disaster preparedness/response/recovery prototype described in the prior audit. No verified official numerical KPI has been invented or claimed as satisfied.
