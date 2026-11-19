"""Render an editable DOCX and its reference PDF from a sectioned JSON source."""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory

from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

from manifest import registry

# BRAND-001 PR #139, pinned in the foundation manifest.
FIELD = "071419"
CARIBBEAN = "1584AA"
COPPER = "7F4E2D"


def add_page_number(paragraph):
    paragraph.add_run("   |   ")
    field = OxmlElement("w:fldSimple")
    field.set(qn("w:instr"), "PAGE")
    paragraph._p.append(field)


def format_table(document):
    table = document.add_table(rows=0, cols=2)
    table.style = "Light Shading Accent 1"
    table.autofit = False
    table.columns[0].width = Inches(1.1)
    table.columns[1].width = Inches(5.65)
    entries = registry()
    rows = [("Format", "Publishing role")]
    rows.extend((ext.upper(), entries[ext]["publishing"].replace("-", " "))
                for ext in ("docx", "pdf", "pptx", "xlsx", "csv", "svg", "png", "jpeg", "md", "html"))
    for number, row in enumerate(rows):
        cells = table.add_row().cells
        for cell, value in zip(cells, row):
            cell.text = value
        if number == 0:
            header = OxmlElement("w:tblHeader")
            table.rows[0]._tr.get_or_add_trPr().append(header)


def generate(source, output_dir, *, office="soffice"):
    data = json.loads(Path(source).read_text(encoding="utf-8"))
    pages = data["pages"]
    headings = {section[0]: page for page, sections in enumerate(pages, 1) for section in sections}
    if len(headings) != sum(map(len, pages)) or not {"Table of contents", "Index"} <= headings.keys():
        raise ValueError("Section headings must be unique and include Table of contents and Index")
    document = Document()
    props = document.core_properties
    props.title = data["title"]
    props.subject = f'{data["id"]} Test publishing foundation'
    props.author = "CoMind Inc."
    props.keywords = "DocuForge, DFG-001, document publishing, provenance"
    props.language = "en-US"
    generated_at = datetime.now(timezone.utc).replace(microsecond=0)
    props.created = props.modified = generated_at
    section = document.sections[0]
    section.top_margin = Inches(.75)
    section.bottom_margin = Inches(.7)
    section.left_margin = section.right_margin = Inches(.85)
    normal = document.styles["Normal"]
    normal.font.name = "Liberation Sans"
    normal.font.size = Pt(11)
    normal.font.color.rgb = RGBColor.from_string(FIELD)
    normal.paragraph_format.space_after = Pt(8)
    normal.paragraph_format.line_spacing = 1.15
    title = document.styles["Title"]
    title.font.name = "Liberation Sans"
    title.font.size = Pt(37)
    title.font.color.rgb = RGBColor.from_string("000000")
    title.font.bold = True
    border = title.element.find(".//" + qn("w:pBdr"))
    if border is not None:
        border.getparent().remove(border)
    h1 = document.styles["Heading 1"]
    h1.font.name = "Liberation Sans"
    h1.font.size = Pt(17)
    h1.font.color.rgb = RGBColor.from_string(CARIBBEAN)
    h1.paragraph_format.space_before = Pt(12)
    h1.paragraph_format.space_after = Pt(5)
    header = section.header.paragraphs[0]
    header.add_run("COMIND INC.   /   DOCUMENT ENGINEERING").font.color.rgb = RGBColor.from_string(COPPER)
    footer = section.footer.paragraphs[0]
    footer.add_run(f'{data["id"]}   /   v{data["version"]}   /   INTERNAL TEST')
    add_page_number(footer)
    document.add_paragraph(data["title"], "Title")
    document.add_paragraph(data["tagline"], "Subtitle")
    for page, sections in enumerate(pages, 1):
        for number, (heading, *paragraphs) in enumerate(sections):
            p = document.add_heading(heading, 1)
            p.paragraph_format.page_break_before = page > 1 and number == 0
            if heading == "Table of contents":
                for label, target_page in headings.items():
                    if label != heading:
                        document.add_paragraph(f"{label}  ·  {target_page}")
            elif heading == "Index":
                for term, target in sorted(data["index"].items()):
                    document.add_paragraph(f"{term}  ·  {headings[target]}")
            else:
                for paragraph in paragraphs:
                    document.add_paragraph(paragraph)
                if heading == "Format registry":
                    format_table(document)
    output_dir = Path(output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    filename = f'{data["id"]}_Foundation_v{data["version"]}'
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", filename):
        raise ValueError("Document ID or version cannot be used in a filename")
    docx = output_dir / f"{filename}.docx"
    pdf = output_dir / f"{filename}.pdf"
    if docx.exists() or pdf.exists():
        raise FileExistsError("Choose an output directory without this document version")
    with TemporaryDirectory(dir=output_dir) as staging:
        work = Path(staging)
        document.save(work / docx.name)
        subprocess.run([
            office, f"-env:UserInstallation={(work / 'profile').as_uri()}", "--headless",
            "--convert-to", 'pdf:writer_pdf_Export:{"UseTaggedPDF":{"type":"boolean","value":"true"}}',
            "--outdir", str(work), str(work / docx.name),
        ], check=True, capture_output=True, timeout=60)
        if not (work / pdf.name).is_file():
            raise RuntimeError("LibreOffice did not produce a PDF")
        docx.hardlink_to(work / docx.name)
        try:
            pdf.hardlink_to(work / pdf.name)
        except OSError:
            docx.unlink()
            raise
    return docx, pdf, generated_at


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--office", default="soffice")
    args = parser.parse_args()
    docx, pdf, generated_at = generate(args.source, args.output_dir, office=args.office)
    print(json.dumps({"docx": str(docx), "pdf": str(pdf), "generated_utc": generated_at.isoformat()}))
