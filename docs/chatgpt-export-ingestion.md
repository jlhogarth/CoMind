# ChatGPT Export Ingestion

## Purpose

CoMind can ingest exported ChatGPT conversation history so raw conversation records can become governed base data for later analysis.

## Supported input shapes

The ingestion route accepts either:

- An object with a `conversations` array.
- A raw array of conversation objects.

For each conversation, it supports:

- `messages` arrays.
- ChatGPT export `mapping` objects where each node contains a `message`.

## Endpoint

```text
POST /api/ingest/chatgpt
```

Upload the exported JSON file as multipart form data.

## Storage behavior

- Each conversation is inserted into `comind.cm_conversation`.
- Each message is inserted into `comind.cm_message`.
- Source export metadata is preserved in record metadata.
- Message content is assembled from exported content parts.

## Provenance rule

Imported conversation history is raw base data. Later summaries, classifications, analyses, and agent outputs should be stored as derived records linked back to the original conversation and message identifiers.

## Safety rule

Review exports before ingestion. Do not commit exported conversation JSON files to the public repository.
