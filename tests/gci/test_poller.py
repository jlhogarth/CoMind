"""Pure contract tests: do not call Google or Gemini."""
import importlib.util
import pathlib
import unittest
from unittest.mock import patch

FILE = pathlib.Path(__file__).resolve().parents[2] / "scripts/gci/poller.py"
spec = importlib.util.spec_from_file_location("gci_poller", FILE)
module = importlib.util.module_from_spec(spec)
import sys
sys.modules[spec.name] = module
spec.loader.exec_module(module)

def exchange(id, role, session, body):
    return (f"[COMIND_EXCHANGE_START id={id} role={role} session={session}]\n"
            f"{body}\n[COMIND_EXCHANGE_COMPLETE id={id}]")

class ParserTests(unittest.TestCase):
    def test_complete_chatgpt_only(self):
        s = "session001"
        doc = exchange("question001", "CHATGPT", s, "Compare designs")
        self.assertEqual([x.exchange_id for x in module.eligible(doc, s)], ["question001"])

    def test_partial_is_ignored(self):
        doc = "[COMIND_EXCHANGE_START id=question001 role=CHATGPT session=session001]\nTyping"
        self.assertEqual(module.eligible(doc, "session001"), [])

    def test_wrong_session_and_gemini_are_ignored(self):
        doc = exchange("question001", "CHATGPT", "session002", "Other") + "\n" + exchange(
            "gemreply01", "GEMINI", "session001", "Answer")
        self.assertEqual(module.eligible(doc, "session001"), [])

    def test_claim_deduplicates(self):
        doc = exchange("question001", "CHATGPT", "session001", "Hello")
        doc += "\n[COMIND_CLAIM id=question001 session=session001]"
        self.assertEqual(module.eligible(doc, "session001"), [])

    def test_reply_deduplicates(self):
        doc = exchange("question001", "CHATGPT", "session001", "Hello")
        doc += "\n[COMIND_REPLY parent=question001 session=session001]"
        self.assertEqual(module.eligible(doc, "session001"), [])

    def test_duplicate_question_only_once(self):
        doc = exchange("question001", "CHATGPT", "session001", "Hello") * 2
        self.assertEqual(len(module.eligible(doc, "session001")), 1)

    def test_incomplete_end_marker_does_not_match(self):
        doc = "[COMIND_EXCHANGE_START id=question001 role=CHATGPT session=session001]\nHi\n"
        doc += "[COMIND_EXCHANGE_COMPLETE id=other001]"
        self.assertEqual(module.eligible(doc, "session001"), [])

    def test_default_off_never_contacts_google(self):
        from argparse import Namespace
        args = Namespace(document_id="A"*20, session_id="session001", model="gemini-3.5-flash-lite",
                         interval=15, idle=240, maximum=1800)
        with patch.dict("os.environ", {"GCI_ENABLE_LIVE": "false"}):
            with patch.object(module, "google_session") as gs:
                self.assertEqual(module.run(args), 0)
                gs.assert_not_called()


