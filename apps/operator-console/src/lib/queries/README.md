# Query kernel invariants

- Reads are bounded by a maximum page size.
- Relation, sort, and filter column names must pass identifier validation.
- Browser reads remain subject to Supabase grants and Row Level Security.
- Query failures are surfaced rather than retried with elevated browser credentials.
- Mutation and arbitrary SQL execution are not part of OC-001.
