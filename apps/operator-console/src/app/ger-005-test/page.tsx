"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabaseClient } from "../../lib/supabase/browser";
import { tokenFromTestMagicLink } from "../../lib/ger-005-test/verification-link";

const TEST_PROJECT_URL = "https://sbgfuanxiqepcoboxzcl.supabase.co";
const PURPOSE = "digital-twin-synthetic-test";

type Decision = { event_id: string; decision: "allow" | "deny"; decided_at: string };

export default function Ger005TestConsentPage() {
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [verificationLink, setVerificationLink] = useState("");
  const [current, setCurrent] = useState<Decision | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const available = process.env.NEXT_PUBLIC_SUPABASE_URL === TEST_PROJECT_URL;

  useEffect(() => {
    if (!available) return;
    const client = getBrowserSupabaseClient();
    async function refresh() {
      const { data: { user }, error } = await client.auth.getUser();
      setSignedIn(Boolean(user) && !error);
      if (!user || error) { setCurrent(null); return; }
      const result = await client.rpc("cm_ger005_test_consent_current");
      if (result.error) { setMessage(result.error.message); return; }
      setCurrent((result.data as Decision[])[0] ?? null);
    }
    void refresh();
    const { data } = client.auth.onAuthStateChange(() => { void refresh(); });
    return () => data.subscription.unsubscribe();
  }, [available]);

  async function signIn() {
    setBusy(true); setMessage("");
    try {
      const result = await getBrowserSupabaseClient().auth.signInWithOtp({
        email: email.trim(), options: { shouldCreateUser: false, emailRedirectTo: window.location.href },
      });
      setMessage(result.error?.message ?? "Check your email for the sign-in link, then return here.");
    } finally { setBusy(false); }
  }

  async function completeSignIn() {
    setBusy(true); setMessage("");
    const link = verificationLink;
    setVerificationLink("");
    try {
      const token_hash = tokenFromTestMagicLink(link);
      const client = getBrowserSupabaseClient();
      const result = await client.auth.verifyOtp({ token_hash, type: "magiclink" });
      if (result.error) { setMessage("The Test link was rejected or expired. Request a fresh link."); return; }
      const { data: { user }, error } = await client.auth.getUser();
      if (!user || error) { setMessage("Sign-in could not be verified. Request a fresh link."); return; }
      setSignedIn(true);
      const readback = await client.rpc("cm_ger005_test_consent_current");
      if (readback.error) { setMessage(readback.error.message); return; }
      setCurrent((readback.data as Decision[])[0] ?? null);
      setMessage("Signed Test account verified. Choose a decision below.");
    } catch { setMessage("Use the latest CoMind Test magic link from this sign-in request."); }
    finally { setBusy(false); }
  }

  async function decide(decision: "allow" | "deny") {
    setBusy(true); setMessage("");
    try {
      const client = getBrowserSupabaseClient();
      const { data: { user }, error: authError } = await client.auth.getUser();
      if (!user || authError) { setSignedIn(false); setMessage("Sign in again before deciding."); return; }
      const result = await client.rpc("cm_ger005_test_consent_decide", { p_decision: decision });
      if (result.error) { setMessage(result.error.message); return; }
      const readback = await client.rpc("cm_ger005_test_consent_current");
      if (readback.error) { setMessage(readback.error.message); return; }
      setCurrent((readback.data as Decision[])[0] ?? null);
      setMessage("Decision recorded and read back from the Test database.");
    } finally { setBusy(false); }
  }

  return <main style={{ maxWidth: 640, margin: "2rem auto", padding: "1rem" }}>
    <h1>GER-005 fictional Test consent</h1>
    <p>This decision covers only the purpose <strong>{PURPOSE}</strong> for the synthetic Test actor bound to your signed-in account. It does not authorize real personal data, Production, or inferred identity claims.</p>
    {!available ? <p>Unavailable outside the verified CoMind Test project.</p> : signedIn ? <>
      <p>Current decision: <strong>{current?.decision ?? "none"}</strong></p>
      {current && <p>Recorded {new Date(current.decided_at).toLocaleString()}. Evidence event: {current.event_id}</p>}
      <button type="button" disabled={busy} onClick={() => void decide("allow")}>Allow fictional Test eligibility</button>{" "}
      <button type="button" disabled={busy} onClick={() => void decide("deny")}>Deny or revoke</button>
    </> : <>
      <label htmlFor="ger005-email">Existing Test account email</label>{" "}
      <input id="ger005-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} />{" "}
      <button type="button" disabled={busy || !email.trim()} onClick={() => void signIn()}>Send sign-in link</button>
      <p>On a phone, copy the full link from the email instead of opening it. Paste it below to verify the one-time token directly. The link is cleared from this field before verification.</p>
      <label htmlFor="ger005-verification">Latest Test sign-in link</label>{" "}
      <input id="ger005-verification" type="password" autoComplete="off" value={verificationLink} onChange={event => setVerificationLink(event.target.value)} />{" "}
      <button type="button" disabled={busy || !verificationLink.trim()} onClick={() => void completeSignIn()}>Complete sign-in</button>
    </>}
    {message && <p role="status">{message}</p>}
  </main>;
}
