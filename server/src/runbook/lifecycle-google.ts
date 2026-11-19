import { GoogleAuth } from 'google-auth-library';

export const docsReadonlyScope = 'https://www.googleapis.com/auth/documents.readonly';
const tabFields = 'tabProperties(tabId),documentTab(body(content(endIndex)))';
const fields = `documentId,revisionId,tabs(${tabFields},childTabs(${tabFields},childTabs(${tabFields},childTabs(tabProperties(tabId)))))`;
type Tab = {
  tabProperties?: { tabId?: string };
  documentTab?: { body?: unknown };
  childTabs?: Tab[];
};

export function normalizeGoogleDocsSnapshot(payload: unknown) {
  const document = payload as { documentId?: string; revisionId?: string; tabs?: Tab[] } | null;
  if (!Array.isArray(document?.tabs)) return null;
  const tabs: { tabId: string | undefined; body: unknown }[] = [];
  const flatten = (items: Tab[], depth: number) => {
    for (const tab of items) {
      if (!tab || typeof tab !== 'object' || depth > 3 || tabs.length >= 100) return false;
      tabs.push({ tabId: tab.tabProperties?.tabId, body: tab.documentTab?.body });
      if (tab.childTabs !== undefined && (!Array.isArray(tab.childTabs) || !flatten(tab.childTabs, depth + 1))) return false;
    }
    return true;
  };
  return flatten(document.tabs, 1) ? { documentId: document.documentId, revisionId: document.revisionId, tabs } : null;
}

export function createGoogleRunBookReader(
  volumeId: string,
  token: () => Promise<string | null>,
  fetchImpl: typeof fetch = fetch,
) {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(volumeId)) throw new Error('Invalid Google Docs volume ID');
  return async () => {
    const accessToken = await token();
    if (!accessToken) throw new Error('Google Docs Viewer credential unavailable');
    const url = new URL(`https://docs.googleapis.com/v1/documents/${volumeId}`);
    url.searchParams.set('includeTabsContent', 'true');
    url.searchParams.set('fields', fields);
    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Google Docs read failed (${response.status})`);
    return { snapshot: normalizeGoogleDocsSnapshot(await response.json()) };
  };
}

export function createGoogleRunBookAuth(credentialsFile: string) {
  const auth = new GoogleAuth({ keyFilename: credentialsFile, scopes: [docsReadonlyScope] });
  return async () => (await auth.getAccessToken()) ?? null;
}
