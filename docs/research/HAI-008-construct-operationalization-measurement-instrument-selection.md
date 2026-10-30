# HAI-008: Construct Operationalization and Measurement Instrument Selection

Status: Specified
Production activation: false
Schema mutation: none
Runtime mutation: none
Issue: https://github.com/jlhogarth/CoMind/issues/397
Canonical Drive document: https://docs.google.com/document/d/16fWH-4Oqan1wk873PNUADmD69AxwRacpozuolYVNtcI/edit

## Purpose

HAI-008 translates the literature-grounded Human-AI Relationship Development Framework into an empirically testable measurement system. It operationalizes interaction, continuity, shared understanding, adaptation, collaboration, integration, and reciprocal co-development while preserving the HAI-007 decision that these are domains in a partially ordered progression with a multidimensional capability profile, not seven mandatory stages.

The governing measurement principle is triangulation. No HAI domain is established by self-report alone. Wherever feasible, evidence combines objective outcomes, behavioral telemetry, ground-truth probes, self-report, expert coding, and governance evidence.

## Measurement doctrine

1. Measure capability and governance separately. High performance cannot erase authority, provenance, correction, or recovery failures.
2. Use multimethod measurement. Every major HAI claim should include at least one behavioral or objective measure in addition to self-report.
3. Prefer validated instruments and established measurement traditions over invented scales.
4. Do not equate trust with trustworthiness. Appropriate reliance requires calibration against actual system capability and observed reliance behavior.
5. Do not equate memory with continuity. Continuity includes successful state resumption, correction persistence, provenance, relevance, commitment preservation, and unresolved-state recovery.
6. Do not equate personalization with adaptation. Adaptation must be attributable to experience and distinguished from fixed preferences, model upgrades, prompt changes, and ordinary familiarity.
7. Do not equate collaboration with satisfaction. Collaboration claims require outcome, coordination, verification, and complementarity evidence.
8. Do not equate integration with connector count. Integration is governed outcome coordination across system boundaries.
9. Reciprocal co-development requires evidence of both human-side development and AI-support-side development under longitudinal controls.
10. No single HAI maturity score is permitted until construct structure, weighting, invariance, and predictive validity are demonstrated.

## Construct operationalization

### Interaction

Operational definition: quality and effectiveness of bounded human-AI exchange during a task or episode.

Primary measures include task success, accuracy, completeness, time to completion, error and rework rate, clarification turns, unnecessary turns, recovery rate, inspection-before-use behavior, corrections, follow-up specificity, information seeking, and reliance or rejection decisions.

Boundary: high-quality interaction does not establish continuity, shared understanding, adaptation, or collaboration.

### Continuity

Operational definition: preservation of relevant state, intent, commitments, corrections, provenance, and unresolved work across sessions or interruptions.

Primary measures include:
- resume accuracy
- context reconstruction effort
- commitment recall
- unresolved-item carry-forward accuracy
- correction persistence
- stale-assumption persistence
- contradiction rate
- provenance coverage
- source-to-memory traceability
- relevance precision and relevance recall
- recovery after deliberate interruption or context loss

Required comparators are fresh-session AI, memory-only AI without full continuity governance, and governed continuity.

Boundary: retaining more information is not necessarily better continuity.

### Shared understanding

Operational definition: useful alignment between human and AI models of task state, goals, constraints, roles, capabilities, limitations, expectations, and uncertainty.

Recommended methods include task-specific ground-truth probes, matched human and AI task-state summaries, concept mapping, structured knowledge representations, network similarity, capability-estimation calibration, constraint recall, disagreement detection, and unknown recognition.

Shared mental model measures have known convergent-validity limitations. Structural measures should therefore be paired with task-state or behavioral measures.

Boundary: shared understanding is calibrated operational alignment, not a claim of subjective mutual experience.

### Adaptation

Operational definition: experience-dependent change in human behavior, AI-support behavior, or both.

Measurement must separate:
- human-to-AI adaptation
- AI-to-human adaptation
- reciprocal adaptation

Primary measures include repeated-task performance slope, avoidable clarification reduction, feedback uptake, repeated-error recurrence, personalization accuracy, correction generalization, reversibility, scope compliance, transfer to novel tasks, persistence after temporal interruption, and performance after rollback.

Required confounds and controls include base-model version, system-prompt version, tool and retrieval changes, task difficulty, user practice, prior expertise, exposure duration, and interface changes.

### Collaboration

Operational definition: coordinated division of cognitive or operational work that produces joint outcomes through roles, handoffs, verification, communication, and complementary contribution.

