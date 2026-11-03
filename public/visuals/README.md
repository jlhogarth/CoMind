# CoMind Canonical Visual Assets

This directory is the public-safe canonical source for reusable CoMind visual companions intended for web, documentation, proposals, presentations, diagrams, and operator surfaces.

## Structure

```text
public/visuals/
  registry.json
  concepts/
    <concept-slug>/
      metadata.json
      icon.svg            # when incorporated
      concept.svg         # optional explanatory illustration
      architecture.svg    # optional relationship diagram
      status.svg          # optional status visualization
      social.png          # optional rendered derivative
```

Directories are kebab-case. Asset filenames are stable and semantic rather than version-numbered. Version history belongs in source control and metadata.

## Format policy

- Prefer SVG for icons, diagrams, and illustrations that can remain vector-based.
- Use PNG only for raster derivatives or consuming surfaces that require raster output.
- Keep canonical source assets resolution-independent where practical.
- Do not store duplicate copies for different documents or presentations. Consumers should reuse the canonical asset or generate a derivative from it.
- Do not commit third-party binaries merely to reserve a future asset slot. Until implementation needs the file, metadata may reference the rights-cleared source asset instead.

## Web consumption

Files under `public/visuals/` are intentionally suitable for direct web delivery. A Next.js application can reference a canonical asset by stable path, for example:

`/visuals/concepts/throttle/icon.svg`

The registry provides discovery metadata for components, documentation tooling, and future automated site generation.

## Documentation and presentation reuse

Documentation, proposals, and presentations should reuse the same canonical concept identity. If an exported document needs a raster image, create a derivative from the canonical source rather than establishing a second visual identity.

## Governance

VISUAL-001 governs when a Visual Companion is required. VISUAL-002 governs how those assets are organized for durable reuse.

No proprietary scoring logic, confidential heuristics, private calibration data, or confidential IP belongs in public visual metadata.