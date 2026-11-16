"""Button-driven Colab adapter for the existing GCI IAM bootstrap.

No credentials, raw provider errors, or project policy are saved in receipts.
"""
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

PROJECT = "comind-513807"


class SetupPrerequisiteError(RuntimeError):
    """Safe, locally generated diagnostic, containing no authentication data."""


def classify_failure(stderr, returncode):
    message = stderr.lower()
    if "active account" in message or "reauth" in message or "credential" in message:
        return "GOOGLE_SIGN_IN_REQUIRED"
    if "permission" in message or "forbidden" in message:
        return "GOOGLE_PERMISSION_DENIED"
    if returncode == 3:
        return "EXISTING_CONFIGURATION_REQUIRES_REVIEW"
    if returncode == 4:
        return "RUNTIME_DEPENDENCY_MISSING"
    if returncode == 5:
        return "SETUP_INCOMPLETE"
    return "GOOGLE_COMMAND_FAILED"


def run_setup(source, expected_sha256, mode, runner=subprocess.run):
    if mode not in ("--audit", "--apply", "--verify"):
        raise ValueError("Unsupported setup mode")
    if hashlib.sha256(source.encode()).hexdigest() != expected_sha256:
        raise ValueError("Reviewed setup bytes do not match their digest")
    receipt = {
        "schema_version": 1, "lane": "GCI-001", "project_id": PROJECT,
        "project_number": "373198958202", "mode": mode,
        "script_sha256": expected_sha256,
        "started_utc": datetime.now(timezone.utc).isoformat(),
        "ready": False, "gemini_requests": 0, "checks": [],
    }
    with tempfile.TemporaryDirectory(prefix="gci-setup-") as directory:
        path = Path(directory) / "bootstrap-google-oidc.sh"
        path.write_text(source, encoding="utf-8")
        try:
            result = runner(["bash", str(path), mode], capture_output=True,
                            text=True, timeout=600, check=False)
            receipt["returncode"] = result.returncode
            receipt["status"] = "SUCCEEDED" if result.returncode == 0 else classify_failure(result.stderr, result.returncode)
            # Only known, nonsecret bootstrap messages are eligible for export.
            prefixes = ("Verified identity: ", "Expected provider: ",
                        "Required API disabled: ", "Repository variable ")
            exact = {"Verified existing OIDC provider.", "Dedicated pool absent.",
                     "OIDC provider absent.", "Scoped impersonation binding present.",
                     "Scoped impersonation binding absent.", "GCI_SETUP_READY=true",
                     "GCI_SETUP_READY=false"}
            receipt["checks"] = [line for line in result.stdout.splitlines()
                                 if line in exact or line.startswith(prefixes)]
            receipt["ready"] = result.returncode == 0 and "GCI_SETUP_READY=true" in receipt["checks"]
        except subprocess.TimeoutExpired:
            receipt["status"] = "TIMED_OUT_STATE_UNKNOWN"
            receipt["next_action"] = "Run read-only audit before any further apply."
        except OSError:
            receipt["status"] = "RUNTIME_COMMAND_UNAVAILABLE"
    receipt["finished_utc"] = datetime.now(timezone.utc).isoformat()
    return receipt


def launch(source, digest):
    """Render controls; displaying or Run all never changes IAM."""
    import ipywidgets as widgets
    from IPython.display import display
    from google.colab import auth, files

    state = {"audited": False, "busy": False, "receipts": []}
    audit = widgets.Button(description="1. Sign in and check", layout=widgets.Layout(width="250px"))
    apply = widgets.Button(description="2. Apply reviewed setup", disabled=True, layout=widgets.Layout(width="250px"))
    verify = widgets.Button(description="3. Verify setup", disabled=True, layout=widgets.Layout(width="250px"))
    download = widgets.Button(description="Download safe receipt", disabled=True, layout=widgets.Layout(width="250px"))
    output = widgets.Output()

    def execute(mode):
        if state["busy"] or (mode != "--audit" and not state["audited"]):
            return
        state["busy"] = True
        state["audited"] = False
        for button in (audit, apply, verify, download):
            button.disabled = True
        with output:
            output.clear_output()
            try:
                missing = [name for name in ("gcloud", "jq", "bash") if not shutil.which(name)]
                if missing:
                    raise SetupPrerequisiteError("Runtime dependencies missing: " + ", ".join(missing))
                # Do not fall back to the old copy-an-auth-code terminal flow.
                if os.environ.get("USE_AUTH_EPHEM") != "1":
                    raise SetupPrerequisiteError("This runtime lacks Colab's dialog sign-in. Stop and report this message.")
                auth.authenticate_user(project_id=PROJECT)
                receipt = run_setup(source, digest, mode)
                state["receipts"].append(receipt)
                state["audited"] = receipt["status"] == "SUCCEEDED"
                print(json.dumps(receipt, indent=2))
                if receipt["ready"]:
                    print("Google setup verified. Return to GCI-001 with this receipt for GitHub preflight. No Gemini call was made.")
                elif receipt["status"] == "SUCCEEDED":
                    print("Read-only check completed. Apply is available for the reviewed Test setup.")
                else:
                    print("Stopped. Download the safe receipt. Do not retry Apply until a fresh audit passes.")
            except SetupPrerequisiteError as error:
                state["receipts"].append({"mode": mode, "status": "RUNTIME_PREREQUISITE_MISSING",
                                          "detail": str(error), "ready": False, "gemini_requests": 0})
                print(str(error))
            except Exception as error:
                # OAuth errors can carry sensitive URLs. Do not print exception values.
                state["receipts"].append({"mode": mode, "status": "AUTH_OR_RUNTIME_BLOCKED",
                                          "error_type": type(error).__name__,
                                          "ready": False, "gemini_requests": 0})
                print("Sign-in or runtime blocked. Setup is not verified. Download the safe receipt and run a fresh audit before applying again.")
            finally:
                state["busy"] = False
                audit.disabled = False
                apply.disabled = not state["audited"]
                verify.disabled = not state["audited"]
                download.disabled = not state["receipts"]

    def export(_):
        path = Path("/content/gci-001-access-receipt.json")
        path.write_text(json.dumps(state["receipts"], indent=2) + "\n", encoding="utf-8")
        files.download(str(path))

    audit.on_click(lambda _: execute("--audit"))
    apply.on_click(lambda _: execute("--apply"))
    verify.on_click(lambda _: execute("--verify"))
    download.on_click(export)
    display(widgets.VBox([audit, apply, verify, download, output]))
