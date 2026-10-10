# GOV-002 Provisional Source Provenance and Claim Boundary

Date: 2026-10-10  
Status: Controlled GOV-002 source record. Not ISO certification or conformity evidence.

## Purpose

GOV-002 uses free authoritative public frameworks plus a pinned open-source implementation toolkit to accelerate CoMind's ISO/IEC 42001 readiness work while licensed ISO normative text remains funding-gated.

Secondary sources may suggest control identifiers, implementation structure, candidate cross-framework relationships, or useful templates. They do **not** establish the wording, applicability, satisfaction, conformity, or audit interpretation of ISO/IEC 42001 requirements.

## Source hierarchy

1. **Authoritative public sources** — NIST publications, OWASP guidance, MITRE ATLAS, and public EU legal text are used for their own requirements/guidance.
2. **Secondary implementation/mapping sources** — used to accelerate candidate mappings and implementation structure.
3. **CoMind verified evidence** — repository, test, isolated-environment, live read-only, and later operating evidence.
4. **Licensed ISO normative source** — required before any ISO-specific mapping is promoted to normative verification.
5. **Independent conformity assessment** — required for any external certification claim.

## Approved secondary toolkit

Repository: `Ankit-Uniyal/iso-42001-ai-governance-toolkit`  
Pinned commit: `803b62da4c66f6b6ab601c87cb298597a497eebd`  
License observed at pinned commit: MIT  
Copyright notice: Copyright (c) 2026 Ankit Uniyal

GOV-002 adapts the toolkit's implementation **shape** and candidate mapping data, specifically:

- the concept of a 38-control Annex A SoA covering A.2-A.10;
- candidate NIST AI RMF, EU AI Act, and ISO/IEC 27001 relationships;
- gap-assessment and SoA workflow patterns;
- status/evidence fields useful for implementation tracking.

CoMind does **not** copy the toolkit's ISO requirement statements or treat them as normative ISO text. CoMind's control objectives and rationales are independently written for CoMind.

The toolkit itself states that its mapping is guidance and that users should refer to original standards for definitive requirements. GOV-002 preserves that limitation.

## MIT notice for adapted repository material

MIT License

Copyright (c) 2026 Ankit Uniyal

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Optional secondary crosswalk

AIRiskAssess AI RMF Crosswalk Tool: `https://compliance.airiskassess.com/`

Status in GOV-002: **optional / not yet ingested**.

Its mappings may be compared against the pinned toolkit and authoritative public frameworks when a versioned/exportable source with clear provenance can be captured. No GOV-002 acceptance criterion depends on this source.

## Copyright and normative-text boundary

The MIT license of an implementation repository does not establish that underlying ISO normative text is freely redistributable. Therefore:

- ISO control identifiers may be used as references.
- CoMind may write its own implementation objectives and applicability rationale.
- CoMind may record secondary-source mappings and provenance.
- CoMind will not store copied ISO normative text merely because it appears in a third-party repository.
- `normative_verification` remains `PENDING_LICENSED_SOURCE` throughout GOV-002.

## Funding gate

Licensed ISO/IEC 42001 material and certification-body expenditure are deferred until CoMind has funding. This is an explicit management decision, not a compliance exception.

GOV-002 is designed so that later licensed review can replace or confirm provisional mappings without discarding the evidence work already completed.

## Machine-readable source

`aims-provisional-crosswalk.csv` is the authoritative GOV-002 provisional control dataset. Human-readable documents are views of that data and must not silently override it.
