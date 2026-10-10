# CoMind Standards Applicability Register

Date: 2026-10-10
Status: Controlled draft. Edition and source metadata verified against public authoritative pages where noted. Clause-level applicability remains pending licensed-source review for copyrighted ISO standards.

## Register rules

Each entry must preserve: framework, exact edition/version, authoritative source, role in CoMind, applicability, review trigger, owner, evidence status, and licensing constraint. Do not copy proprietary standard text into the repository unless licensing permits it. Public descriptions may support framework selection but are not substitutes for the licensed normative text.

| ID | Framework / version | Role in CoMind | Applicability | Current state | Review trigger |
| --- | --- | --- | --- | --- | --- |
| STD-ISO-42001 | ISO/IEC 42001:2023, Edition 1, published 2023-12 | Primary AI management-system requirements and active certification-readiness backbone | Core | Public edition metadata verified; clause mapping pending licensed standard | ISO amendment/revision, certification planning, scope change |
| STD-ISO-23894 | ISO/IEC 23894:2023, Edition 1, published 2023-02 | AI-specific risk-management guidance supporting AIMS risk process | Core guidance | Public edition metadata verified; detailed mapping pending licensed standard | ISO amendment/revision, risk-method change |
| STD-ISO-27001 | ISO/IEC 27001:2022, Edition 3, published 2022-10 | Information-security management requirements used as a supporting security crosswalk | Supporting only | Management decision 2026-10-10: not a separate certification objective at this stage | Security strategy change, audit planning, ISO revision |
| STD-NIST-AIRMF | NIST AI RMF 1.0, NIST AI 100-1, 2023-01-26 | Voluntary trustworthy-AI risk structure and operational crosswalk | Core supporting | Current public version; NIST states revision is in progress as of 2026 | NIST publishes successor/revision |
| STD-NIST-GENAI | NIST AI 600-1, Generative AI Profile, 2024-07-26 | Generative-AI risk profile for provider/model and application risks | Core supporting | Final public profile | NIST update or successor |
| STD-NIST-80053 | NIST SP 800-53 Rev. 5, 2020 with published errata | Security/privacy control catalog for technical and organizational crosswalk | Supporting | Public catalog available | NIST revision or CoMind control-baseline change |
| STD-NIST-SSDF-AI | NIST SP 800-218A, 2024-07-26 | Secure software-development practices tailored to generative AI/model systems | Supporting | Public final publication | NIST revision or SDLC change |
| STD-OWASP-LLM | OWASP Top 10 for LLM/GenAI Applications 2025 | Application security threat coverage for GenAI | Supporting security | Public current resource retained for LLM-specific risks | OWASP new release |
| STD-OWASP-AGENTIC | OWASP Top 10 for Agentic Applications 2026, released 2025-12 | Agentic threat model for goal hijack, tool misuse, privilege abuse, supply-chain and related autonomous-agent risks | Core agentic security | Public current resource | OWASP new release |
| STD-MITRE-ATLAS | MITRE ATLAS, living knowledge base | Adversarial AI tactics, techniques, mitigations and red-team scenario source | Supporting security / testing | Living source; version by retrieval date | Material ATLAS taxonomy update or test-plan change |

## Authoritative public sources

- ISO/IEC 42001:2023: https://www.iso.org/standard/81230.html
- ISO/IEC 23894:2023: https://www.iso.org/standard/77304.html
- ISO/IEC 27001:2022: https://www.iso.org/standard/27001
- NIST AI RMF 1.0: https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-ai-rmf-10
- NIST AI RMF program status: https://www.nist.gov/itl/ai-risk-management-framework
- NIST AI 600-1: https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence
- NIST SP 800-53 Rev. 5: https://csrc.nist.gov/pubs/sp/800/53/r5/final
- NIST SP 800-218A: https://www.nist.gov/news-events/news/2024/07/secure-software-development-practices-generative-ai-and-dual-use-foundation
- OWASP LLM/GenAI Top 10: https://genai.owasp.org/llm-top-10/
- OWASP Agentic Top 10 2026: https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/
- MITRE ATLAS: https://atlas.mitre.org/

## Applicability principles

- **Primary requirement framework:** ISO/IEC 42001:2023.
- **Risk-method support:** ISO/IEC 23894 and NIST AI RMF.
- **GenAI/agentic threat coverage:** NIST AI 600-1, OWASP LLM/GenAI Top 10, OWASP Agentic Top 10, MITRE ATLAS.
- **Security/privacy crosswalk:** NIST SP 800-53 plus ISO/IEC 27001:2022 as a supporting framework. ISO/IEC 27001 certification is not currently in scope.
- **Secure development:** existing CoMind SDLC controls plus NIST SP 800-218A.

Framework inclusion does not mean every requirement is applicable or satisfied. Applicability must be documented with rationale, owner, implementation reference, verification method, observed evidence, gap/exception status, and review date.

## Change-control rule

Living or revisable frameworks must never silently change CoMind's acceptance criteria. The ISO Compliance and Standards Officer may report a newly published version or material change, but adoption requires impact analysis and the applicable human authority. Existing evidence remains tied to the edition/version against which it was collected.

## Current controlled observations

- ISO publicly identifies ISO/IEC 42001:2023 as Edition 1, published December 2023.
- ISO publicly identifies ISO/IEC 23894:2023 as Edition 1, published February 2023.
- ISO publicly identifies ISO/IEC 27001:2022 as Edition 3, published October 2022.
- NIST states AI RMF 1.0 is being revised; therefore CoMind must track the successor rather than treating 1.0 as permanently fixed.
- OWASP's 2026 Agentic Applications Top 10 is a distinct resource from the LLM/GenAI Top 10 and is directly relevant to the Virtual Employee Foundry.
- MITRE ATLAS is a living knowledge base; evidence should record retrieval date and selected threat identifiers rather than imply a static edition.

## Management decisions recorded 2026-10-10

1. ISO/IEC 42001 is the active AIMS certification-readiness direction.
2. ISO/IEC 27001 is supporting-only for now and is not a separate certification objective.
3. Clause-level ISO/IEC 42001 implementation mapping is authorized once lawful licensed access to the normative standard is available.
4. No purchase, paid standards access, or new paid connection is authorized implicitly by this decision; cost-bearing access still requires explicit approval.

## Open items

1. Locate existing lawful licensed ISO/IEC 42001:2023 access, if any, or obtain explicit approval before any purchase/paid access.
2. Locate lawful ISO/IEC 23894:2023 access if detailed clause-level risk mapping is desired.
3. Define the cadence for standards surveillance and management approval of version changes.
4. Identify legal/regulatory frameworks applicable to eventual markets, geographies, and health-related use cases before those products enter scope.
