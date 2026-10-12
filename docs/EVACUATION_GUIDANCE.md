# Local warning, shelter route and team help points

Implemented on 11 October 2026. This connects the citizen, volunteer and operator workflows for preparing for possible evacuation and following a local evacuation instruction.

## How to use it

1. **Operator:** open **Evacuation guidance**. Publish the hazard, affected centre and radius, assessment source, bulletin/reference, observation time, forecast time window, local instructions and expiry. A source-reported probability is optional. An estimate above 60% is highlighted for planning; the operator separately selects **Prepare** or **Evacuate**. Review and publish route corridors using the linked route tool. Assign an approved, on-duty volunteer to a public landmark on a current corridor.
2. **Volunteer:** open **My route help points**, then confirm presence only after reaching the point. Use **I have left this point** when leaving. Check-in lasts at most one hour and cannot outlast the help point or corridor. Ending a shift or being dispatched to a rescue clears recorded presence. A volunteer cannot confirm two points simultaneously or check in while assigned to an active rescue.
3. **Citizen:** a current nearby advisory appears on the dashboard and becomes the recommended next step when there is no active SOS. Open the shelter plan, check the starting location, choose walking or vehicle travel, then select **Find nearest reachable shelter**. Save the plan on the device or download the HTML map. Open that file in a browser without internet; its print button also supports saving as PDF.

## What the plan contains

- The shortest available reviewed route among up to 50 nearby shelters with reported space, within 50 km. Full, inactive and critically flagged shelters are excluded. The search is bounded and does not promise the globally nearest shelter.
- The destination, shelter phone, reported free places, route distance, waypoint coordinates and corridor review records. Capacity is a snapshot; it does not reserve a place.
- An online street map and a self-contained offline coordinate map. Help points are marked on both, with public team contacts and recorded check-in freshness. Public responses and saved files omit private volunteer identities and phone numbers.
- Guidance and route validity. Withdrawn alerts and expired guidance cannot be used to generate a new plan. Saved plans remain available as clearly labelled references; expired reviews show a warning.

## Limits that remain

The app does **not** generate or validate a disaster probability. The percentage is entered by an operator from a named source, with its basis and time window. No live official forecasting feed has been integrated. A probability by itself does not produce an evacuation instruction.

The downloadable map includes route geometry, coordinates, shelter and help points. It does **not** contain offline street tiles or turn-by-turn instructions. A downloaded file cannot receive route closures, changed occupancy or staff departures. Its timestamp and expiry notice remain visible, and recorded staff presence becomes stale after its validity period. Device-saved references are scoped to the signed-in account and retained for up to seven days. The production app shell must first load online for in-app offline reopening; the downloaded file works independently.

Routing uses operator-reviewed corridors and recent reported obstructions. Dashed endpoint connectors are unreviewed, and a reviewed corridor is not a guarantee of safe passage. Without an eligible reachable shelter, the tool asks the citizen to contact the operator instead of inventing a route. Team check-in is self-reported, not location-verified. Staff must maintain corridor reviews, shelter readiness and help points before this can support real field use.

Alerts use the existing authenticated in-app delivery workflow. SMS and push depend on configured providers, registration and connectivity; publication does not mean every recipient received the warning. This update does not introduce automatic deployment of a rescue team.

## Verification

- Backend: 53 tests, including advisory permissions and district scope, source/probability validation, route exclusion, private-data projection, check-in ownership, single-point presence, shift end, rescue dispatch, closed corridors, withdrawal and expiry.
- Frontend: 31 tests, including nearby guidance, priority over ordinary next steps, account-scoped storage, expired references, quota failure and escaped standalone map downloads. Lint and production build pass.
- Browser: tested operator publication/assignment, volunteer check-in, citizen route generation, saving and reopening, and the actual HTML download in a disposable local database with external delivery disabled. The example map and screenshots use synthetic test data. The final additional mobile check was blocked by the browser approval review service's usage limit; the viewport override was reset.
- Route inventory: 134 mounted method/path pairs; 90 literal client calls; no unmatched literal calls.
- Immediately after additive schema setup, all 29 existing table counts and content hashes were unchanged. A later check after the server ran detected a change only in `RateLimitBucket`, which normal request accounting and scheduled expiry cleanup update. Backup: `backend/backups/before-schema-1791725819304.db`. No synthetic warnings or assignments were published to the main database.

## Example and references

The [downloaded example](evacuation-route-example.html) is a synthetic browser-test output. Its time-limited review is expected to expire. The [offline map screenshot](evacuation-offline-map.png) and [volunteer screenshot](evacuation-volunteer.png) show that test workflow.

Official warning context was checked against [NDMA SACHET](https://sachet.ndma.gov.in/About) and [GSI landslide hazard information](https://gsi.gov.in/landslide-hazard/). These are reference sources for the workflow; the application does not claim to be connected to them.
