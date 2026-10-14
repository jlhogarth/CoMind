# Schema kernel invariants

1. Metadata is validated before graph construction.
2. Foreign keys may not reference undiscovered relations.
3. Inbound and outbound relationships are both preserved.
4. Referential actions remain explicit.
5. OC-001 supports the `public` schema only.
6. Missing protected metadata access fails closed.
7. No production schema assumption is hard-coded into navigation.
