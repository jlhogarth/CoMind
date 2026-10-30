# HAI-007: Literature Grounding and Canonical Concept Reconciliation

Status: Specified
Production activation: false
Issue: https://github.com/jlhogarth/CoMind/issues/390
Canonical Drive document: https://docs.google.com/document/d/1s0Q5cM5Y6flbhsnW9e_OUR1PDTSNHOn2vC7hwvBW3OY/edit
Consensus broad review: https://consensus.app/search/conduct-a-rigorous-literature-grounding-and-canoni/p04nQ-DQQnKY-WrfESAq7w/
Consensus reconciliation review: https://consensus.app/search/using-the-same-hai-framework-and-literature-base-r/9Z1rpHGcRrylmgBqLAyztQ/

## Purpose

HAI-007 grounds the CoMind Human-AI Relationship Development Framework in peer-reviewed research, reconciles the seven HAI domains against established scientific constructs and the existing CoMind Canonical Concept Index, and bounds novelty claims conservatively.

The framework remains:

`interaction -> continuity -> understanding -> adaptation -> collaboration -> integration -> co-development`

The arrows are a useful developmental narrative, not a universal causal or chronological law.

## Canonical decision

The literature supports a **partially ordered progression with a multidimensional capability profile**. This preserves the seven-domain HAI vocabulary while allowing parallel development, recursion, regression, domain dependence, and uneven maturity.

A strict universal seven-step ladder is not supported by the reviewed evidence.

No new CCI concept identities are created by HAI-007. The existing concept graph already contains the principal architectural identities needed to implement and govern the framework. Reuse before reinvention applies.

Reciprocal co-development is retained as a **NOVEL-CANDIDATE research construct**, not a validated independent scientific construct and not yet a CCI concept.

## Classification vocabulary

- **ESTABLISHED**: substantial prior theory, evidence, or measurement traditions exist.
- **ADAPTED**: substantially grounded in established work but translated into the HAI context.
- **EXTENDED**: clear antecedents exist, but CoMind adds material longitudinal, governance, or cross-system scope.
- **NOVEL-CANDIDATE**: meaningful antecedents exist but discriminant evidence is insufficient for a strong novelty claim.
- **UNSUPPORTED**: the reviewed evidence does not justify representing the claim as established.

## Reconciliation matrix

| HAI domain | Literature mapping | Classification | Canonical disposition | Empirical maturity |
| --- | --- | --- | --- | --- |
| Interaction | HCI, human-AI interaction, mixed initiative, conversational systems, decision support | ESTABLISHED | Keep as HAI domain; no new CCI identity | High for bounded interaction |
| Continuity | longitudinal agents, persistent context, external/transactive memory, longitudinal personalization, coherence across encounters | EXTENDED | Keep; measure coherence separately where useful | Low to moderate for modern longitudinal AI |
| Understanding | shared mental models, common ground, team cognition, situation awareness, calibration | ADAPTED | Keep HAI label; use `shared understanding` operationally | Moderate in human-AI, stronger human-team antecedents |
| Adaptation | adaptive automation, dynamic function allocation, co-adaptation, mutual adaptation, personalization | ESTABLISHED core | Keep; separate human-to-AI, AI-to-human, and reciprocal adaptation | Moderate to high, lower for durable generative-AI reciprocity |
| Collaboration | human-autonomy teaming, human-AI teaming, complementarity, joint cognitive systems | ESTABLISHED | Keep; do not equate with equal agency | High for bounded tasks, uneven longitudinal field evidence |
| Integration | socio-technical systems, workflow integration, human-agent systems, distributed cognition, multi-agent coordination | EXTENDED | Keep as HAI domain; no new root concept | Low to moderate for deeply integrated generative agents |
| Co-development | reciprocal human-machine learning, mutual adaptation, co-regulation, symbiotic human-AI, co-learning | NOVEL-CANDIDATE | Keep as research construct; do not promote to CCI yet | Low |

## Domain boundaries

### Interaction

Interaction is established. CoMind should not claim novelty for the existence of human-AI interaction. The governance concern is that fluent task exchange can be mistaken for durable understanding or authority.

Mapping: `concept:comind` plus product and interface behavior.

### Continuity

The literature contains strong adjacent traditions for longitudinal interaction and memory, but the CoMind formulation materially extends them. Governed continuity includes provenance, correction rights, decision lineage, relevance control, authority, and portability rather than simple retention.

