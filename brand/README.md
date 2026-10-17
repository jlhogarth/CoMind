# CoMind Brand Runtime

## Purpose

The CoMind Brand Runtime is the framework-agnostic visual contract for CoMind HTML interfaces. It turns branding from a collection of page-local styling decisions into a reusable system of semantic color, field depth, layout, motion, interaction state, and accessibility behavior.

The runtime is intentionally CSS-first. Plain HTML can consume it directly, and React or Next.js applications can adopt the same contract without depending on a specific component library or animation package.

## Visual concept

CoMind should feel like governed cognition in motion: precise, dimensional, intelligent, calm under load, and capable of moments of controlled drama.

The system uses four visual ideas:

1. **Field**: deep blue-black space establishes depth and concentration.
2. **Signal**: Caribbean blue and luminous aqua identify cognition, active systems, focus, and information flow.
3. **Human agency**: copper and warm gold identify decisions, provenance, operator action, and consequential intervention.
4. **Motion with meaning**: animation communicates state, hierarchy, causality, entry, completion, or attention. Motion is not ornamental noise.

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

Scope changes semantic accent variables. Components should consume semantic variables such as `--cm-accent`, `--cm-accent-soft`, and `--cm-accent-border` instead of embedding product-specific hexadecimal values.

## Files

- `tokens.css`: canonical palette, semantic tokens, typography, spacing, radius, depth, timing, and easing.
- `layout.css`: application field, shell, rail, stage, hero, grid, panel, stack, cluster, and command primitives.
- `motion.css`: page reveal, stagger, field drift, signal sweep, node pulse, focus bloom, and reduced-motion behavior.
- `comind-brand.css`: aggregate entry point.
- `demo.html`: static reference composition using only the brand runtime.

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

## Motion restrictions

Do not animate body text, dense tables, destructive confirmation copy, audit evidence, or values whose visual stability is important for interpretation.

Do not use continuous high-frequency movement as decoration. Continuous motion is limited to ambient field treatment and bounded activity indicators.

Prefer `transform` and `opacity`. Avoid uncontrolled paint-heavy filters and large animated shadows.

All nonessential animation must become effectively static when `prefers-reduced-motion: reduce` is active.

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

Applications may compose these primitives without inheriting a fixed page design.

## Accessibility contract

- Visible keyboard focus is mandatory.
- Color may reinforce state but must not be the only state signal.
- Reduced-motion preferences are honored globally.
- Motion must not obscure text or interfere with reading order.
- Semantic scopes are visual only and do not grant authority or imply a security state.
- Application teams remain responsible for accessible names, landmarks, keyboard order, and semantic HTML.

## Branding Manager capability contract

The CoMind Branding Manager owns and evolves:

- canonical semantic tokens and palette provenance;
- scope names and compatibility rules;
- approved motion vocabulary and restrictions;
- layout and surface primitives;
- application adoption guidance;
- accessibility and performance constraints;
- versioned change history and migration guidance;
- visual acceptance criteria for future web applications.

The Branding Manager does not own application business logic, authorization, database policy, or security state. A visual scope must never be treated as an authorization control.

## Operator Console coordination

BRAND-001 intentionally does not modify `apps/operator-console`. PR #119 remains the active OC-002 implementation lane. Operator Console adoption should occur only after explicit coordination so the brand runtime is consumed as a shared dependency rather than creating a competing UI rewrite.

## Adoption sequence

1. Import or serve `comind-brand.css`.
2. Apply `.cm-app` and a semantic `data-comind-scope` at the application root.
3. Replace page-local palette values with semantic tokens.
4. Adopt layout primitives only where they simplify existing structure.
5. Add motion where it communicates a real state or transition.
6. Verify keyboard focus, contrast, reduced-motion behavior, responsive layout, and application-specific visual regression.

## Governance

BRAND-001 is T1 reversible repository development. It does not authorize production deployment or changes to production authority boundaries.
