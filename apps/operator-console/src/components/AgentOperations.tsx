"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";

type Operations = {
  worker: { state: string; completed_at: string } | null;
  aed: { task_id: string; fencing_epoch: number; disposition: string; observed_at: string; result_evidence_id: string | null }[];
  approvals: { proposal_id: string; purpose: string; model_or_service: string; proposal_status: string; awaiting_decision: boolean; link_expires_at: string | null; authorization_decision_id: string | null }[];
  ideas: { idea_id: string; title: string; description: string; queued_for_review_at: string | null; decision: string | null; basis: string | null }[];
};

const portal = "https://approvals.comindinc.com";
function operationsClient() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== "https://sbgfuanxiqepcoboxzcl.supabase.co") {
    throw new Error("Agent operations requires CoMind Test");
  }
  return getBrowserSupabaseClient();
}
const dateTime = (value: string) => new Date(value).toLocaleString();

function IdeaReview({ ideaId, onSave }: {
  ideaId: string;
  onSave: (ideaId: string, decision: string, basis: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    try { await onSave(ideaId, String(fields.get("decision")), String(fields.get("basis"))); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit}>
    <label>Disposition <select name="decision">
      <option value="planning_candidate">Accept for planning</option>
      <option value="declined">Decline</option>
    </select></label>{" "}
    <label>Reason <input name="basis" minLength={3} maxLength={1000} required /></label>{" "}
    <button className="hud-refresh" disabled={busy}>Record disposition</button>
  </form>;
}

export function AgentOperations() {
  const [snapshot, setSnapshot] = useState<Operations | null>(null);
  const [signedInUser, setSignedInUser] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [submissionKey, setSubmissionKey] = useState<string | null>(null);

  const currentUser = useRef<string | null>(null);
  const refreshSequence = useRef(0);

  async function refresh() {
    const user = currentUser.current;
    const request = ++refreshSequence.current;
    if (!user) return;
    const { data, error } = await operationsClient().rpc("operator_agent_operations");
    if (user !== currentUser.current || request !== refreshSequence.current) return;
    if (error) {
      setSnapshot(null);
      setMessage(error.code === "42501" ? "Agent operations requires an authorized Test operator." : "Agent operations is unavailable.");
      return;
    }
    setSnapshot(data as Operations);
  }

  useEffect(() => {
    try {
      const client = operationsClient();
      const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
        const user = session?.user.id ?? null;
        if (user === currentUser.current) return;
        currentUser.current = user;
        refreshSequence.current++;
        setSignedInUser(user);
        setSnapshot(null);
        setMessage("");
      });
      return () => subscription.unsubscribe();
    } catch {
      setMessage("Test operator sign-in is unavailable.");
    }
  }, []);

  useEffect(() => {
    if (!signedInUser) return;
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(interval);
  }, [signedInUser]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email")).trim();
    setSending(true);
    try {
      const { error } = await operationsClient().auth.signInWithOtp({
        email, options: { emailRedirectTo: new URL("/agent-work", window.location.origin).href, shouldCreateUser: false },
      });
      setMessage(error ? "Could not send the Test sign-in link." : "Open the sign-in link in this browser.");
    } catch { setMessage("Test operator sign-in is unavailable."); }
    finally { setSending(false); }
  }

  async function submitIdea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const key = submissionKey ?? crypto.randomUUID();
    setSubmissionKey(key);
    setSending(true);
    try {
      const { error } = await operationsClient().rpc("operator_submit_agent_idea", {
        p_submission_key: key, p_title: fields.get("title"), p_description: fields.get("description"),
      });
      if (error) throw error;
      form.reset();
      setSubmissionKey(null);
      setMessage("Idea recorded. The worker will prepare it for review.");
      await refresh();
    } catch { setMessage("The submission could not be confirmed. Retry with the same content."); }
    finally { setSending(false); }
  }

  async function dispose(ideaId: string, decision: string, basis: string) {
    try {
      const { error } = await operationsClient().rpc("operator_dispose_agent_idea", {
        p_idea_id: ideaId, p_decision: decision, p_basis: basis,
      });
      if (error) throw error;
      setMessage("Disposition recorded.");
      await refresh();
    } catch { setMessage("The disposition could not be confirmed. Refresh and check the idea."); }
  }

  return <section aria-labelledby="agent-operations">
    <h2 id="agent-operations">Agent operations</h2>
    {message && <p role="status">{message}</p>}
    {!signedInUser && <form onSubmit={signIn}>
      <label>Test operator email <input type="email" name="email" required /></label>{" "}
      <button className="hud-refresh" disabled={sending}>Send sign-in link</button>
    </form>}
    {snapshot && <>
      <p>Persistent Test worker {snapshot.worker ? <strong>{snapshot.worker.state}</strong> : "has no recorded heartbeat"}.
        {snapshot.worker && <> Last completed cycle {dateTime(snapshot.worker.completed_at)}.</>}</p>
      <h3>AED reconciliation</h3>
      {snapshot.aed.length === 0 ? <p>No stalled claims recorded.</p> : <ul>
        {snapshot.aed.map(item => <li key={item.task_id + ":" + item.fencing_epoch + ":" + item.disposition}>
          <code>{item.task_id}</code> · Epoch {item.fencing_epoch} · {item.disposition.replaceAll("_", " ")} · {dateTime(item.observed_at)}
          {item.result_evidence_id && <> · Evidence <code>{item.result_evidence_id}</code></>}
        </li>)}
      </ul>}
      <h3>Approval inbox</h3>
      <p><a href={portal}>Open the approval portal</a>. Use the original one-time link for a pending decision.</p>
      {snapshot.approvals.length === 0 ? <p>No approval proposals recorded.</p> : <ul>
        {snapshot.approvals.map(item => <li key={item.proposal_id}>
          <strong>{item.model_or_service}</strong> · {item.awaiting_decision ? "Awaiting decision" : item.proposal_status.replaceAll("_", " ")}
          {item.awaiting_decision && item.link_expires_at && <> · Link expires {dateTime(item.link_expires_at)}</>}
          <p>{item.purpose}</p>
          {item.authorization_decision_id && <p>Decision <code>{item.authorization_decision_id}</code></p>}
        </li>)}
      </ul>}
      <h3>Brainstorming intake</h3>
      <form onSubmit={submitIdea}>
        <p><label>Title <input name="title" minLength={3} maxLength={120} required /></label></p>
        <p><label>Idea and intended outcome <textarea name="description" minLength={10} maxLength={4000} required /></label></p>
        <button className="hud-refresh" disabled={sending}>Submit for review</button>
      </form>
      <p>Accepting an idea for planning records your decision. Work requires its own authorization.</p>
      {snapshot.ideas.map(idea => <article key={idea.idea_id}>
        <h4>{idea.title}</h4>
        <p style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{idea.description}</p>
        <p>{idea.decision?.replaceAll("_", " ") ?? (idea.queued_for_review_at ? "Ready for operator review" : "Received")}</p>
        {idea.basis && <p>Reason {idea.basis}</p>}
        {idea.queued_for_review_at && !idea.decision && <IdeaReview ideaId={idea.idea_id} onSave={dispose} />}
      </article>)}
    </>}
  </section>;
}
