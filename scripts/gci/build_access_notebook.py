"""Build a self-contained notebook from the reviewed local bootstrap and UI."""
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent


def build():
    source = (HERE / "bootstrap-google-oidc.sh").read_text()
    helper = (HERE / "access_setup.py").read_text()
    digest = hashlib.sha256(source.encode()).hexdigest()
    text = """# CoMind GCI-001: Google access setup without a terminal

Use a standard **free CPU runtime**. No GPU, Colab Enterprise, paid plan or AI assistant is needed.
Open in the Safari app if Google's sign-in rejects an embedded browser.

1. Run the **Show setup buttons** cell below using its triangle button.
2. Tap **Sign in and check** and choose the Google account that administers CoMind.
3. After the check succeeds, tap **Apply reviewed setup**, then **Verify setup**.
4. Download the safe receipt and return it to the existing GCI-001 Work conversation.

Running all cells only displays buttons. It does not sign in or change IAM.
The Apply button can enable the five required APIs, create the dedicated pool/provider if absent,
and grant only the restricted GitHub identity permission to use the existing service account.
It stops on unexpected existing trust, project roles or user-managed keys.
The account you sign in with retains its own permissions; this notebook's code restricts its
operations to the reviewed Test setup. It does not create a narrower human OAuth identity.

Project: `comind-513807` (`373198958202`). Lane: issue [#544](https://github.com/jlhogarth/CoMind/issues/544),
draft PR [#545](https://github.com/jlhogarth/CoMind/pull/545).
No service-account keys, Google Drive mounting, model calls, GitHub credentials or Production deployment.
Notebook source embeds the reviewed script and verifies its SHA-256 before each invocation.
The receipt contains statuses and nonsecret configuration only. Disconnect and delete the
runtime after downloading the receipt to end this temporary admin session.

**Verification boundary:** local tests cover controls and bootstrap behavior. Your Google login,
actual IAM changes and iPhone interaction still require live verification. If sign-in fails,
stop here rather than copying auth codes or repeating the old terminal instructions.
"""
    code = '#@title Show setup buttons\n' + helper + '\n\nBOOTSTRAP_SOURCE = ' + repr(source) + '\nBOOTSTRAP_SHA256 = ' + repr(digest) + '\nlaunch(BOOTSTRAP_SOURCE, BOOTSTRAP_SHA256)\n'
    return {"nbformat": 4, "nbformat_minor": 5,
            "metadata": {"kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
                         "colab": {"name": "gci-001-access-setup.ipynb", "provenance": [], "private_outputs": True}},
            "cells": [{"id": "instructions", "cell_type": "markdown", "metadata": {}, "source": text.splitlines(True)},
                      {"id": "setup-buttons", "cell_type": "code", "metadata": {"cellView": "form"},
                       "source": code.splitlines(True), "execution_count": None, "outputs": []}]}


if __name__ == "__main__":
    (HERE / "gci-001-access-setup.ipynb").write_text(json.dumps(build(), indent=2) + "\n")
