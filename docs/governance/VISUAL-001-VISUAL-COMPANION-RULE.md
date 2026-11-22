# VISUAL-001: Visual Companion Rule

Status: Canonical CoMind governance rule
Issue: #526
Scope: New canonical concepts, major reusable objects, product capabilities, agents, subsystems, and decision models

## Rule

When CoMind accepts a new canonical concept or major reusable object that may later appear in customer-facing, executive, technical, proposal, presentation, operator, or web material, the owning development lane must create or select a rights-cleared **Visual Companion** before the concept is considered fully documented.

A Visual Companion may be an icon, symbol, compact diagram, illustration, status graphic, or other reusable visual representation.

## Purpose

The rule exists to prevent CoMind concepts from becoming text-only artifacts that later require rushed or inconsistent visual interpretation. It creates reusable visual identity at the same time conceptual identity becomes canonical.

## Decision Compression relationship

Visual Companions should follow the Decision Compression Principle:

`preserve decision-relevant meaning with the least visual complexity that remains accurate and recognizable.`

The visual must not imply certainty, capability, status, or authority that the underlying concept does not possess.

## Trigger

The rule applies when an accepted item is one or more of the following:

- a canonical CoMind concept or named principle
- a major architectural object or subsystem
- a reusable product capability
- an agent or virtual employee role
- a customer-facing feature
- a governance mechanism
- a metric or status construct likely to appear in UI
- a concept expected to appear in proposals, presentations, reports, public websites, or marketing material

Minor implementation details, ephemeral experiments, internal-only variables, and disposable prototypes do not automatically require a Visual Companion.

## Selection order

Prefer:

1. an existing CoMind canonical visual when semantically correct
2. an open-source or freely reusable vector asset with clear commercial-use rights
3. a newly created CoMind visual when generic imagery would weaken semantic clarity or brand differentiation

Do not adopt assets with unclear rights, incompatible commercial terms, or third-party trademarks that could imply affiliation.

## Required Visual Companion record

Each governed asset reference should record:

- canonical concept/object identifier
- display name
- asset type
- source or creation method
- source URL when externally sourced
- license
- attribution or notice obligations
- semantic meaning
- approved uses
- accessibility label guidance
- visual version/date
- owner or governing lane
- provisional or canonical status

## Initial Throttle-lane Visual Companions

The initial set uses Lucide because it provides lightweight, scalable SVG icons with a consistent visual system and permissive open-source licensing. The current Lucide license page states that the project uses the ISC license generally, with some Feather-derived icons covered by MIT terms. License notices must remain intact where required.

| Concept | Provisional graphic | Semantic intent | Source |
| --- | --- | --- | --- |
| Pulse | `activity` | continuous sensing, changing state, active signal | https://lucide.dev/icons/activity |
| Throttle | `gauge` | governed control of applied compute | https://lucide.dev/icons/gauge |
| AI Gas Pedal | `circle-gauge` | user-facing compute level and movement | https://lucide.dev/icons/circle-gauge |
| Compute Fit | `badge-check` | verified/aligned configuration state | https://lucide.dev/icons/badge-check |
| Decision Compression | `minimize-2` | reduce surface complexity while retaining meaning | https://lucide.dev/icons/minimize-2 |
| User Compute Policy | `sliders-horizontal` | user-controlled preferences, thresholds, and operating policy | https://lucide.dev/icons/sliders-horizontal |
| Context Sufficiency | `scan-search` | inspect whether required context is present | https://lucide.dev/icons/scan-search |
| Verification Gate | `shield-check` | protected verification requirement before consequential action | https://lucide.dev/icons/shield-check |

License authority: https://lucide.dev/license

These are provisional concept mappings, not custom CoMind trademarks. CoMind may later create proprietary branded illustrations while preserving these icon semantics for interface use.

## Reuse guidance

Visual Companions should be reusable across:

- websites
- operator consoles
- proposals
- presentations
- architecture diagrams
- reports
- documentation
- mobile interfaces
- status summaries

The same concept should not receive conflicting icons across surfaces without a documented reason.

## Accessibility

Icons must not be the sole carrier of important state or action. Meaningful interface usage should provide nearby text, accessible labels, or equivalent assistive-technology semantics.

## Provenance and licensing

Externally sourced Visual Companions require durable source and license references. If the source license changes, the recorded version/provenance should allow CoMind to determine the rights that applied when the asset was adopted.

Do not copy third-party binary or vector assets into the repository solely to establish a concept mapping. Asset incorporation should occur only when implementation requires it and the applicable license obligations are satisfied.

## Acceptance

A concept governed by this rule is visually documented when:

- the Visual Companion is selected or created
- its semantic intent is documented
- commercial-use rights are known
- provenance is recorded
- accessibility guidance exists
- its status is marked provisional or canonical

No Hallucinations. No Lies.
