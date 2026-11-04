# CoMind AED-006: Local Step Approval and Cost Forensics Prototype

**Status:** Offline prototype. No GitHub, Supabase, browser, OpenAI API, or ChatGPT Work calls. Does not enforce a ChatGPT Work credit ceiling.

## What it does

- Accepts a ChatGPT `conversations.json` export (select a zero-based conversation index) or a simple `{"title":"...","messages":[{"role":"user","content":"..."}]}` JSON object.
- Provides a browser page with an **Approve and run ONLY step N** button. It executes one bounded analysis step per click, then stops for review.
- Step 1 validates and normalizes the active conversation branch, computes source SHA-256.
- Step 2 estimates visible tokens with `tiktoken` (required). Reports content vs approximate message framing and role tokens.
- Step 3 compares two hypothetical full-history replay scenarios (one invocation per user turn versus user turn plus tool return). These are deliberately not represented as actual Work counts.
- Step 4 ranks the largest visible contributors.
- Step 5 emits a downloadable JSON report, combining measurements, user-entered Work credits, and limitations.
- Records timestamps, approvals, statistics, and failure outcomes in `execution_audit.jsonl`, **not transcript text**.

## Requirements

Python 3.10+ (tested with standard-library implementation). `tiktoken` must be installed for step 2 and beyond. Install from the public Python package index on your computer:

```bash
python -m pip install -r requirements.txt
```

This dependency download is NOT an OpenAI inference call. Initial `tiktoken` encoding data may be fetched and cached by the library. For isolated/offline environments, provision the dependency and encoding assets beforehand. If it is missing, step 2 fails closed rather than reporting fabricated tokens.

## Run

```bash
python -m unittest -v test_analyzer.py
python app.py
```

Open **http://127.0.0.1:8765** on the same computer. Upload the JSON export, optionally enter the reported **190** Work credits, then click each approval button **one at a time**. Stop and inspect the result after every step. Save the report at the end. Close the process with Ctrl+C.

The application binds to loopback only. It cannot be reached from your iPhone unless the server and access path are deliberately changed. Do not expose this development server to the public internet.

## Data handling and safeguards

- Maximum JSON input size 25 MB; maximum 10,000 messages; maximum 2 million characters per message.
- ChatGPT branch extraction selects the active `current_node` lineage and refuses to guess when missing.
- The audit log contains report statistics and an uploaded filename, but **no transcript text**. Source contents remain in process memory, so use a trusted computer and clear state by stopping the process.
- It never reads local secrets, makes model requests, or runs Playwright. A local `tiktoken` dependency installation may access a package index.
- The `tiktoken` encoding is configured as `o200k_base`, **not a verified GPT-6 Astra encoding**.
- Approximate per-message overhead is not ChatGPT Work's authoritative framing; tool/schema instructions, images, internal reasoning, cached tokens, truncation, internal retries, and delegate activity may be missing.
- **Crucial:** This tool can explain *visible workload* and suspected context amplification, but cannot determine exact internal Work token throughput or per-operation Work credit charges. Do not equate estimated tokens with charged credits.
- If the conversation is in a full export array, only a selected entry is analyzed. No massive batch operation is started automatically.

## Next stage (not implemented, requires approval)

1. Add a provider-neutral per-operation budget estimator for CoMind-controlled API calls.
2. Add a local CDP/DOM parser behind separate per-operation approval gates, with hard byte and token limits before any model is invoked.
3. Add optional durable PostgreSQL ETCP event persistence after read-only Supabase schema inventory.
4. Compare the AED 190-credit conversation's full export to its Work Usage total without claiming unavailable charge attribution.

No production deployment, external account modifications or paid tests have been performed.

## Provider API preflight helper (optional; no requests issued)

`preflight.estimate_api_request(messages, encoding, output_cap, input_usd_per_million, output_usd_per_million, budget_usd)` performs a **local** illustrative estimate of text input and an explicitly capped output allocation for a future CoMind-controlled API request. It returns `BLOCK_ESTIMATE_EXCEEDS_BUDGET` if those estimated costs exceed the supplied budget. The rates must be independently verified and manually supplied. It does not itself enforce a provider budget, measure hidden Work usage, or call OpenAI.

For the five local forensic steps the user interface clearly displays **zero model input and output tokens queued**, because no model is used.
