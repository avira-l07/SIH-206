# Judge Q&A: Defense Notes for SIH26206

Battle-tested talking points for live judging. Read this before the demo, not during it — the goal is that everyone on the team gives the same honest answer to the same hard question, instead of improvising differently under pressure.

---

## The One Argument to Internalize: "Physics of the Browser"

If challenged on why you don't have real mesh/BLE/Wi-Fi Direct, the honest, technically correct answer is:

> "Web browsers are deliberately restricted from broadcasting or advertising over Bluetooth or Wi-Fi Direct — that's a security boundary in every major browser, not a gap we ran out of time to fill. True phone-to-phone mesh requires a native app. What we built instead guarantees **zero data loss at the point of capture** — the moment someone presses SOS, their location and message are safely stored on their own device, with or without any network. That data reaches a rescue team the instant the phone comes within range of our local hub, or a responder's mobile hub reaches them."

This framing turns a limitation into a demonstrated engineering decision. Use it every time mesh/BLE/LoRa comes up.

---

## Trap Questions and Straight Answers

**"What happens if a victim is 2km away, out of hotspot range, and never reaches your hub?"**
> "Our platform provides asynchronous store-and-forward resilience. Because mobile OS security prevents a browser from transmitting across kilometers without infrastructure, we guarantee data survival on the device itself — the SOS is captured with zero packet loss, ready to sync the moment either the victim reaches an aid station, or a mobile rescue team carrying a portable hub enters their vicinity."

**"What if the phone breaks or dies right after sending the SOS?"**
> "We use an acknowledgment handshake. The phone only deletes a queued item from its local storage after the hub confirms receipt. If the phone breaks *before* that confirmation, the record is lost with it — a real, honest limitation of any system, not unique to ours. If it breaks *after* confirmation, the incident is already live on the rescue dashboard as a 'last known fix,' and the phone's condition afterward doesn't matter — rescuers dispatch to the coordinates regardless."

**"How accurate is the location you capture?"**
> "We use the device's GPS via the browser's standard geolocation API — typically 5 to 15 meters outdoors, degrading indoors or under structural cover. Critically, we capture location **at the moment the SOS button is pressed**, not when the phone reconnects — so a location dispatch remains accurate even if the person moves afterward. We also display the accuracy radius and how old the reading is, so responders know how much to trust a given pin, not just a bare dot on a map."

**"What's your actual detection range for the local hub?"**
> "Outdoors with clear line of sight, roughly 50-100 meters — governed by standard Wi-Fi physics, not a limitation we introduced. This is why our operational model uses a *roaming hub*: rescue teams carry a portable hotspot (a laptop, tablet, or low-cost single-board computer) and sweep through the affected area, so range is extended operationally rather than requiring victims to reach a single fixed point."

**"Is this real Delay-Tolerant Networking / mesh, like the research literature?"**
> "No — and we want to be precise about that. What we've built is a single-hop store-and-forward client-to-hub queue with idempotent, duplicate-safe sync. It doesn't include multi-hop routing, TTL expiry, or probabilistic forwarding, which is what distinguishes full DTN. We see that as the clear, honest next layer to build — not something we're claiming today."

**"Do you use AI to predict risk?"**
> "Our current risk engine uses deterministic, explainable threshold rules — for example, rainfall above 60mm/hour flags a flood risk. We chose rule-based logic deliberately: it's fully explainable to a responder and doesn't depend on training data we don't have. A learned model is a natural next step, but we'd rather present something transparent and correct than something that sounds more advanced and isn't verified."

**"Does your alert system break through Do Not Disturb / silent mode?"**
> "Not directly — that's an OS-level privilege reserved for native emergency-alert channels and telecom cell broadcast, which is exactly how India's real cyclone/flood alerts already reach every phone in an area, app or no app. We deliberately didn't try to rebuild that layer. Instead, our platform maximizes reach through every channel a web application legitimately can: SMS to a no-login phone registry, push notifications to anyone who's enabled them, and a maximum-priority in-app takeover for anyone with the app open. In production, we'd integrate with NDMA's Sachet system for true cell-broadcast delivery — our focus is the response coordination layer that doesn't already exist, not re-building broadcast infrastructure that does."

---

## Claims You CAN Safely Make

- "Our platform operates with zero cellular data or public internet uplink, via an emergency local network relay on a portable hotspot."
- "In full airplane mode, the app boots from cache, renders previously-cached maps, and stores emergency SOS calls in persistent local storage with zero data loss."
- "Client-generated idempotency keys guarantee that network retries or repeated sync attempts never create duplicate emergency records."
- "Our shelter readiness engine evaluates five critical resources in real time and automatically reroutes evacuees away from a depleted shelter."
- "Our crowd-verification system uses a multi-peer confidence-tier state machine with dispute detection to actively suppress misinformation, not just collect reports."
- "We capture GPS location at the moment of distress, not at reconnect time, so a moving victim doesn't corrupt their own incident location."

## Claims You Must NOT Make

- ❌ "We built an ad-hoc Bluetooth mesh where phones relay data directly to each other." (False — centralized local hub only.)
- ❌ "We run on-device computer vision to analyze flood depth from photos." (False — the depth benchmark is a manual dropdown selection.)
- ❌ "We use H3 hexagonal spatial indexing." (False, unless and until it's actually implemented — currently raw lat/lng and Haversine distance.)
- ❌ "We have full delay-tolerant networking with bundle protocol." (False — single-hop client buffer with batch sync.)
- ❌ "Our database uses general-purpose CRDTs for arbitrary multi-master tables." (False — we do not claim CRDTs across arbitrary tables; however, shelter resource updates are resolved via commutative delta event-log merging with server-side clamping, avoiding Last-Write-Wins overwrites.)
- ❌ "48+ hours of battery life via duty-cycling." (Not measured — describe the adaptive-policy concept only, without a number you haven't benchmarked.)

---

## Known, Honestly-Acknowledged Gaps (have these ready, don't get caught flat-footed)
- General arbitrary entity updates outside shelters/SOS resolve conflicts via Last-Write-Wins; shelter resources are protected via commutative delta event-log merging, but broader multi-master syncing for all tables is out of scope.
- Map coverage offline is limited to previously-visited tiles; unvisited areas show a placeholder. Full offline coverage would need a pre-packaged local tile archive.
- No end-to-end encryption of locally stored data yet — relies on device-level OS security and HTTPS in transit.