Objective measures include complementarity gain relative to the best solo baseline, outcome quality against human-only and AI-only conditions, coordination cost, handoff error rate, review coverage, conflict resolution, decomposition quality, role violations, escalation correctness, contribution balance when relevant, and recovery after misleading or failed teammate output.

Subjective candidates are the Perceived Cooperativity Scale and Teaming Perception Scale, subject to verified usage rights.

Boundary: perceived cooperativity alone does not demonstrate superior collaboration.

### Integration

Operational definition: governed coordination across tools, systems, data, agents, and organizational boundaries to produce an outcome.

Primary measures include end-to-end task success, manual handoff failure, unauthorized-action rate, permission violations, provenance completeness, observability coverage, rollback success, recovery time, recovery completeness, state reconciliation accuracy, cross-system contradiction rate, failure containment, cognitive workload, coordination overhead, and the percentage of actions attributable to an actor, authority, and evidence.

Boundary: integration quality is risk-adjusted governed outcome performance, not the number of integrations.

### Reciprocal co-development

Operational definition: longitudinal improvement in the joint capability of a governed human-AI relationship that includes measurable human development and measurable AI-support development beyond ordinary learning, familiarity, personalization, or model upgrades.

Human-side measures include problem framing, decomposition, delegation, verification, confidence calibration, metacognitive monitoring, domain learning, transfer, unaided performance, and skill retention.

AI-support-side measures include contextual fit, unnecessary clarification reduction, appropriate retrieval and memory use, correction persistence and generalization, support calibration to expertise, repeated-error reduction, escalation quality, and support on novel related tasks.

Joint measures include complementarity gain over time, joint performance slope, interaction between human and AI-support improvement, transfer, persistence, and recovery from removed or stale context.

Discriminant-validity rule: reciprocal co-development is not established if improvement is fully explained by user practice, system personalization alone, model upgrades, prompt changes, or repeated exposure.

## Instrument selection register

### NASA Task Load Index, NASA-TLX

Disposition: ACCEPT for workload measurement.

NASA documents TLX as open source and available for use or modification without permission. HAI uses it post-task or post-session, especially in collaboration and integration comparisons. Preserve its dimensions when diagnostic interpretation matters. Workload is not a maturity score.

### Trust in AI Scale, TAIS

Disposition: RECOMMENDED CANDIDATE for AI-specific self-reported trust.

Source: Wischnewski, Doebler, and Krämer, 2026. DOI: 10.1080/29974100.2026.2715475.

TAIS is a validated multidimensional instrument covering global trust and facets including ability, integrity, transparency, unbiasedness, and vigilance. HAI should administer it at selected longitudinal checkpoints rather than after every micro-task.

Boundary: TAIS does not by itself measure calibration. Pair it with actual system correctness and behavioral reliance. Verify scoring and reproduction terms before deploying item text.

### Jian, Bisantz, and Drury Trust in Automated Systems scale

Disposition: OPTIONAL LEGACY COMPARATOR.

Source DOI: 10.1207/S15327566IJCE0401_04.

Use when historical comparability with automation-trust research is important. Do not assume transfer validity to all contemporary generative or agentic systems.

### Perceived Cooperativity Scale, PCS, and Teaming Perception Scale, TPS

Disposition: RECOMMENDED CANDIDATES for subjective collaboration quality.

Source: Attig and colleagues, 2026. DOI: 10.1080/10447318.2026.2739657.

Use after representative teaming tasks and pair with objective complementarity and coordination measures. Verify instrument reproduction and use rights before copying item text.

### SAGAT and task-state probing

Disposition: RECOMMENDED METHOD FAMILY for controlled shared-understanding measurement.

Recent synthesis: Moens et al., 2026. DOI: 10.1177/00187208251412110.

HAI should construct domain-specific probes tied to explicit ground truth. SAGAT is a method rather than a universal fixed questionnaire.

### Shared mental model structural methods

Disposition: RECOMMENDED METHOD FAMILY WITH MULTIMETHOD CAUTION.

Candidate methods include concept mapping, paired ratings, causal mapping, structured knowledge elicitation, and network similarity. Meta-analytic evidence connects shared mental models to team process and performance, while research also shows that alternative SMM measures can exhibit weak convergent validity.

Sources include DeChurch and Mesmer-Magnus, DOI 10.1037/a0017455; Ross and Allen, DOI 10.3758/s13428-012-0201-5; Andrews et al., DOI 10.1080/1463922X.2022.2061080.

### Human-Autonomy Team trust toolkit

Disposition: RESEARCH SUPPORT for multimodal trust measurement.

Source: Krausman et al., 2022. DOI: 10.1145/3530874.

Physiological sensing is not required by the minimum HAI battery because it adds privacy burden, operational complexity, and interpretation risk without being necessary for the current hypotheses.