Mapping: `concept:continuity`, `concept:threadkeeper`, `concept:gpc`, `concept:memory-graph`, `concept:digital-twin`.

### Understanding

The closest established constructs are shared mental models, common ground, capability calibration, and related team-cognition concepts. HAI understanding is therefore best operationalized as **shared understanding** and must not imply subjective comprehension.

Mapping: `concept:digital-twin`, `concept:signal-fidelity`, `concept:eik`, `concept:gpc`.

### Adaptation

Adaptive automation and mutual adaptation are established research areas. CoMind's added requirement is that adaptation remain inspectable, correctable, reversible, and bounded by authority.

Mapping: `concept:gpc`, `concept:seal`, `concept:digital-twin`, with `concept:eik` and `concept:rpda` governing epistemic and authority boundaries.

### Collaboration

Human-AI collaboration and human-autonomy teaming are established. Meta-analytic research shows that combining human and AI does not automatically outperform the strongest solo contributor. CoMind must therefore measure complementarity, coordination cost, verification, handoff quality, and outcome quality.

Mapping: `concept:comind`, `concept:foundry`, `concept:virtual-employee`, `concept:rpda`.

### Integration

Socio-technical integration has substantial antecedents, but CoMind extends the idea into governed cross-system outcome coordination with explicit authority, observability, evidence, rollback, and recovery. Integration depth is not connector count.

Mapping: `concept:comind`, `concept:foundry`, `concept:virtual-employee`, canonical evidence, authority, and observability controls.

### Co-development

Co-development has meaningful antecedents in reciprocal learning, mutual adaptation, co-regulation, symbiotic systems, and co-creation. The CoMind synthesis is potentially distinctive because it combines longitudinal continuity, reciprocal human learning, AI contextual adaptation, governed integration, evidence, and preserved human authority. The independent construct is not yet empirically established.

Mapping: no exact current CCI identity. It remains an HAI research construct pending discriminant evidence.

## Canonical concept reconciliation

HAI-007 creates no CCI concept, split, merge, rename, or supersession.

- Interaction maps to `concept:comind` and interface behavior.
- Continuity maps to `concept:continuity`, `concept:threadkeeper`, `concept:gpc`, `concept:memory-graph`, and `concept:digital-twin`.
- Understanding maps to `concept:digital-twin`, `concept:signal-fidelity`, `concept:eik`, and `concept:gpc`.
- Adaptation maps to `concept:gpc`, `concept:seal`, `concept:digital-twin`, `concept:eik`, and `concept:rpda`.
- Collaboration maps to `concept:comind`, `concept:foundry`, `concept:virtual-employee`, and `concept:rpda`.
- Integration maps to `concept:comind`, `concept:foundry`, `concept:virtual-employee`, evidence architecture, authority, and observability.
- Co-development remains an HAI research construct without a new canonical identity.

This preserves the CCI rule that useful or similar names do not by themselves establish separate canonical concepts.

## Measurement consequences

HAI-006 remains the governing research and measurement program. HAI-007 sharpens its priorities:

1. Compare governed continuity with episodic and memory-only baselines.
2. Adapt shared mental model, common-ground, calibration, and situation-awareness measures before inventing new understanding scales.
3. Separate user learning, system personalization, base-model change, and reciprocal adaptation.
4. Compare human-only, AI-only, unstructured human-AI, and governed human-AI collaboration where feasible.
5. Measure integration through outcomes, recovery, authority integrity, observability, rollback, cognitive load, and failure surface.
6. Control co-development studies for model version, expertise, task familiarity, exposure time, and ordinary learning effects.

## Falsifiable hypotheses

**H1 Governed continuity:** Governed continuity with provenance, correction persistence, and unresolved-state tracking will reduce context reconstruction and missed commitments on longitudinal tasks versus fresh-session and memory-only baselines. Reject or weaken the claim if overhead consistently exceeds benefit or no material outcome improvement appears.

**H2 Continuity integrity:** Ungoverned continuity will preserve more stale or unsupported assumptions than governed continuity. Reject if no measurable difference exists.

**H3 Shared understanding:** Better alignment between human and AI task models will predict fewer avoidable clarification cycles and fewer goal or constraint violations. Reject if alignment adds no predictive value beyond task difficulty.

**H4 Bounded reciprocal adaptation:** Explainable, reversible, scope-bounded adaptation will improve contextual fit while preserving independent human verification better than opaque or unbounded adaptation. Reject if boundedness yields no measurable control, calibration, skill-preservation, or outcome benefit.

