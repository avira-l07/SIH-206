# SOS and offline map improvements — 10 October 2026

## What changed

- SOS uses one account-bound receipt for live sends, retries and offline replay. A changed emergency cannot reuse that receipt. Concurrent sends produce one request and creation event. Offline-first reports can also be replayed safely online. No database reset or migration was needed.
- Server receipts stay visible with the request number. Offline receipts explicitly distinguish local storage from server acknowledgment; ambiguous network failures keep the same receipt key. SMS text is available for both forced outages and network failures, preserves proxy descriptions, and is bounded to the parser's limit.
- The form distinguishes saved/manual locations from timestamped GPS, reports denied/unavailable GPS, shows uncertainty, and requires incident-location confirmation. Manual locations no longer get a fabricated GPS capture timestamp. Double-clicks are guarded; dialogs support Escape/focus restoration; requests in progress cannot be dismissed mid-send.
- Maps can save public shelter/alert/hazard reference data and the current view per account, role, approval and service district. Private SOS records, reporter identities, hazard notes and photos are excluded. Saved references expire after seven days. Capacity and hazard conditions remain explicitly stale offline.
- The coordinate grid and saved markers work without road tiles or internet. Map style options now point to existing providers. Invalid coordinates are filtered, including support for zero latitude/longitude. Offline mutation and external direction buttons are suppressed.
- Offline readiness asks the active worker to confirm the shell and all build assets. Previously viewed street tiles are bounded to 200 cached entries. This is passive caching, not a downloadable road-network package. Satellite/topographic imagery needs internet. No tile area is bulk downloaded; see [OSM policy](https://operations.osmfoundation.org/policies/tiles/).
- Fixed an offline module-cache failure caused by `Vary: Origin` on public static assets. Cache matching now handles immutable public build files while private/authorized API responses remain excluded. Successfully fetched responses survive cache quota errors.
- Leaflet styles are bundled and cached locally. Optional external fonts load after application startup instead of blocking emergency module execution.
- Queue counts/synchronization update on account changes and login. Reconnecting to the relay also retries saved reports even when the browser's network interface never went offline. Manual sync displays rejection/skipped results. Offline tools use native dialogs, keep examples tied to existing shelters, and distinguish browser report submission from physical SMS transmission.
- Offline raw audit packets are restricted to the originating account for volunteers and district operators; global operators retain oversight. Unknown-owner legacy packets are not exposed to those scoped roles.

## Verification

- 49 backend and 20 frontend tests passed; lint and production build passed. Route inventory found 126 mounted method/path combinations and 89 literal client calls, with zero unmatched calls.
- Browser testing used disposable synthetic records with external delivery disabled. Online request #1 received a persistent server receipt. Offline request #2 survived reload and a session restart, then synchronization reported one successful action and zero failures. Request history contained each synthetic report exactly once.
- Stopped both disposable static/API servers and reloaded the production console. The cached app opened; the map still showed saved shelter coordinates/contact/capacity with a stale-data warning. The active worker confirmed 29 cached app assets. Browser-network loss on physical mobile devices still needs field/device validation.
- Checked the offline SOS receipt at 390 pixels. Evidence: [online receipt](sos-receipt-verified.png), [mobile offline receipt](sos-offline-mobile.png), [saved map with both test servers stopped](offline-map-verified.png).

## How to use

Open Map → Map options → Save map reference while connected. Check offline readiness on the production build served over HTTPS or localhost. Development mode does not install the production service worker. The saved map grid contains coordinates/markers, not surveyed roads or a guarantee of safe travel.

A local production preview is running at http://127.0.0.1:5181/console against the normal API. The existing development server remains on port 5177. Preview sessions/storage belong to their own browser origin; sign in and save the reference there before testing an outage. The preview lasts while its local server process runs; restart with `cd frontend` then `npx vite preview --host 127.0.0.1 --port 5181 --strictPort` after building.

Verify incident coordinates before sending SOS. A device receipt waits for the same account to reconnect and sign in. Preserve that browser's storage until synchronization finishes. The manual offline test switch keeps reports local until restored. SMS requires cellular coverage and the actual operator gateway number; opening Messages does not send automatically. SMS and internet copies still require operator duplicate review because carrier and internet identities differ.
