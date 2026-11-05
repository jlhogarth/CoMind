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

if __name__ == "__main__":
    unittest.main()