class AcceptanceSimulationTests(unittest.TestCase):
    """Deterministic full-loop simulations; absolutely no external API calls."""

    def make_args(self):
        from argparse import Namespace
        return Namespace(document_id="1dJEOjmLPm9gdw8xsVF8J_dyPK0HDx5N5RmW0ID42cnE", session_id="gci_smoke_20261107",
                         model="gemini-3.5-flash-lite", interval=15, idle=240, maximum=1800)

    def run_clock(self, initial_document, drop_reply=False):
        state = {"now": 0, "content": initial_document, "version": 1, "calls": 0,
                 "metadata_checks": 0, "appends": [], "gemini_prompts": []}

        def advance(seconds):
            state["now"] += seconds

        def metadata(_client, _id):
            state["metadata_checks"] += 1
            return {"mimeType": "application/vnd.google-apps.document",
                    "version": str(state["version"])}

        def export(_client, _id):
            return state["content"], "text/plain"

        def append(_client, _id, payload):
            if not (drop_reply and "[COMIND_REPLY" in payload):
                state["content"] += "\n" + payload + "\n"
            state["version"] += 1
            state["appends"].append(payload)

        def gemini(_key, _model, prompt):
            state["calls"] += 1
            state["gemini_prompts"].append(prompt)
            return "A bounded alternate design.", {"promptTokenCount": 5}

        credentials = {"GCI_ENABLE_LIVE": "true", "GEMINI_API_KEY": "not-a-real-key",
                       "GOOGLE_APPLICATION_CREDENTIALS": "/nonexistent/federation.json"}
        with (
            patch.dict("os.environ", credentials),
            patch.object(module, "google_session", return_value=object()),
            patch.object(module, "metadata", side_effect=metadata),
            patch.object(module, "export", side_effect=export),
            patch.object(module, "append", side_effect=append),
            patch.object(module, "ask_gemini", side_effect=gemini),
            patch.object(module.time, "monotonic", side_effect=lambda: state["now"]),
            patch.object(module.time, "sleep", side_effect=advance),
            patch.object(module, "event") as capture,
        ):
            state["exit"] = module.run(self.make_args())
            state["events"] = [call.args[0] for call in capture.call_args_list]
        return state

    def test_one_complete_exchange_exactly_once_and_idle_stop(self):
        doc = exchange("question001", "CHATGPT", "gci_smoke_20261107", "Which design is safer?")
        result = self.run_clock(doc)
        self.assertEqual(result["exit"], 0)
        self.assertEqual(result["calls"], 1)
        self.assertEqual(result["gemini_prompts"], ["Which design is safer?"])
        self.assertEqual(sum("[COMIND_CLAIM" in v for v in result["appends"]), 1)
        self.assertEqual(sum("[COMIND_REPLY" in v for v in result["appends"]), 1)
        self.assertEqual(result["now"], 240)
        self.assertEqual(result["events"][-1], "idle_stopped")
        self.assertIn("delivered", result["events"])
        self.assertGreaterEqual(result["metadata_checks"], 10)

    def test_unverified_reply_never_reports_delivery(self):
        doc = exchange("question001", "CHATGPT", "gci_smoke_20261107", "Check writeback")
        result = self.run_clock(doc, drop_reply=True)
        self.assertEqual(result["exit"], 6)
        self.assertEqual(result["calls"], 1)
        self.assertIn("delivery_unverified", result["events"])
        self.assertNotIn("delivered", result["events"])

    def test_no_exchange_no_billable_calls_and_idle_stop(self):
        result = self.run_clock("No complete exchange.")
        self.assertEqual(result["exit"], 0)
        self.assertEqual(result["calls"], 0)
        self.assertEqual(result["appends"], [])
        self.assertEqual(result["now"], 240)
        self.assertEqual(result["events"][-1], "idle_stopped")

    def test_legacy_collaboration_never_invokes_gemini(self):
        legacy_id = "1T2pSlnnLysrUagxLiXm2sWp7K_gHsa1FUl97eiKx5G0"
        allowed, reason = module.authorized_document(legacy_id, "session001")
        self.assertFalse(allowed)
        self.assertEqual(reason, "document_not_authorized_for_automatic_invocation")
        with patch.dict("os.environ", {"GCI_ENABLE_LIVE": "true", "GEMINI_API_KEY": "test"},
                        clear=True), patch.object(module, "google_session") as connect:
            args = self.make_args()
            args.document_id = legacy_id
            self.assertEqual(module.run(args), 5)
            connect.assert_not_called()

    def test_unregistered_document_rejected(self):
        self.assertFalse(module.authorized_document("A" * 20, "gci_smoke_20261107")[0])

    def test_registered_document_rejects_other_session(self):
        doc = "1dJEOjmLPm9gdw8xsVF8J_dyPK0HDx5N5RmW0ID42cnE"
        self.assertFalse(module.authorized_document(doc, "session001")[0])
        self.assertTrue(module.authorized_document(doc, "gci_smoke_20261107")[0])

    def test_missing_google_federation_fails_closed(self):
        with patch.dict("os.environ", {"GCI_ENABLE_LIVE": "true", "GEMINI_API_KEY": "test"},
                        clear=True), patch.object(module, "google_session") as connect:
            self.assertEqual(module.run(self.make_args()), 2)
            connect.assert_not_called()

if __name__ == "__main__":
    unittest.main()
