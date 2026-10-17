# CoMind Brand Runtime

## Purpose

The CoMind Brand Runtime is the framework-agnostic visual contract for CoMind HTML interfaces. It turns branding from a collection of page-local styling decisions into a reusable system of semantic color, field depth, layout, motion, interaction state, accessibility behavior, experience intensity, and versioned application adoption.

The runtime is CSS-first. Plain HTML can consume it directly, and React or Next.js applications can adopt the same contract without depending on a specific component library or paid animation package.

## Visual concept

CoMind should feel like governed cognition in motion: precise, dimensional, intelligent, calm under load, and capable of moments of controlled drama.

The system uses four visual ideas:

1. **Field**: deep blue-black space establishes depth and concentration.
2. **Signal**: Caribbean blue and luminous aqua identify cognition, active systems, focus, and information flow.
3. **Human agency**: copper and warm gold identify decisions, provenance, operator action, and consequential intervention.
4. **Motion with meaning**: animation communicates state, hierarchy, causality, entry, completion, or attention. Motion is not ornamental noise.

A core rule is: **stillness is the default; motion means something.**

## Stable HTML contract

Apply the base application and field classes at the page root:

```html
<body class="cm-app cm-field cm-field--alive" data-comind-scope="cognition">
  ...
</body>
```

Apply semantic scope to any subtree that needs a different accent language:

```html
<section data-comind-scope="operator">...</section>
<section data-comind-scope="governance">...</section>
<section data-comind-scope="success">...</section>
<section data-comind-scope="warning">...</section>
<section data-comind-scope="danger">...</section>
```

Scope changes semantic accent variables. Components should consume variables such as `--cm-accent`, `--cm-accent-soft`, and `--cm-accent-border` instead of embedding product-specific hexadecimal values.

## Experience intensity

The runtime defines three presentation modes:

- `calm`: reduced field movement and lower ambient intensity for reading-heavy or contemplative workflows.
- `operational`: the default balance for daily application use.
- `cinematic`: stronger field depth, faster orbital/signal motion, and greater visual drama for high-value entry, command, presentation, and showcase surfaces.

Set the mode at the document root:

```html
<html data-comind-experience="operational">
```

These modes affect presentation only. They never represent system authority, security, certification, or production state.

## Files

- `tokens.css`: canonical palette, semantic tokens, typography, spacing, radius, depth, timing, and easing.
- `layout.css`: application field, shell, rail, stage, hero, grid, panel, stack, cluster, and command primitives.
- `motion.css`: page reveal, stagger, field drift, signal sweep, node pulse, focus bloom, and reduced-motion behavior.
- `experience.css`: Calm, Operational, and Cinematic modes plus richer visual-system primitives.
- `comind-brand.css`: aggregate CSS entry point.
- `demo.html`: minimal static reference composition.
- `lab.html`: interactive Experience Lab.
- `lab.js`: dependency-free interaction controller for the Experience Lab.
- `sql/001_branding_manager_registry.sql`: repository-only PostgreSQL registry design for versioned brand profiles, scopes, modes, application bindings, and evidence.
- `sql/verify_branding_manager_registry.sql`: transactional verification script for the proposed registry.

## Experience Lab

Open `lab.html` with the adjacent runtime files available.

The lab supports:

- Calm, Operational, and Cinematic intensity switching.
- semantic scope switching across cognition, operator, governance, success, warning, and danger.
- a manual reduced-motion preview.
- a visual state simulation that moves through cognition, governance, operator review, and verified completion.
- a local event stream that records only in-browser presentation events.

The simulation has no API calls, no database calls, and no production side effects.

## Motion vocabulary

### Field drift

Use for low-amplitude ambient depth on large application backgrounds. It should be slow enough to be perceived as atmosphere rather than activity.

### Page reveal

Use when a page, major region, or modal enters. The movement is short, directional, and paired with opacity.

### Signal sweep

Use for active computation, scanning, ingestion, or a deliberate handoff. It must not run continuously on large numbers of elements.

### Node pulse

Use for a live node, selected entity, or temporary activity indicator. It is a local signal, not a universal loading treatment.

