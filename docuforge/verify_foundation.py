"""Independently check the structure, content and pagination of a generated pair."""
from __future__ import annotations

import argparse
import json
import re
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

from docx import Document
from pypdf import PdfReader


def verify_foundation(source, docx, pdf):
    data = json.loads(Path(source).read_text(encoding="utf-8"))
    with ZipFile(docx) as package:
        if package.testzip() is not None:
            raise ValueError("DOCX archive failed integrity check")
    word = Document(docx)
    sections = [item[0] for page in data["pages"] for item in page]
    headings = [p.text for p in word.paragraphs if p.style.name == "Heading 1"]
    if (headings != sections or len(word.tables) != 1 or len(word.tables[0].rows) != 11
            or word.core_properties.title != data["title"]
            or word.core_properties.author != "CoMind Inc."
            or word.core_properties.language != "en-US"):
        raise ValueError("DOCX headings, format table or metadata failed")
    if word.inline_shapes:
        raise ValueError("The foundation package has no specified embedded artwork")
    edit = word.add_paragraph("DocuForge in-memory editability verification")
    buffer = BytesIO()
    word.save(buffer)
    buffer.seek(0)
    if Document(buffer).paragraphs[-1].text != edit.text:
        raise ValueError("DOCX edit did not survive a save and reopen")
    reader = PdfReader(pdf)
    if (reader.is_encrypted or len(reader.pages) != len(data["pages"])
            or reader.metadata.title != data["title"] or reader.metadata.author != "CoMind Inc."
            or not reader.trailer["/Root"].get("/StructTreeRoot")):
        raise ValueError("PDF pagination, metadata or document structure failed")
    text = [page.extract_text() for page in reader.pages]
    footer = f'{data["id"]} / v{data["version"]} / INTERNAL TEST'
    for page, (body, expected) in enumerate(zip(text, data["pages"]), 1):
        normalized = " ".join(body.split())
        if any(title not in normalized for title, *_ in expected):
            raise ValueError(f"Missing PDF heading on page {page}")
        if not re.search(re.escape(footer) + r"\s*\|\s*" + str(page) + r"\b", normalized):
            raise ValueError(f"Incorrect PDF footer on page {page}")
    page_lookup = {section[0]: page for page, entries in enumerate(data["pages"], 1)
                   for section in entries}
    for labels, heading in (({k: k for k in sections if k != "Table of contents"}, "Table of contents"),
                            (data["index"], "Index")):
        normalized = " ".join(text[page_lookup[heading] - 1].split())
        for label, section in labels.items():
            if f"{label} · {page_lookup[section]}" not in normalized:
                raise ValueError(f"Incorrect {heading} reference for {label}")
    return {"docx": ["package", "editable headings", "format table", "metadata"],
            "pdf": ["tagged structure", "extractable text", "contents", "index",
                    "page numbering", "metadata"], "pages": len(text)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("source", "docx", "pdf"):
        parser.add_argument(name, type=Path)
    args = parser.parse_args()
    print(json.dumps(verify_foundation(args.source, args.docx, args.pdf)))