## Instrument rights and adaptation rule

Instrument item text must not be copied into CoMind product or study materials until publication licenses, author terms, or explicit permission are verified. Open access to an article does not establish unrestricted instrument-reproduction rights. NASA-TLX is documented here as an open-use exception.

## Comparator design

Continuity:
1. Fresh-session AI with no retained context.
2. Memory-only AI without full continuity governance.
3. Governed-continuity AI.

Collaboration:
1. Human only.
2. AI only.
3. Unstructured human-AI interaction.
4. Governed human-AI collaboration with roles, evidence obligations, and review points.

Adaptation:
1. Fixed AI support with repeated human exposure.
2. Adaptive AI support.
3. Reciprocal condition in which both human practice and AI support can change.
4. Rollback or transfer condition to test persistence and causality.

Integration:
1. Single-system task where feasible.
2. Multi-system workflow without enhanced governance.
3. Governed integrated workflow with authority, provenance, observability, and rollback.

Co-development requires longitudinal model and system version logs and should use crossover, interrupted time series, or matched control designs where feasible, including novel-task transfer and unaided human performance.

## Minimum viable HAI pilot battery

Baseline:
- prior AI use and relevant domain experience
- independent human task baseline
- confidence calibration
- task-relevant skill measure
- condition and authority profile
- model, tool, prompt, and memory-state versions

Every representative task:
- task success and rubric score
- completion time
- errors and rework
- clarification turns
- reliance, rejection, and override decisions
- participant confidence at defined decision points
- AI confidence or uncertainty when defined
- authority violations and escalation correctness
- provenance coverage
- correction events

End of representative task or session:
- NASA-TLX
- task-specific shared-understanding probes
- brief qualitative failure or surprise note

Collaboration sessions:
- PCS and TPS, subject to verified terms
- complementarity gain against solo baselines
- coordination and handoff measures

Trust checkpoints:
- TAIS at predefined milestone sessions
- behavioral calibration against system correctness
- overreliance on incorrect or contraindicated AI output
- underreliance on correct output when reliance is appropriate

Continuity checkpoint after interruption:
- resume accuracy
- context reconstruction effort
- correction persistence
- unresolved commitment recovery
- stale-assumption persistence
- provenance traceability

End-of-pilot transfer:
- novel but related task
- unaided human task where appropriate
- adapted AI-support task with prior context held constant
- post-pilot skill and calibration measure

## Full longitudinal battery

The full program adds repeated task blocks, scheduled continuity interruptions, sparse structured-knowledge elicitation, repeated trust and teaming measures at preregistered points, selected workload measurements, human learning and transfer assessments, AI-support adaptation metrics, confidence and reliance calibration, governance events, failure injection, system-version ledgers, structured qualitative debriefs, and delayed follow-up.

Provisional measurement times are T0 baseline, T1 first bounded interaction block, T2 initial continuity exposure, T3 representative collaboration and adaptation exposure, T4 midpoint, T5 pre-transfer, T6 novel-task and unaided transfer, T7 endpoint, and T8 delayed follow-up where feasible.

Self-report should remain sparse enough to limit measurement reactivity and participant burden. Objective telemetry should be continuous where feasible.

## Scoring and interpretation

- Report multidimensional domain profiles rather than a global HAI score.
- Predeclare primary and secondary outcomes.
- Follow validated source scoring for reused instruments.
- Do not create ad hoc weighted sums across unrelated constructs.
- Report reliability for multi-item scales in the actual sample.
- Report confidence intervals and effect sizes, not significance alone.
- Preserve raw component measures for later reanalysis.
- Keep performance, calibration, workload, governance, and subjective experience separable.
- Governance failure cannot be averaged away by high performance.
- High reported trust is not evidence of appropriate trust.
- Shared-understanding measurement requires an explicit reference model.
- Co-development requires longitudinal incremental explanatory value beyond ordinary human learning and software personalization.
- Classify missing data by source. Instrumentation failure is an evidence-quality event and must not be silently imputed.
- Proposed low, medium, or high maturity cut points remain unsupported until criterion validity is demonstrated.

## Statistical strategy

Early pilots should emphasize descriptive distributions, confidence intervals, effect sizes, within-person change, between-condition comparisons, reliability, calibration curves, error-type analysis, and mixed-effects models when repeated observations support them.

Longitudinal validation should use multilevel growth models, piecewise models around system-version changes, transfer and persistence contrasts, measurement-invariance tests when latent constructs are compared over time, sensitivity analyses excluding model transitions, and preregistered discriminant-validity tests for reciprocal co-development. Latent growth or structural models should be used only when sample size and measurement quality justify them.

