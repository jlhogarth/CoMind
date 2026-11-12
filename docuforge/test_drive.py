"""Exercise the Drive API request contract without credentials or network writes."""
from io import BytesIO
import json
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlsplit

from drive import Drive, NoRedirect, PublicationError


class DriveTests(unittest.TestCase):
    def setUp(self):
        self.drive = Drive("fixture-token")
        patcher = patch.object(self.drive._opener, "open")
        self.open = patcher.start()
        self.addCleanup(patcher.stop)

    def test_reserve_and_upload_use_preassigned_drive_id(self):
        self.open.side_effect = [
            BytesIO(b'{"ids":["fixture-drive-id"]}'),
            HTTPError("https://www.googleapis.com", 409, "conflict", {}, BytesIO()),
        ]
        [file_id] = self.drive.reserve(1)
        self.drive.create(file_id, "fixture.pdf", "application/pdf", "fixture-folder-id", b"test")
        lookup, upload = [call.args[0] for call in self.open.call_args_list]
        self.assertEqual(urlsplit(lookup.full_url).path, "/drive/v3/files/generateIds")
        self.assertEqual(parse_qs(urlsplit(lookup.full_url).query), {"count": ["1"], "space": ["drive"]})
        self.assertEqual(upload.get_method(), "POST")
        metadata = json.loads(upload.data.split(b"\r\n\r\n")[1].split(b"\r\n")[0])
        self.assertEqual(metadata["id"], file_id)
        self.assertEqual(metadata["parents"], ["fixture-folder-id"])
        self.assertIn(b"\r\n\r\ntest\r\n", upload.data)
        self.assertEqual(upload.get_header("Authorization"), "Bearer fixture-token")

    def test_media_reads_are_bounded_and_redirects_are_rejected(self):
        self.open.return_value = BytesIO(b"extra")
        with self.assertRaisesRegex(PublicationError, "size limit"):
            self.drive.read("fixture-drive-id", 4)
        read = self.open.call_args.args[0]
        self.assertEqual(parse_qs(urlsplit(read.full_url).query), {"alt": ["media"]})
        self.assertIsNone(NoRedirect().redirect_request(read, None, 302, "", {}, "https://example.com"))