### Focus bloom

Use for keyboard focus and high-value interaction focus. It reinforces the accessible focus ring rather than replacing it.

### Settle

Use after a successful state transition or completion. The motion should end in a quiet stable state.

### Core and orbit

Use the dimensional core and orbit language only on high-value surfaces such as product entry, orchestration, system overview, or presentation views. Do not place it behind dense tables or long-form reading surfaces.

## Motion restrictions

Do not animate body text, dense tables, destructive confirmation copy, audit evidence, or values whose visual stability is important for interpretation.

Do not use continuous high-frequency movement as decoration. Continuous motion is limited to ambient field treatment and bounded activity indicators.

Prefer `transform` and `opacity`. Avoid uncontrolled paint-heavy filters and large animated shadows.

All nonessential animation must become effectively static when `prefers-reduced-motion: reduce` is active. The Experience Lab also provides a manual reduced-motion preview.

## Layout vocabulary

- `.cm-shell`: application shell with rail and stage.
- `.cm-rail`: navigation or product identity rail.
- `.cm-stage`: main content area.
- `.cm-hero`: high-level page introduction.
- `.cm-grid`: responsive content grid.
- `.cm-panel`: dimensional governed surface.
- `.cm-panel--interactive`: elevated hover/focus treatment for actionable panels.
- `.cm-stack`: vertical rhythm primitive.
- `.cm-cluster`: wrapping horizontal grouping primitive.
- `.cm-command-bar`: action and status region.
- `.cm-experience-stage`: dramatic two-region introduction surface.
- `.cm-experience-visual`: bounded visual field for dimensional state representation.

Applications may compose these primitives without inheriting a fixed page design.

## Accessibility contract

- Visible keyboard focus is mandatory.
- Color may reinforce state but must not be the only state signal.
- Reduced-motion preferences are honored globally.
- Motion must not obscure text or interfere with reading order.
- Semantic scopes are visual only and do not grant authority or imply a security state.
- Experience intensity must not alter information availability.
- Application teams remain responsible for accessible names, landmarks, keyboard order, and semantic HTML.

## Branding Manager capability contract

The CoMind Branding Manager owns and evolves:

- canonical semantic tokens and palette provenance;
- scope names and compatibility rules;
- Calm, Operational, and Cinematic experience policies;
- approved motion vocabulary and restrictions;
- layout and surface primitives;
- application adoption guidance;
- accessibility and performance constraints;
- versioned change history and migration guidance;
- visual acceptance criteria for future web applications;
- future application-to-brand-profile binding policy.

The Branding Manager does not own application business logic, authorization, database policy, or security state. A visual scope must never be treated as an authorization control.

## Proposed persistent registry

The SQL under `brand/sql/` is a design artifact only and is not applied by BRAND-001.

It models:

- named brand profiles;
- immutable accepted versions;
- semantic scopes;
- experience modes;
- layout presets;
- application bindings;
- append-only branding lifecycle evidence;
- accepted-profile and application-brand catalog views.

The SQL grants no access to `PUBLIC`. A future live deployment must receive a separate authority classification, migration review, RLS/service-identity design where applicable, isolated PostgreSQL proof, and explicit production authorization.

## Operator Console coordination

BRAND-001 intentionally does not modify `apps/operator-console`. PR #119 remains the active OC-002 implementation lane. Operator Console adoption should occur only after explicit coordination so the brand runtime is consumed as a shared dependency rather than creating a competing UI rewrite.

## Adoption sequence

1. Import or serve `comind-brand.css`.
2. Apply `.cm-app` and a semantic `data-comind-scope` at the application root.
3. Choose an experience intensity appropriate to the surface.
4. Replace page-local palette values with semantic tokens.
5. Adopt layout primitives only where they simplify existing structure.
6. Add motion where it communicates a real state or transition.
7. Verify keyboard focus, contrast, reduced-motion behavior, responsive layout, and application-specific visual regression.
8. Bind an application to a persistent profile only after the registry is separately approved and deployed.

## Governance

BRAND-001 is T1 reversible repository development. It does not authorize production deployment, database migration, or changes to production authority boundaries.
