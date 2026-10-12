# Proposed flood-response pilot and measurement plan

This plan collects evidence; it does not claim completed field validation. Proposed scope: one Dehradun team, one shelter and a small consented household/volunteer group. Obtain an authority partner and operational review before real use.

| Stage | Evidence required | Implemented support |
|---|---|---|
| Baseline | Same scenarios handled by existing process, observation counts/dates/timings | Record externally; app reports baseline unmeasured |
| Preparedness | Independently observed drill, checklist, Hindi comprehension/accessibility feedback | Household checklist and explicit drill timestamp |
| Response | Receipt→first assignment, last assignment→acknowledgment, receipt→resolution | Median/p90 and sample counts under Impact |
| Outcome | Independently checked rescue/aid outcome, citizen confirmation, failed/abandoned cases | Citizen confirmation and incident/recovery history |
| Resources | Competing requests, owner acceptance delay, expiry/release | Atomic reservations and notices |
| Shelter/family | Occupancy reconciliation, consent, correct/incorrect candidates/corrections | Private intake and reviewed matching/departure/consent workflow |
| Warning rules | Dated readings and independent labels, held-out observations, false/missed hazards | Labeled reviews/agreement/precision/recall; not independently validated accuracy |
| Connectivity | Online/high latency/drop/hub-only/reconnect/gateway outage/restart/account switch | Durable queue, idempotency, signed adapter and delivery states |
| Accessibility | Keyboard/screen reader, 320/390px, camera/GPS denial, supported Android/iOS | Responsive forms/native dialogs; real device testing remains external |
| Operations | TLS/proxy/shared DB capacity, encrypted key recovery, handover/restoration | Shared quotas, controlled load check and disposable restore rehearsal |

Use the same scenario mix for baseline and pilot. Report counts, exclusions, failures and distributions. Choose performance targets with the partner after observing baseline; no target here is an official SIH requirement.

Use synthetic demonstration data. Real pilot data needs an agreed retention/access policy and consent. Keep operator attestations distinct from independent validation. Before launch, verify SMS receipts/inbound signatures using consented phones, MFA recovery/revocation, and isolated restoration of both database and separately protected encryption key.
