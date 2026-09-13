# Boundary proposals

These require orchestrator agreement; current request and response fields stay supported.

| Proposal | Reason | Affected boxes |
| --- | --- | --- |
| Publish a per-floor rectangular room envelope and open perimeter regions, with frame/version | The request has no authoritative rectangle. Exact sketch matching needs that boundary; selecting its owner is open. Irregular room plans currently follow clipped outlines. | Exterior, Interior, Engine |
| Publish one primary stair and at most two adjacent lifts in the shared core policy | Current feasibility recipe permits two stairs and up to eight lifts. Consumers read its constants and selected roof shaft; coordinate the family change and whether walkups reserve lifts. | Atlas, Exterior, Interior, Engine |
| Publish ground/regular/connection/top roles separately from room program, including overlapping roles | Current `kind` is a program; special floors need broad open plans while retaining caller-required functions and connection approaches. | Exterior, Interior, Simulation, Engine |
| Allow a separate roof stair and connector identity | Current roof schema requires stair A. | Exterior, Interior, Engine |
| Agree room-family dimensions and actor/door operating envelopes | Spacious rooms are required; minimum dimensions and 0.6/0.7 m body discrepancy are undecided. | Interior, Simulation, Engine |
| Version result identity, resource snapshot and streaming manifest | Results lack generator/schema versions and coordinate/resource identities. | Interior, Engine, Simulation |
| Define instance/role/placement/post mapping and occupancy exchange | Simulation must own exclusive staffing and identity across shifts. | Interior, Simulation, Quests |
| Define moving doors/lifts, route invalidation, interrupt/resume and action bindings | Grid paths alone do not certify runtime motion or dynamic obstruction. | Interior, Simulation, Quests, Engine |
| Agree module mapping and resource ownership | Plain fitted fields and complete patterned modules need one published fit rule; Studio maps and modeled curtains need Materials/Exterior ownership agreement. | Interior, Materials, Exterior |
| Agree generation and streaming budgets with complete-game review | No per-interior latency, memory or draw-call budget is established. | Interior, Engine |

Open product choices also include independent usefulness without quests, room-envelope
ownership, elevator requirements and material generation ownership. No choice is made here.
The existing preview provides floor and eye views; complete character traversal, lighting
continuity and all-role visual acceptance remain joint review work.
