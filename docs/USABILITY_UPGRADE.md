# Usability pass — 11 October 2026

This pass prioritizes helping citizens, volunteers and operators understand the next useful action. Field and impact validation remains deferred at the user's request. The changes improve the prototype; they do not establish a measured 9/10 usability score.

## What changed

- Each dashboard has a live **Your next step** card. Citizen requests take priority over preparation; volunteers see their own unacknowledged assignment first; operators see dispatch and overdue/replacement work. An unavailable request list does not claim there is no work.
- Three relevant shortcuts open the actual planning tools directly. Equipment booking from a rescue preselects its incident and suggested resource. Shelter route planning preselects the destination.
- Rescue progress now explains the current step and who acts next. Volunteer stage advancement appears after assignment acknowledgment. Citizens can go from their SOS receipt directly to tracking and confirm safety after completion.
- A role-specific guide explains four basic tasks, receipt meanings and connection behavior. Larger text is optional and saved per account on the device.
- Secondary statistics, detailed shelter facilities and tool switching are expandable, keeping the main task visible. Recovery work puts responders' existing work before the report-creation form.
- Routes start with current location, saved location or manual coordinates, followed by a shelter destination and travel mode. Missing, expired or disconnected corridors return an explicit unavailable result. This is not complete road navigation or offline corridor routing.
- Shelter distances require valid coordinates. There is no invented Mumbai fallback. Distance labels explain that they are straight-line estimates; reported capacity is not presented as guaranteed availability.
- Dashboard sections and rescue filters use validated URL parameters. Reload, browser Back/Forward and keyboard tab-section navigation preserve context. Main-content shortcuts, visible focus, larger touch controls and reduced-motion support improve accessibility.
- Alert messages wrap on small screens. Critical alerts use a scrollable modal. Shared dialogs explicitly cycle keyboard focus and return it on closing. Map and synchronization errors use dismissible inline feedback.
- Offline controls explain saved reports and connection testing in plain language.
- Fixed empty write requests: fieldless POST/PUT/PATCH commands send the JSON object required by the API, preserving supplied payloads. This fixes buttons such as logout that previously failed at request validation.

## Verification

- Frontend: 27 automated tests passed, including navigation validation, role-specific recommendations, rescue progress, coordinate validation and fieldless request formatting. Lint and production build passed.
- Browser, isolated preview database with external delivery disabled: citizen SOS → operator verification and assignment → volunteer acknowledgment, arrival, evacuation, medical handover and completion → citizen safety confirmation.
- Direct equipment booking selected the correct incident/resource; shelter route planning selected the correct destination and reported missing corridors honestly.
- Browser Back, keyboard section navigation and reload preservation passed. Logout reported server session revocation.
- Mobile checks at 320 and 390 pixels: no horizontal overflow in the reviewed dashboard/guide views; larger-text setting persisted. At 320 pixels the critical alert scrolled within the viewport. Shared-dialog Tab and Shift+Tab cycled between the first/last controls after a browser-discovered focus fix; Escape returned focus to Help.
- Normal local application was reachable at port 5177; API health at port 5000 reported a healthy database.

Browser records used synthetic preview accounts and incidents, not the application's real database. Screenshots: `usability-operator.png`, `usability-volunteer-mobile.png`, `usability-guide-mobile.png` and `usability-citizen.png`.

## Practical limits

Real users have not yet measured task-completion time or comprehension. Official agency feeds, configured live SMS/push delivery and full road/offline navigation require their own implementation or deployment verification. Those limits are not hidden by the simplified interface. This document describes a usability pass, not certification of every security property or SIH judging criteria.
