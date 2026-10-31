# IIC-005 Development Evidence

Issue: #349  
Branch: `iic-005-no-magic-configuration`  
Starting main: `f1ab149b121471a8aa57a7a52dab6cbaf3731bf6`

## Collision and reuse review

Open development lanes were inspected before branching. The active VE standard, CE-002, MDO-002, Competitive CP-04, Conversation History K01, and older isolated branches do not own the NMC detector/test/documentation paths.

IIC-005 reuses the existing Implementation Integrity workflow and canonical Integrity Registry. It does not create a new governance workflow or database authority.

## Initial detector and first real scan

The initial candidate-only detector inspected runtime JavaScript/TypeScript-family source for consequential environment-variable fallbacks and literal HTTP/HTTPS endpoints.

Nine initial deterministic tests passed.

The first exact-head scan emitted 13 NMC candidates. Review showed that nine were ordinary Operator Console navigation links and one was a pricing/provenance source URL. These were detector false positives, not configuration debt. No candidate was baselined or suppressed.

## Detector refinement

HTTP literal detection was narrowed to connection-oriented runtime contexts such as `baseUrl`, endpoint, service URL, API URL, request URL, or fetch usage. Two regression tests were added proving navigation and provenance-source URLs are not candidates. The NMC suite therefore increased to 11 tests.

A subsequent No Placeholder run failed because one synthetic negative test used a network address reserved by NPH-001 as fabricated sample data. The hard gate was not weakened. The fixture was replaced while retaining the same test semantics.

## Refined exact-head evidence

Refined Implementation Integrity run `41023501847` on head `9bfcce5ce22bf7a9690cf3adb3ef2483047c2c95` produced:

- NDT-001 blocking findings: 0;
- NFS-001 candidates: 4, unchanged from prior accepted review;
- NMC-001 candidates: 3;
- NMC-001 blocking findings: 0.

The three NMC fingerprints are:

1. `1c4c068a60a3d5e4b9e50a12`, SDN port 3100;
2. `112be7eb597d54cbc92e3999`, ordinary database purpose `application`;
3. `2d66b5610bfd49c754f37e84`, local Ollama loopback endpoint.

Review classified all three as `accepted-pattern`:

- SDN 3100 is the documented ingest default in the SDN Dockerfile, compose contract, and topology documentation and remains environment-overrideable.
- `application` is the deliberate ordinary database-purpose default; archive mode must be selected explicitly and requires its separate archive database URL without falling back to the application database URL.
- the Ollama adapter is explicitly local, validates local base URLs, permits caller override, and uses the standard local endpoint as its default.

Each reviewed finding has a reconsideration trigger in the canonical Integrity Registry. The scanner continues to emit all three candidates.

## Registry promotion

After the refined evidence existed, NMC-001 was moved from `defined_controls` into `implemented_controls` with maturity `SHADOW`, nonblocking enforcement semantics, detector paths, promotion history, and the exact scan run as accepted verification evidence.

No promotion beyond `SHADOW` is claimed.

## Cost and recovery

No paid provider, database mutation, Production action, or external dependency. Cost is GitHub Actions runner time only. Recovery is repository revert.
