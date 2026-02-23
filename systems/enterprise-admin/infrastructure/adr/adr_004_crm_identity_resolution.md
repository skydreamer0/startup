# ADR-004: CRM Identity Resolution and Timeline Modeling

## Status
**Accepted**

## Context
As the Enterprise Admin system expanded to include CRM (Customer Relationship Management) functionality for startup pharmacies and retail businesses (Phase 3 of the roadmap), we needed a way to model customer identities across multiple touchpoints. Customers might interact via pure offline store visits (identified by phone number), via E-commerce (email), or via LINE Official Accounts (`lineUid`). 

We required a flexible architecture that allows:
1. Merging fragmented identities (e.g., tying a phone number to a newly linked LINE account).
2. Segmenting capabilities (Tags and Cohorts, explicitly separating first-time and repeat buyers).
3. A chronologically sorted Event Timeline for diverse interactions (`STORE_VISIT`, `PHONE_CALL`, `LINE_MESSAGE`).

## Decision
1. **Identity Resolution**: We chose the `Customer` table to serve as the unified source of truth. We prioritize `phone` and `lineUid` as key identifiers. If a user connects their LINE account later, the `lineUid` and existing `phone` profiles are merged under a single Customer ID.
2. **Interaction Timeline over Flat Fields**: Instead of just having simple "last contacted" fields, we introduced an `Interaction` table that uses polymorphic types (`type` Enum: `LINE_MESSAGE`, `STORE_VISIT`, `PHONE_CALL`).
3. **M:N Tagging system**: We adopted a lightweight `Tag` & `CustomerTag` linkage (Many-to-Many) rather than hardcoded columns, providing dynamic segmentation ("VIP", "Newbie", "Health Supplements").

## Consequences
### Positive
- **Future-Proofing for LINE APIs**: By explicitly separating the `lineUid` and logging distinct `LINE_MESSAGE` interactions, we are fully prepared to integrate LINE Messaging API Webhooks without restructuring the database.
- **Rich Context for Sales/Pharmacy Reps**: The `Interaction` timeline gives staff an immediate historical context (what the customer asked for last time), significantly improving the O2O (Online-to-Offline) service quality.
- **Data Normalization**: M:N Tagging ensures we can scale classification dynamically without painful column migrations.

### Negative / Risks
- **Higher Query Complexity**: Retrieving a full customer profile requires `.findUnique({ include: { interactions: true, tags: { include: { tag: true } } } })`, which includes JOINs and could impact performance at extremely high scale.
- **Merge Conflicts**: In the future when we implement the actual `lineUid` -> `phone` automated merge logic, handling overlapping interaction timestamps or conflicting purchase history may require complex edge-case handling.
