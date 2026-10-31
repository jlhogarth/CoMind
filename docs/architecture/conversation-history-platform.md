# Conversation History Platform Architecture

Status: accepted architecture baseline
Date: 2026-10-26
Scope: CHIST-001 and downstream Conversation History products

## Purpose

Conversation History is foundational CoMind infrastructure. It preserves native conversational evidence, supports governed point-in-time comparison, and provides a reproducible substrate for analytics, knowledge retrieval, model training, Digital Twin ingestion, and creative experiences.

The source archive is evidence. Every interpretation, embedding, cluster, summary, training pair, memory candidate, visualization, and generated artifact is a derivation that must preserve lineage back to source evidence.

## Architecture stack

1. Evidence Archive
   - untouched OpenAI export artifact
   - source file inventory, byte counts, hashes, timestamps, and source identity
   - immutable raw conversation, node, message, topology, and attachment-reference evidence

2. Normalized Conversation History
   - stable conversation, node, message, role, timestamp, branch, content-type, and attachment projections
   - selected-branch semantics separated from whole-graph preservation
   - point-in-time comparison across exports

3. Analytical Derivations
   - deterministic metrics
   - temporal analytics
   - streaks, session duration, message/turn counts, topic recurrence, and activity patterns
   - topic clustering, taxonomy, word-frequency, phrase, entity, and semantic-map projections

4. Knowledge and Retrieval
   - chunked evidence with source citations
   - embeddings and vector retrieval
   - personal RAG
   - domain-specific knowledge bases
   - cross-application lessons learned and evidence links from GitHub, Google, Vercel, Supabase, and other governed sources

5. Training and Digital Twin Derivations
   - curated question/answer and multi-turn training sets
   - noise removal, de-duplication, policy filters, sensitivity controls, and quality scoring
   - supervised fine-tuning, LoRA/QLoRA, preference data, embedding-model training, and evaluation corpora
   - Digital Twin ingestion and style/decision-pattern modeling
   - raw archive must never be used directly as a training set without a governed curation projection

6. Creative and Visual Experiences
   - timelines, topic maps, graph views, word clouds, activity heat maps, creative-hour analysis, brainstorming streaks, and evolution views
   - conversational artifacts and generative art derived from changes in language, topics, cadence, style, interests, and work patterns
   - creative outputs remain derivations and never become source evidence

## Locked architecture rules

### Rule 1: The source model is a graph, not a flat transcript

The OpenAI `mapping` structure is preserved as authoritative source topology. Any linear transcript is a derived view.

### Rule 2: `current_node` identifies the selected branch, not the whole conversation

The selected branch may be reconstructed from `current_node`, but inactive branches, edits, regenerations, and alternate paths remain source evidence.

### Rule 3: Conversation shards form one export snapshot

A single export may contain `conversations.json` or numbered shards such as `conversations-000.json`, `conversations-001.json`, and later shards. Sharding is a transport/layout concern and does not create separate logical baselines.

### Rule 4: Raw JSON is canonical source evidence

Normalized relational structures are indexes and projections over the source. Unknown fields are preserved. No normalization step may silently discard source evidence.

### Rule 5: Message content is polymorphic

The system must not assume all messages are plain text or all `parts` are strings. Raw content and content type are preserved, while text extraction and multimodal interpretation remain derived operations.

### Rule 6: Topology and content changes are distinct facts

Content identity and graph/topology identity are hashed and compared separately. A topology change must not be mislabeled as a content change, and vice versa.

### Rule 7: Attachments have reference and asset layers

Message-level attachment references and physical export assets are separate evidence. Resolution between them is recorded when possible. Missing exported assets are reported without fabricating content.

### Rule 8: Schema drift is evidence, not normally a parser failure

Unknown fields and newly observed content types are preserved and surfaced as schema-drift telemetry. Structural contradictions that prevent provenance or topology from being established fail closed.

### Rule 9: Source evidence never promotes itself into memory or other canonical knowledge

Conversation History can propose memories, rules, decisions, assumptions, tasks, architecture relationships, and Digital Twin traits. Promotion requires a separate governed decision path with provenance.

### Rule 10: Future exports are point-in-time observations, not replacements

A later export does not overwrite an earlier baseline. New, absent, changed, and structurally changed observations are recorded explicitly. Absence never automatically asserts deletion.

## Downstream product families

### Personal Analytics and Data Visualization

Pre-buildable before the real baseline arrives:

- hourly/day-of-week activity distributions
- peak creative and development windows
- longest contiguous brainstorming or development streaks
- conversation length and depth distributions
- user/assistant turn ratios
- tool-use and attachment rates where source data permits
- topic recurrence and topic lifecycle
- project/activity timelines
- changes in response length, question style, vocabulary, and work cadence

