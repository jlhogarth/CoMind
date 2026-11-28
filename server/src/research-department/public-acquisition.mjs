import { createHash } from 'node:crypto';

// Deliberately bounded to one public question. Internal assignments must be
// abstracted and approved separately before they can reach this dispatch path.
export const PUBLIC_QUESTION = 'durable workflows interruption recovery asynchronous agent messaging';
export const CROSSREF_ENDPOINT = 'https://api.crossref.org/works';

export class ResearchGateError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export function authorizePublicDispatch(request, provider, now = new Date()) {
  if (request?.classification !== 'public' || request?.question !== PUBLIC_QUESTION ||
      request?.attachments?.length || request?.metadata || request?.extraArguments ||
      Object.keys(request ?? {}).some(key => !['classification', 'question', 'attachments'].includes(key))) {
    throw new ResearchGateError('DISCLOSURE_DENIED');
  }
  if (provider?.id !== 'crossref' || provider?.endpoint !== CROSSREF_ENDPOINT ||
      provider?.mode !== 'FREE_ONLY' || provider?.revoked || provider?.suspended) {
    throw new ResearchGateError('PROVIDER_UNAUTHORIZED');
  }
  if (provider?.incrementalCostUsd !== 0 || provider?.paidFallback !== false ||
      provider?.freeEntitlementVerified !== true || !provider?.termsEvidenceUrl ||
      !provider?.entitlementEvidenceUrl) {
    throw new ResearchGateError('COST_UNVERIFIED');
  }
  const due = Date.parse(provider.reviewDueAt ?? '');
  if (!Number.isFinite(due) || due <= now.getTime()) {
    throw new ResearchGateError('ENTITLEMENT_STALE');
  }
  return new URL(`${CROSSREF_ENDPOINT}?query=${encodeURIComponent(PUBLIC_QUESTION)}&rows=1`);
}

function normalizeWork(item) {
  const doi = typeof item?.DOI === 'string' ? item.DOI.trim().toLowerCase() : '';
  const title = item?.title?.[0]?.trim();
  if (!/^10\.\d{4,9}\/[\w.()/:;+-]+$/i.test(doi) || !title || title.length > 500) {
    throw new ResearchGateError('INVALID_PROVIDER_METADATA');
  }
  return {
    title,
    url: `https://doi.org/${encodeURIComponent(doi)}`,
    document_identifier: doi,
    publisher: typeof item.publisher === 'string' ? item.publisher.slice(0, 500) : null,
    source_kind: 'paper',
    authority_level: 'unverified',
    lifecycle_status: 'candidate',
    // Rights unknown: retain bibliographic metadata only, never abstract/full text.
    metadata: { rights: 'unknown_metadata_only', provider: 'crossref', inspection_depth: 'metadata',
      provider_reference: typeof item.URL === 'string' ? item.URL : null },
  };
}

export async function acquirePublicMetadata({ request, provider, fetchFn = fetch, queryFn, now = new Date() }) {
  if (typeof queryFn !== 'function') throw new ResearchGateError('EVIDENCE_STORE_UNAVAILABLE');
  const url = authorizePublicDispatch(request, provider, now);
  const response = await fetchFn(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new ResearchGateError('PROVIDER_UNAVAILABLE');
  const body = await response.json();
  const item = body?.message?.items?.[0];
  const record = normalizeWork(item);
  const evidenceId = createHash('sha256').update(`${record.document_identifier}|${PUBLIC_QUESTION}`).digest('hex');
  const existing = await queryFn(
    'SELECT ref_id,document_identifier,title FROM comind.cm_research_refs WHERE document_identifier=$1 ORDER BY created_at LIMIT 2',
    [record.document_identifier],
  );
  if (existing.rows.length > 1) throw new ResearchGateError('IDENTITY_COLLISION');
  let refId = existing.rows[0]?.ref_id;
  if (!refId) {
    const created = await queryFn(
      `INSERT INTO comind.cm_research_refs
        (title,url,document_identifier,publisher,source_kind,authority_level,lifecycle_status,metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING ref_id`,
      [record.title, record.url, record.document_identifier, record.publisher,
        record.source_kind, record.authority_level, record.lifecycle_status, JSON.stringify(record.metadata)],
    );
    refId = created.rows[0]?.ref_id;
  }
  if (!refId) throw new ResearchGateError('PERSISTENCE_UNCONFIRMED');
  const readback = await queryFn(
    'SELECT ref_id,document_identifier,title FROM comind.cm_research_refs WHERE ref_id=$1', [refId],
  );
  if (readback.rows.length !== 1 || readback.rows[0].document_identifier !== record.document_identifier) {
    throw new ResearchGateError('READBACK_MISMATCH');
  }
  return { refId, doi: record.document_identifier, evidenceId, duplicate: Boolean(existing.rows.length),
    rights: 'unknown_metadata_only', readbackVerified: true, provider: 'crossref' };
}
