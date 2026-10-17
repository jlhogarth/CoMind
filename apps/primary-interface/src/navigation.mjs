const entities = new Set(['attention', 'lanes', 'ves', 'runbook', 'evidence']);
export function routeFor(entity, id, filters = {}) {
  if (!entities.has(entity)) throw new TypeError('Unknown entity');
  const query = new URLSearchParams();
  for (const key of ['q', 'state']) if (typeof filters[key] === 'string' && filters[key]) query.set(key, filters[key]);
  return `/${entity}${id == null ? '' : `/${encodeURIComponent(id)}`}${query.size ? `?${query}` : ''}`;
}
export function parseRoute(value) {
  const url = new URL(value, 'https://interface.invalid');
  const parts = url.pathname.split('/');
  if (parts.length < 2 || parts.length > 3 || !entities.has(parts[1])) return null;
  try {
    const id = parts.length === 3 ? decodeURIComponent(parts[2]) : null;
    if (id === '') return null;
    return { entity: parts[1], id, filters: { q: url.searchParams.get('q') || '', state: url.searchParams.get('state') || '' } };
  } catch { return null; }
}
