# Conversation History Reuse Scan

Date: 2026-10-26  
Lane: CHIST-001  
Purpose: satisfy CoMind's adapt-before-reinvent rule before extending native ChatGPT export ingestion and historical analytics.

## Executive finding

Substantial prior art exists for parsing, viewing, searching, analyzing, and converting ChatGPT exports. CoMind should reuse compatible algorithms and product patterns, but should not replace its canonical archive with an external viewer or SaaS. CoMind's requirements for immutable source evidence, topology preservation, explicit uncertainty, point-in-time comparison, certification, and governed promotion are materially stronger than the typical archive viewer.

## Open-source implementations reviewed

### Gusarovv/chatgpt-export-viewer

Repository: https://github.com/Gusarovv/chatgpt-export-viewer  
License: MIT  
Reuse value: HIGH

Useful current-format patterns:

- supports `conversations.json` and numbered `conversations-*.json` shards;
- handles nested Privacy Portal archives;
- streams large single-line JSON instead of loading the entire corpus at once;
- reconstructs the selected branch from `current_node` and parent links;
- recognizes extensionless `.dat` assets;
- reports missing attachment files explicitly;
- treats exporter format drift as expected operational reality.

CoMind adaptation decision: adopt the compatible discovery, staging, streaming, asset-coverage, and current-node validation patterns while retaining CoMind's own evidence schema and governance boundary.

### alsi-lawr/chatgpt-analysis

Repository: https://github.com/alsi-lawr/chatgpt-analysis  
License: MIT  
Reuse value: HIGH

Useful patterns:

- deterministic normalization with stable identities;
- source-file hashing and acceptance checks;
- evidence-linked coding whose findings cite source turns;
- local deterministic metrics and segmentation;
- provider-neutral optional worker queues rather than embedding model calls in ingestion;
- SQLite/FTS output for ad hoc corpus queries;
- explicit separation between deterministic evidence and model/human interpretation.

CoMind adaptation decision: reuse these concepts in the analytics/derivation layer, especially evidence-linked coding, bounded segmentation, deterministic acceptance, and model-provider separation. Do not replace CoMind's PostgreSQL canonical evidence store with SQLite; SQLite/FTS remains a useful disposable/local projection option.

## Paid/commercial implementations reviewed

### ChatKeeper

Product: https://www.martiansoftware.com/chatkeeper/  
Current license price reviewed: $29.99 one-time, with one year of updates.  
Data posture: local processing of official exports.

Useful patterns:

- active compatibility maintenance for 2026 export changes;
- numbered-shard handling;
- multimodal parsing fixes;
- incomplete-export warnings;
- local GUI/CLI archive workflow.

CoMind decision: do not make ChatKeeper canonical infrastructure. Consider buying one license as an inexpensive independent conformance oracle against real exports. It can tell us whether another actively maintained parser interprets the same archive similarly, but its output is not authoritative CoMind evidence.

### Chat Locker

Product: https://chatlocker.app/  
Pricing reviewed: local product free; Pro sync EUR 8/month or EUR 80/year.  
Reuse value: UX benchmark.

Useful patterns:

- local full-text and semantic search;
- tags, filtering, statistics, and export;
- optional encrypted multi-device sync and team workspaces.

CoMind decision: benchmark search/organization UX. Do not send canonical raw history to its cloud sync as part of CHIST.

### MemoryRouter

Product/docs: https://memoryrouter.ai/ and https://docs.memoryrouter.ai/chatgpt-import  
Pricing reviewed: $20/month after trial.  
Reuse value: workflow pattern, not canonical storage.

Useful patterns:

- local archive parsing before upload;
- deterministic selection;
- explicit review and price approval;
- resumable batches and final receipts;
- semantic memory access across multiple AI clients.

CoMind decision: adapt resumable-import, explicit-review, receipt, and cross-client memory patterns where useful. Do not substitute an external memory vault for CoMind's governed evidence and Digital Twin architecture.

### AI CTRL

Documentation: https://kb.expedient.com/docs/importing-chats-from-chatgpt-or-claude  
Reuse value: product pattern.

Useful distinction: imported chats can either recreate history or populate a knowledge base. CoMind already makes this distinction more rigorously as source evidence versus derived/promoted cognition.

## Build, borrow, buy decision

### Borrow/adapt now

- nested and sharded export discovery;
- bounded streaming parser behavior;
- extensionless asset recognition;
- explicit attachment coverage reporting;
- deterministic branch selection and validation;
- evidence-linked analytics and source-turn citations;
- bounded segmentation for later model-assisted analysis;
- acceptance receipts and resumability patterns;
- local full-text/semantic-search UX patterns.

### Keep proprietary to CoMind

- immutable archive evidence schema;
- certification boundary between technical PASS and accepted historical baseline;
- live CFR reconciliation;
- content-versus-topology point-in-time diff;
- provenance-preserving analytics and review-only promotion;
- Rulebook/memory/architecture promotion governance;
- authority and audit integration.

### Buy only as a verification accelerator

ChatKeeper is the clearest low-cost purchase candidate because it is actively maintained against current export drift, runs locally, and costs less than building an independent second parser solely for cross-checking. Purchase is optional; it is not needed for CoMind to proceed.

## Evidence boundary

External tools are references and comparison oracles. Their interpretation never overrides the preserved native export, CoMind's source hashes, or CHIST certification evidence. Any copied or substantially adapted MIT-licensed code must retain the applicable copyright and permission notice.
