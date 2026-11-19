# CoMind DocuForge DFG-001

DocuForge creates an editable Word source and derives a tagged PDF from it. The versioned registry defines preservation and format-specific checks. The manifest binds the files, source provenance, validation and Drive readback to the exact bytes. This workflow runs on demand in Test under [issue #534](https://github.com/jlhogarth/CoMind/issues/534) and [PR #557](https://github.com/jlhogarth/CoMind/pull/557).

## Build and verify

Run from the repository root with Python 3.11 or newer, LibreOffice Writer (`soffice` on PATH), and Liberation Sans available.

```sh
python -m pip install -r docuforge/requirements.txt
python -m unittest discover -s docuforge -v
python docuforge/generate.py docuforge/foundation.json ./dfg-output
python docuforge/verify_foundation.py docuforge/foundation.json \
  dfg-output/DFG-001_Foundation_v0.2.docx dfg-output/DFG-001_Foundation_v0.2.pdf
```

The PDF verifier checks the resolved page numbers in the contents and index, as well as metadata, extractable text, tag structure, and footer numbering. Render and inspect every page of both files. The Word verifier exercises an edit, save and reopen in memory. The foundation has no embedded artwork. A changed source or tool version can change the output bytes or pagination, so rerun verification for each generated package. Use a fresh output directory.

## Private Drive publication

Use the authorized destination under CoMind / 04_Product_Modules / DocuForge / DFG-001. Verify the folder ID, hierarchy and sharing before use. Search by exact filename before upload. For a retry, compare the existing authenticated download with the local digest and stop on a mismatch or an ambiguous duplicate. Upload binary Office and PDF files without converting them. Read metadata and download each stored file into a clean directory under its original filename. Obtain the receipts through the authenticated connector, and keep signed transfer references outside the manifest.

Use `package_manifest.py --help` to package a run. Its context JSON maps to the keyword arguments of `manifest.build_manifest` and supplies observed source references and hashes, validation checks, environment references, and the expected destination. Each receipt must include the observed `file_id`, `folder_id`, `mime`, `bytes`, `retrieved_utc`, and `authenticated`. The verifier compares the bytes in the readback directory with the source hashes and records a failed publication on mismatch. Store the resulting JSON in the same private folder. Preserve the manifest's own file ID and digest externally to avoid self-reference. Reconcile via the existing RunBook.

The registry documents PowerPoint and Excel conversion risks. Those formats have preservation and validation requirements. DFG-001 only exercises DOCX and PDF generation, binary Drive upload and authenticated readback. Hosted activation, native Google conversions and Education Center integration are future milestones.
