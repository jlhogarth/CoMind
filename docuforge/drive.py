"""Google Drive binary publication using a previously authorized Test credential."""
from __future__ import annotations

import json
import re
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener
from uuid import uuid4

FILE_ID = re.compile(r"[A-Za-z0-9_-]{8,128}")
MAX_BYTES = 8 * 1024 * 1024
FOLDER_MIME = "application/vnd.google-apps.folder"
FIELDS = "id,name,mimeType,parents,trashed,shared,size,capabilities(canAddChildren)"


class PublicationError(Exception):
    """An actionable publication failure safe to show in the RunBook."""


class DriveError(PublicationError):
    def __init__(self, status):
        self.status = status
        super().__init__(f"Google Drive returned HTTP {status}")


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Drive:
    def __init__(self, access_token):
        if not access_token or any(c.isspace() for c in access_token):
            raise PublicationError("An authorized Test Drive access token is required")
        self._opener = build_opener(NoRedirect())
        self._headers = {"Authorization": f"Bearer {access_token}"}

    def _request(self, path, *, query=None, body=None, content_type=None, maximum=MAX_BYTES):
        url = "https://www.googleapis.com" + path
        if query:
            url += "?" + urlencode(query)
        headers = self._headers.copy()
        if content_type:
            headers["Content-Type"] = content_type
        request = Request(url, data=body, headers=headers)
        try:
            with self._opener.open(request, timeout=20) as response:
                payload = response.read(maximum + 1)
        except HTTPError as error:
            error.close()
            raise DriveError(error.code) from None
        except (OSError, URLError) as error:
            raise PublicationError("Google Drive transport failed or timed out") from error
        if len(payload) > maximum:
            raise PublicationError("Google Drive response exceeded the request size limit")
        return payload

    def metadata(self, file_id):
        if not FILE_ID.fullmatch(file_id):
            raise PublicationError("Invalid Google Drive file ID")
        try:
            return json.loads(self._request(f"/drive/v3/files/{file_id}", query={"fields": FIELDS}))
        except DriveError as error:
            if error.status != 404:
                raise
            return None

    def reserve(self, count):
        payload = self._request("/drive/v3/files/generateIds", query={"count": count, "space": "drive"})
        ids = json.loads(payload).get("ids", [])
        if (len(ids) != count or len(set(ids)) != count
                or not all(isinstance(i, str) and FILE_ID.fullmatch(i) for i in ids)):
            raise PublicationError("Google Drive did not return the required unique file IDs")
        return ids

    def create(self, file_id, name, mime, folder, payload):
        boundary = f"docuforge_{uuid4().hex}"
        metadata = json.dumps({"id": file_id, "name": name, "mimeType": mime, "parents": [folder]})
        prefix = (f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"
                  f"{metadata}\r\n--{boundary}\r\nContent-Type: {mime}\r\n\r\n")
        body = prefix.encode() + payload + f"\r\n--{boundary}--\r\n".encode()
        try:
            self._request("/upload/drive/v3/files", query={"uploadType": "multipart", "fields": "id",
                                 "ignoreDefaultVisibility": "true"},
                          body=body, content_type=f"multipart/related; boundary={boundary}")
        except DriveError as error:
            if error.status != 409:
                raise

    def read(self, file_id, size):
        if not FILE_ID.fullmatch(file_id):
            raise PublicationError("Invalid Google Drive file ID")
        return self._request(f"/drive/v3/files/{file_id}", query={"alt": "media"}, maximum=size)
