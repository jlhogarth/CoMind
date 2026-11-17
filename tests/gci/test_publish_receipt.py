import unittest

from scripts.gci.publish_receipt import summarize


class PublishReceiptTest(unittest.TestCase):
    def test_sanitized_delivery_and_idle_stop(self):
        records = [
            {"run_id": "12345", "event": "started", "session": "gci_chat_20261117",
             "exchange": "question0002", "preflight": False},
            {"run_id": "12345", "event": "gemini_request_attempted", "calls": 1,
             "prompt": "must not appear"},
            {"run_id": "12345", "event": "delivered", "calls": 1,
             "sha256": "a" * 64, "answer": "must not appear"},
            {"run_id": "12345", "event": "idle_stopped", "calls": 1},
        ]
        body = summarize(records, "12345")
        self.assertIn("GCI-001-RETURN", body)
        self.assertIn("idle_stopped", body)
        self.assertIn("a" * 64, body)
        self.assertNotIn("must not appear", body)

    def test_incomplete_run_does_not_publish(self):
        self.assertIsNone(summarize([
            {"run_id": "12345", "event": "started", "session": "session0001",
             "exchange": "question0001"},
        ], "12345"))


if __name__ == "__main__":
    unittest.main()
