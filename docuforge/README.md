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

## DFG-002 one-request Test publishing

The command accepts the sectioned JSON format used by `foundation.json`. The
current renderer and verifier require the foundation template's contents,
index, and format-registry section. The Test host must provide LibreOffice,
the Python dependencies listed above, one preapproved private My Drive folder
as `DOCUFORGE_TEST_FOLDER_ID`, and a current Google Drive access token through
its existing secret injection as `DOCUFORGE_DRIVE_ACCESS_TOKEN`. The authorized
identity must be able to inspect the folder, reserve file IDs, create files, and
read them back. The runner refuses a shared destination. Keep the token out
of commands, request files, and logs.

Use one persistent private local state directory on the Test host. Set
`DFG_STATE_DIR` to that directory, `DFG_REQUEST_ID` to a unique operator-selected
identifier, and `DFG_SOURCE_JSON` to the source file:

```sh
python docuforge/publish.py --state-dir "$DFG_STATE_DIR" run \
  "$DFG_REQUEST_ID" "$DFG_SOURCE_JSON" "$DOCUFORGE_TEST_FOLDER_ID"
python docuforge/publish.py --state-dir "$DFG_STATE_DIR" events \
  "$DFG_REQUEST_ID" --runbook
```

The runner saves validated bytes and Drive IDs before upload. It uses a fresh
authenticated read and SHA-256 for the Word file, PDF, and receipt. Rerun with
the same request ID, source, destination, and state directory after an
interruption. A different source or destination with the same ID is rejected.
An earlier verified file that becomes missing or mismatched blocks replay. A
credential change or an external Drive change can require operator action.
Keep the local state backed up for the approved retention period. Running the
same request against a fresh or different state directory loses its retry
guarantee. This is a single-host, on-demand runner for internal Test artifacts.

The `events --runbook` command emits named arguments for the existing
`comind_pm.record_runbook_event` writer. The governed relay can use each stable
`p_source_ref` to reconcile an uncertain append before replaying. Emit and append
events in sequence. The local journal can be inspected while a run is active.
A crash may leave the latest artifact in a pending stage. Restarting with the
same ID is the safe next action. Runtime delivery to the existing writer and
the deployed Console/AED consumers depend on their Test bindings.

### Live interruption acceptance

`live_interruption_test.py` is a one-shot Test harness. It requires a fresh
request ID, the same configured private folder and authorization as the
publisher, and a private persistent state directory. It forks, uploads the
first real DOCX using its reserved ID, exits the child immediately before
recording the response, and resumes in the parent with the same SQLite file.
It verifies all three files by authenticated readback, replays the request,
and lists exact-name children to require one stored file per name and ID.

```sh
python docuforge/live_interruption_test.py --state-dir "$DFG_STATE_DIR" \
  "$DFG_REQUEST_ID" "$DFG_SOURCE_JSON" "$DOCUFORGE_TEST_FOLDER_ID"
```

Keep the state directory after the run for audit and recovery. Do not rerun
this one-shot harness using the same request ID; use `publish.py` to retry an
interrupted request. A `PASS` result must include three authenticated SHA-256
readbacks, exactly one listing match for each generated name, and an unchanged
receipt on replay. A failed or ambiguous result remains blocked.

The approved DFG-001 folder is a private **My Drive** folder. Google service
accounts cannot own files there. Use an already authorized human OAuth identity
with access to this folder and inject its short-lived Drive token through an
approved secret/session mechanism. Do not store an OAuth refresh token in the
repository, Codespace filesystem, or SQLite state. A Codespace can hold the
state for a bounded Test run, but its default retention and compute limits do
not make it an always-on service. The existing GCI service-account federation
is a different lane and is not a substitute for folder-scoped user access.
