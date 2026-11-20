"use client";

import { useCallback, useEffect, useState } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import { verifyAedBaseline, type BaselineReport } from "@/lib/aed-monitor/baseline";
import { CoMindMark } from "@/components/CoMindMark";

type Execution = {
  execution_id: string; lane_id: string | null; workflow_run_url: string | null;
  first_at: string; last_at: string; event_count: number;
  source_sha256: string; artifact_sha256: string | null;
};
type Event = {
  sequence: number; event_at: string; kind: string; state: string | null; outcome: string | null;
  case_id: string | null; wake_source: string | null; provider: string | null;
  actual_cost_usd: string | null; elapsed_ms: number; payload_sha256: string;
};
type Page<T> = { rows: T[]; total: number; page: number; pageSize: number };
type Detail = Page<Event> & { execution: Execution; evidence_detail_limit: string };

const pageSize = 25;
function eventField(value: string | null, kind: string, appliesTo: string[]) {
  if (value !== null && value !== "") return value;
  return appliesTo.includes(kind) ? "Not recorded" : "N/A";
}
function validEvidenceUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "github.com" && url.pathname.startsWith("/jlhogarth/CoMind/actions/runs/") ? url.href : null;
  } catch { return null; }
}

export default function AedMonitorPage() {
  const [email, setEmail] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [status, setStatus] = useState("Checking session…");
  const [history, setHistory] = useState<Page<Execution> | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [eventPage, setEventPage] = useState(1);
  const [kind, setKind] = useState("");
  const [state, setState] = useState("");
  const [busy, setBusy] = useState(false);
  const [linkState, setLinkState] = useState<"idle" | "sending" | "sent" | "limited">("idle");
  const [verification, setVerification] = useState<BaselineReport | null>(null);
  const [verifying, setVerifying] = useState(false);

  const load = useCallback(async (path: string) => {
    const client = getBrowserSupabaseClient();
    const { data: { session }, error } = await client.auth.getSession();
    if (error || !session) { setSignedIn(false); throw new Error("Sign in to inspect AED monitoring evidence."); }
    setSignedIn(true);
    const response = await fetch(path, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error("AED access denied. Verify your operator authorization.");
      throw new Error(`AED retrieval failed (HTTP ${response.status}).`);
    }
    return response.json();
  }, []);

  useEffect(() => {
    let active = true;
    setBusy(true);
    load(`/api/aed/executions?page=${historyPage}&pageSize=${pageSize}`)
      .then((result) => { if (active) { setHistory(result); setStatus(""); } })
      .catch((error) => { if (active) setStatus(error instanceof Error ? error.message : "AED retrieval failed."); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [historyPage, load, signedIn]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    setBusy(true);
    const params = new URLSearchParams({ page: String(eventPage), pageSize: String(pageSize) });
    if (kind) params.set("kind", kind);
    if (state) params.set("state", state);
    load(`/api/aed/executions/${selected}?${params}`)
      .then((result) => { if (active) { setDetail(result); setStatus(""); requestAnimationFrame(() => document.getElementById("aed-execution-detail")?.scrollIntoView({ block: "start" })); } })
      .catch((error) => { if (active) setStatus(error instanceof Error ? error.message : "AED detail failed."); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [selected, eventPage, kind, state, load]);

  async function sendLink(event: React.FormEvent) {
    event.preventDefault();
    if (linkState !== "idle") return;
    setLinkState("sending");
    setStatus("Sending sign-in link…");
    try {
      const { error } = await getBrowserSupabaseClient().auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: new URL("/aed", window.location.origin).href, shouldCreateUser: false },
      });
      if (error) throw error;
      setLinkState("sent");
      setStatus("Sign-in link sent. Open the newest email link once in this same browser.");
    } catch (error) {
      if (typeof error === "object" && error !== null &&
          (("status" in error && error.status === 429) ||
           ("code" in error && error.code === "over_email_send_rate_limit"))) {
        setLinkState("limited");
        setStatus("Supabase has temporarily limited sign-in emails. Use the newest unused link if available, or wait and refresh this page before requesting another.");
      } else {
        setLinkState("idle");
        setStatus("Sign-in link could not be sent. Try again later.");
      }
    }
  }

  async function verifyBaseline() {
    if (verifying) return;
    setVerifying(true);
    setVerification(null);
    setStatus("Reading and reconciling all AED-007 baseline pages…");
    try {
      const report = await verifyAedBaseline(load);
      setVerification(report);
      setStatus(report.passed ? "Baseline readback passed." : "Baseline readback found a mismatch. See the results below.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Baseline readback failed.");
    } finally {
      setVerifying(false);
    }
  }

  function openExecution(id: string) {
    if (selected === id && detail) {
      document.getElementById("aed-execution-detail")?.scrollIntoView({ block: "start" });
      return;
    }
    setStatus(`Opening execution ${id}…`);
    setDetail(null);
    setEventPage(1);
    setSelected(id);
  }

  return <main className="aed-shell">
    <header className="aed-header"><CoMindMark compact /><div><a href="/">CoMind Control Plane</a><h1>AED monitoring evidence</h1><p>Read-only execution and event history</p></div></header>
    {status && <p role="status" className="aed-notice">{status}</p>}
    {!signedIn && <form onSubmit={sendLink} className="aed-panel"><label>Email for operator sign-in <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><button type="submit" disabled={linkState !== "idle"}>{linkState === "sending" ? "Sending sign-in link…" : linkState === "sent" ? "Link sent" : linkState === "limited" ? "Email limit reached" : "Send sign-in link"}</button></form>}
    {signedIn && <button type="button" onClick={async () => { await getBrowserSupabaseClient().auth.signOut(); setSignedIn(false); setHistory(null); setDetail(null); setSelected(null); setVerification(null); }}>Sign out</button>}
    {signedIn && <section className="aed-panel"><h2>AED-007 baseline acceptance</h2><p>Read all eleven event pages through your operator session and compare the three original executions with independently recorded database digests. This checks recorded hashes and timestamps; it does not rehash raw private payloads.</p><button type="button" onClick={verifyBaseline} disabled={verifying}>{verifying ? "Verifying baseline…" : "Verify 246 baseline events"}</button>
      {verification && <div role="status"><p>{verification.passed ? "PASS" : "FAIL"} · Checked {verification.checkedAt} · {verification.results.reduce((sum, row) => sum + row.received, 0)} of 246 baseline events read</p><ul>{verification.results.map((row) => <li key={row.id}>{row.passed ? "PASS" : "FAIL"} · {row.id} · {row.received}/{row.expected} events · {row.pages} pages · {row.reason}</li>)}</ul></div>}
    </section>}
    {busy && <p role="status">Loading AED evidence…</p>}
    {history && <section className="aed-panel"><h2>Execution history</h2><div className="aed-scroll"><table><thead><tr><th>Execution</th><th>Lane</th><th>First event</th><th>Last event</th><th>Events</th><th>Evidence</th></tr></thead><tbody>
      {history.rows.map((row) => <tr key={row.execution_id}><td><button type="button" aria-label={`Open execution ${row.execution_id}`} onClick={() => openExecution(row.execution_id)}>View {row.execution_id}</button></td><td>{row.lane_id ?? "Unknown"}</td><td>{row.first_at}</td><td>{row.last_at}</td><td>{row.event_count}</td><td>{validEvidenceUrl(row.workflow_run_url) ? <a href={validEvidenceUrl(row.workflow_run_url)!} target="_blank" rel="noreferrer">Run</a> : "No run link"}</td></tr>)}
    </tbody></table></div><p>Page {historyPage} of {Math.max(1, Math.ceil(history.total / pageSize))}</p><button disabled={historyPage <= 1} onClick={() => setHistoryPage(historyPage - 1)}>Previous</button><button disabled={historyPage * pageSize >= history.total} onClick={() => setHistoryPage(historyPage + 1)}>Next</button></section>}
    {detail && <section id="aed-execution-detail" className="aed-panel" tabIndex={-1}><h2>Execution {detail.execution.execution_id}</h2><p>Source SHA-256: <code>{detail.execution.source_sha256}</code></p><p>Artifact SHA-256: <code>{detail.execution.artifact_sha256 ?? "Unavailable"}</code></p><p>{detail.evidence_detail_limit}</p>
      <p><strong>Cost evidence:</strong> {detail.rows.filter((row) => row.actual_cost_usd !== null).length} of {detail.rows.length} events on this page have a recorded USD charge. The approved event view does not include token usage. A USD estimate cannot be calculated from elapsed time, output bytes, or heartbeats. Reconcile provider billing or Work usage records by execution and time window. “N/A” below means the field does not describe that event type; “Not recorded” means no value was captured.</p>
      <div className="aed-filters"><label>Event type <input value={kind} onChange={(event) => { setKind(event.target.value); setEventPage(1); }} /></label><label>State <input value={state} onChange={(event) => { setState(event.target.value); setEventPage(1); }} /></label></div>
      <div className="aed-scroll"><table><thead><tr><th>Sequence</th><th>Timestamp</th><th>Type</th><th>State</th><th>Outcome</th><th>Case</th><th>Wake</th><th>Provider</th><th>Recorded charge USD</th><th>Elapsed ms</th><th>Payload SHA-256</th></tr></thead><tbody>
        {detail.rows.map((row) => <tr key={row.sequence}><td>{row.sequence}</td><td>{row.event_at}</td><td>{row.kind}</td><td>{eventField(row.state, row.kind, ["aed_event"])}</td><td>{eventField(row.outcome, row.kind, ["aed_event"])}</td><td>{eventField(row.case_id, row.kind, ["aed_event"])}</td><td>{eventField(row.wake_source, row.kind, ["aed_event"])}</td><td>{eventField(row.provider, row.kind, ["preflight"])}</td><td>{row.actual_cost_usd ?? "Not recorded"}</td><td>{row.elapsed_ms}</td><td><code>{row.payload_sha256}</code></td></tr>)}
      </tbody></table></div><p>{detail.total} matching events. Page {eventPage} of {Math.max(1, Math.ceil(detail.total / pageSize))}.</p><button disabled={eventPage <= 1} onClick={() => setEventPage(eventPage - 1)}>Previous</button><button disabled={eventPage * pageSize >= detail.total} onClick={() => setEventPage(eventPage + 1)}>Next</button>
    </section>}
  </main>;
}
