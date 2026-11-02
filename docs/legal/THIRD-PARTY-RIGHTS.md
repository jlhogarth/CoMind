# Third-party rights and licensing boundary

Date: November 2, 2026

The root notice covers only rights actually controlled by the applicable CoMind rights holders. It does not convert dependencies or adapted third-party material into proprietary CoMind property. Keep all applicable attribution, notices, license texts, source-offer obligations and other conditions with distributions as required by their licenses.

## Verified existing records

- [GOV-002 source provenance](../governance/iso/GOV-002-SOURCE-PROVENANCE.md) preserves the MIT notice for Ankit Uniyal's toolkit at commit `803b62da4c66f6b6ab601c87cb298597a497eebd`. That notice and its component-specific scope remain unchanged.
- [Temporal runtime provenance](../provenance/2026-10-31-aed-002b-temporal-runtime-binding.md) contains an existing component license/IP review. It is not blanket clearance for every dependency or distribution.
- [Server manifest](../../server/package.json), [server lockfile](../../server/package-lock.json), [console manifest](../../apps/operator-console/package.json) and [console lockfile](../../apps/operator-console/package-lock.json) identify dependency inputs. Both package manifests use `private: true`; this prevents ordinary npm publication, not GitHub viewing or copying.

## Distribution gate

Before a release or external license, inventory direct and transitive dependencies, copied/adapted code and documents, fonts, images, models, datasets, containers and bundled tools for the exact release. Verify each applicable license and delivery obligation against its source. Record unresolved provenance as a blocker, with Joseph accountable for obtaining resolution and counsel reviewing material incompatibilities. Lockfile metadata alone is not a legal audit.

No complete dependency-license or historical grant clearance is claimed by IP-001. This package adds no runtime dependency and changes no third-party notice. An unknown license is not permission, and a permissive dependency license does not license all of CoMind.