## Data and instrumentation requirements

HAI-008 specifies evidence requirements but does not create or authorize a new database or runtime.

Measured events should be linkable to a pseudonymous participant or test actor, study and condition, session, task and task version, timestamp, system or model version, system-prompt or policy version when material, toolchain version, memory or continuity condition, authority profile, action or observation type, source and provenance references, correction or contradiction linkage, outcome label, confidence or uncertainty when collected, human reliance decision, governance event type, and instrumentation quality status.

Privacy rule: collect the minimum data required for the research question, separate identity from research event data, and define consent, retention, access, correction, withdrawal, and deletion rules before real participant data collection.

## Ground truth

Every objective accuracy metric requires a declared reference such as deterministic ground truth, expert adjudication, blinded rubric scoring, consensus panel judgment, or an externally validated dataset.

LLM-as-judge may assist analysis but cannot silently become the sole ground truth for complex semantic constructs. Preserve judge model and version, prompt, uncertainty, and inter-judge or human validation evidence when it is used.

## Ethics and governance

HAI-008 makes no IRB determination. Studies involving real participants, longitudinal personal histories, behavioral adaptation, or relationship data may trigger formal human-subject research requirements depending on institutional, publication, jurisdictional, and study-purpose factors.

Before a real participant study, establish informed consent, disclosure of retained history and adaptation, correction and withdrawal mechanisms, data minimization, research-identity separation, authority boundaries, debriefing for deception or failure injection, system-version logging, harmful-behavior handling, and explicit prohibition on optimizing dependency, engagement, or relationship persistence as a proxy for healthy co-development.

## Acceptance result

- All seven HAI domains operationalized.
- Multimethod evidence rule established.
- Candidate validated and established instruments identified without overclaiming transfer validity.
- NASA-TLX accepted for workload with documented open-use status.
- TAIS selected as preferred current AI-specific trust candidate with behavioral calibration required.
- PCS and TPS selected as collaboration candidates subject to use-right verification.
- SAGAT-style probes and structural shared-mental-model methods selected for shared understanding.
- Comparator conditions defined for continuity, adaptation, collaboration, integration, and co-development.
- Minimum viable pilot battery specified.
- Full longitudinal battery and timing schedule specified.
- Scoring, missing-data, ground-truth, and statistical interpretation rules specified.
- Single-number HAI maturity scoring prohibited pending validation.
- Data and instrumentation requirements specified without creating a parallel evidence system.
- No Production activation, schema mutation, or runtime mutation authorized.

## Successor

HAI-009 should convert this specification into an executable controlled pilot protocol and instrumentation map. It should select the first task domain, preregister hypotheses and outcomes, finalize exact instrument permissions and forms, define sample and analysis assumptions, map telemetry fields onto the canonical evidence architecture, and specify Test-only implementation needed for the pilot.

## Representative references

- Wischnewski, M.; Doebler, P.; Krämer, N. 2026. Development and validation of the Trust in AI Scale. DOI: 10.1080/29974100.2026.2715475.
- Jian, J.-Y.; Bisantz, A. M.; Drury, C. G. 2000. Foundations for an Empirically Determined Scale of Trust in Automated Systems. DOI: 10.1207/S15327566IJCE0401_04.
- NASA Human Systems Integration Division. NASA Task Load Index.
- Moens, L. L. et al. 2026. Measuring Situation Awareness: A Meta-Review Across Domains. DOI: 10.1177/00187208251412110.
- DeChurch, L. A.; Mesmer-Magnus, J. 2010. Measuring Shared Team Mental Models: A Meta-Analysis. DOI: 10.1037/a0017455.
- Ross, S. J.; Allen, N. J. 2012. Examining the convergent validity of shared mental model measures. DOI: 10.3758/s13428-012-0201-5.
- Andrews, R. W. et al. 2023. The role of shared mental models in human-AI teams. DOI: 10.1080/1463922X.2022.2061080.
- Krausman, A. S. et al. 2022. Trust Measurement in Human-Autonomy Teams. DOI: 10.1145/3530874.
- Attig, C. et al. 2026. Measuring Successful Cooperation in Human-AI Teamwork. DOI: 10.1080/10447318.2026.2739657.
- Vaccaro, M.; Almaatouq, A.; Malone, T. 2024. When combinations of humans and AI are useful. DOI: 10.1038/s41562-024-02024-1.
- Te'eni, D. et al. Reciprocal Human-Machine Learning. DOI: 10.1287/mnsc.2022.03518.
- Lin, G. et al. 2026. A framework for longitudinal health AI agents. DOI: 10.1038/s44360-026-00141-x.