**H5 Governed collaboration:** Explicit roles, handoffs, evidence obligations, review points, and authority boundaries will improve complex multi-step human-AI work versus otherwise similar unstructured collaboration. Reject if governance adds cost without improving outcome quality, accountability, recovery, or calibration.

**H6 Integration value curve:** Cross-system integration will have a non-linear relationship with value because coordination benefits and failure-surface costs both rise with integration depth. Reject if risk-adjusted value improves monotonically across comparable tasks.

**H7 Integration governance:** Traceable provenance, explicit authority checks, and rollback will reduce unrecoverable accountability failures in integrated workflows. Reject if these controls do not improve recovery, attribution, or unauthorized-action rates.

**H8 Reciprocal co-development:** Longitudinal governed relationships will sometimes show simultaneous improvement in human framing, delegation, verification, or transfer and in AI contextual support after controlling for model version, familiarity, and exposure. Reject if the joint effect disappears under those controls.

**H9 Discriminant validity:** Reciprocal co-development will explain longitudinal improvement beyond ordinary human skill acquisition and ordinary software personalization considered separately. Reject it as an independent construct if no incremental explanatory value remains.

**H10 Ordering:** Strong collaboration can occur without strong continuity in some domains. Repeated counterexamples falsify continuity as a universal prerequisite and support treating it as a common facilitator instead.

## Governance implications

- Human authority remains orthogonal to maturity.
- Trust is not a stage; calibration is cross-cutting.
- Memory is not continuity.
- Personalization is not understanding.
- Adaptation is not self-authorization.
- Collaboration is not automatically superior to solo work.
- Integration is not maturity by connector count.
- Co-development does not imply consciousness, personhood, equivalence, or a right to persistence.
- Negative and contradictory evidence remains first-class evidence.
- Novelty claims remain narrower than the available evidence.

## Literature provenance

Two Consensus Pro research threads supplied the external grounding. The broad review covered human-AI interaction, human-autonomy teaming, joint cognitive systems, shared mental models, trust calibration, adaptive automation, mixed initiative, collaboration, longitudinal systems, sociotechnical integration, reciprocal learning, and co-development antecedents. The second review forced conservative classification, topology selection, falsifiable hypotheses, and a representative-paper shortlist.

Representative papers in the result set include work by Andrews and Lilly on shared mental models in human-AI teams; Schelble and Flathmann on assessing shared mental models; Zhao and Simmons on adaptation in collective human-AI teaming; Gonzalez and Donahue on a science of human-AI teaming for decision making; Vaccaro and Almaatouq on when combinations of humans and AI are useful; Riedl and Savage on cognitive spillover; Okamura and Yamada on adaptive trust calibration; Visser and Momen on mutually adaptive trust calibration; Lin and Jiang on longitudinal health AI agents; Teeni and Yahav on reciprocal human-machine learning; Morello and Chick on Human-AI Symbiotic Theory; Borghoff and Bottoni on organizational multiagent interaction; and Kargarnovin and Hernandez on moving from testbeds to high-stakes human-AI work.

Exact DOI, venue, publication year, version, and publisher metadata are not invented here. Those fields must be normalized through the governed Research Library before being treated as canonical bibliographic facts.

## Limitations

The literature is heterogeneous across domains, populations, autonomy levels, task classes, and generations of AI systems. Much evidence remains short-term, laboratory-based, simulation-based, or domain-specific. Longitudinal generative-agent and organizational evidence is comparatively thin. HAI-007 is therefore a literature-grounded conceptual reconciliation, not psychometric validation and not proof that the framework is universal.

## Acceptance result

- Seven HAI domains reconciled with external literature.
- Topology changed from potentially interpreted ladder to explicit partially ordered progression plus multidimensional profile.
- Strict universal sequencing classified as unsupported.
- Co-development bounded as NOVEL-CANDIDATE.
- Existing CCI concepts reused; no duplicate concepts introduced.
- Ten falsifiable hypotheses recorded.
- External research provenance preserved through Consensus threads.
- Canonical Drive research document created and populated.
- Production activation remains false.

## Successor research

The next HAI research work should operationalize the domains and run longitudinal validation rather than create additional conceptual labels. Priority experiments are governed-continuity baselines, shared-understanding measurement transfer, reciprocal-adaptation separation, risk-adjusted integration stress testing, and a co-development discriminant-validity study.