All metrics require explicit definitions. A label such as "creative hour" is a derived metric and must document its qualifying rules rather than presenting a subjective inference as fact.

### Topic Clustering, Topic Maps, and Word Clouds

Pre-buildable pipeline:

- deterministic token/frequency baseline
- stopword and boilerplate handling
- n-gram and phrase extraction
- embedding generation
- clustering
- cluster labeling
- topic-over-time views
- cross-topic graph relationships
- word clouds as presentation, not analytical evidence

Cluster labels are interpretations. The underlying member conversations and source turns remain inspectable.

### Conversational Artifacts and Art

Conversation History may drive visual or generative artifacts such as:

- semantic constellations
- topic evolution maps
- vocabulary/style evolution
- creative-period timelines
- project birth/evolution visualizations
- density, cadence, and branching art
- before/after portraits of interests, concerns, technical depth, and working style

These are intentionally interpretive products. They must preserve the derivation recipe and source range used.

### Fine-Tuned Clones and Digital Twin Training

Training data must be produced through a governed curation stage that can:

- choose user-only, assistant-only, or paired examples depending on objective
- remove boilerplate, failed attempts, repeated debugging chatter, low-quality answers, and unsupported claims
- remove or mask sensitive information according to policy
- deduplicate near-identical examples
- score evidence quality and conversational usefulness
- preserve source turn IDs for every training example
- produce train/validation/test splits without cross-split leakage
- emit model-specific formats without altering the underlying curated dataset

Candidate training targets include open-weight small and medium language models and embedding models. Training artifacts must record base model, license, tokenizer, data version, curation policy, hyperparameters, evaluation results, and resulting adapter/model identity.

Digital Twin ingestion is broader than stylistic cloning. It may derive preferences, decision tendencies, vocabulary, knowledge domains, recurring goals, values, uncertainty behavior, and temporal change, but all such traits remain evidence-linked claims with confidence and effective-date context.

### Interactive Knowledge Bases and Personal RAG

RAG is a broad-evidence use case and should not use the same aggressive filtering as fine-tuning.

The retrieval layer should support:

- conversation and turn-aware chunking
- semantic and lexical retrieval
- metadata filters by date, topic, project, source, role, and confidence
- vector similarity plus exact-keyword search
- citations back to source conversation/node/message
- reranking
- cross-source joins to GitHub, Google Drive, Vercel, Supabase, and other governed evidence
- lessons-learned and failure/workaround retrieval
- separate knowledge bases or views by domain while retaining one canonical evidence substrate

Retrieved content is context, not truth. Answers built from RAG must preserve citation and uncertainty boundaries.

## Reuse-first implementation direction

Before implementing a subsystem from scratch, evaluate mature implementations for adaptation or integration.

Current useful patterns include:

- local ChatGPT export viewers that already handle selected-branch reconstruction, sharded exports, nested export archives, extensionless assets, and missing-file reports
- reproducible ChatGPT-analysis pipelines that produce normalized turns, SQLite/FTS indexes, deterministic metrics, evidence-linked coding, task queues, and acceptance checks
- BERTopic or equivalent embedding/topic-modeling stacks for semantic clustering
- PostgreSQL/pgvector for initial CoMind vector storage where its scale and operational profile remain appropriate
- Qdrant or equivalent dedicated vector databases if independent vector scaling becomes justified
- LlamaFactory, Axolotl, Unsloth, Hugging Face PEFT/TRL, or equivalent open tooling for governed fine-tuning rather than writing a training stack from scratch
- LlamaIndex, Haystack, LangChain, or focused internal retrieval adapters where they reduce implementation cost without weakening provenance controls

No external library or hosted service becomes authoritative merely because it is mature. License, privacy, provenance, cost, lock-in, deployment model, and failure behavior must be evaluated before adoption.

## Global derivation lineage contract

Every consequential downstream artifact should be able to identify, directly or through a durable derivation record:

- source export identity/hash
- source conversation ID
- source node/message IDs or bounded source range
- derivation type
- derivation policy/version
- code/tool version
- model/provider and prompt version when model-assisted
- configuration and filtering rules
- generated-at timestamp
- uncertainty/conflict state where applicable
- output identity/hash

This lineage applies to metrics, clusters, embeddings, RAG chunks, memories, rules, Digital Twin traits, training examples, fine-tuned adapters, visualizations, and creative artifacts.

## Acceptance posture

The real OpenAI export is a conformance and evidence corpus, not a prerequisite for basic architecture design. Synthetic fixtures should exercise known structural variants before the real export arrives. The real export then validates current emitted schema, scale, content types, attachment behavior, field drift, and unanticipated edge cases.

No real baseline is certified solely because ingestion technically succeeds. Certification remains an explicit reviewed act.