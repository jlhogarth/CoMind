#!/usr/bin/env python3
"""Fail when changed migrations create comind/comind_pm tables without enabling RLS."""
from __future__ import annotations

import argparse
import pathlib
import re
import subprocess
import sys

CUSTOM_SCHEMAS = {"comind", "comind_pm"}


def strip_comments(sql: str) -> str:
    sql = re.sub(r"/\*.*?\*/", " ", sql, flags=re.S)
    sql = re.sub(r"--[^\n]*", " ", sql)
    return sql


def clean_ident(value: str) -> str:
    return value.strip().strip('"').lower()


def created_custom_tables(sql: str) -> set[tuple[str, str]]:
    cleaned = strip_comments(sql)
    statements = [part.strip() for part in cleaned.split(";") if part.strip()]
    active_schema: str | None = None
    created: set[tuple[str, str]] = set()

    for statement in statements:
        search = re.match(r"(?is)^set\s+search_path\s+(?:to|=)\s+(.+)$", statement)
        if search:
            first = search.group(1).split(",", 1)[0].strip()
            active_schema = clean_ident(first)
            continue

        match = re.search(
            r"(?is)\bcreate\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?"
            r"(?:(?P<schema>\"?[A-Za-z_][A-Za-z0-9_]*\"?)\s*\.\s*)?"
            r"(?P<table>\"?[A-Za-z_][A-Za-z0-9_]*\"?)",
            statement,
        )
        if not match:
            continue
        schema = clean_ident(match.group("schema")) if match.group("schema") else active_schema
        table = clean_ident(match.group("table"))
        if schema in CUSTOM_SCHEMAS:
            created.add((schema, table))
    return created


def rls_enabled_tables(sql: str) -> set[tuple[str, str]]:
    cleaned = strip_comments(sql)
    enabled: set[tuple[str, str]] = set()
    for match in re.finditer(
        r"(?is)\balter\s+table\s+(?:only\s+)?"
        r"(?:(?P<schema>\"?[A-Za-z_][A-Za-z0-9_]*\"?)\s*\.\s*)"
        r"(?P<table>\"?[A-Za-z_][A-Za-z0-9_]*\"?)\s+enable\s+row\s+level\s+security\b",
        cleaned,
    ):
        enabled.add((clean_ident(match.group("schema")), clean_ident(match.group("table"))))

    # Also support migrations that set a custom schema search_path and use an
    # unqualified ALTER TABLE. Parse statement-by-statement for that case.
    active_schema: str | None = None
    for statement in [part.strip() for part in cleaned.split(";") if part.strip()]:
        search = re.match(r"(?is)^set\s+search_path\s+(?:to|=)\s+(.+)$", statement)
        if search:
            active_schema = clean_ident(search.group(1).split(",", 1)[0].strip())
            continue
        match = re.match(
            r"(?is)^alter\s+table\s+(?:only\s+)?(?P<table>\"?[A-Za-z_][A-Za-z0-9_]*\"?)"
            r"\s+enable\s+row\s+level\s+security\b",
            statement,
        )
        if match and active_schema in CUSTOM_SCHEMAS:
            enabled.add((active_schema, clean_ident(match.group("table"))))
    return enabled


def validate_sql(sql: str, label: str) -> list[str]:
    created = created_custom_tables(sql)
    enabled = rls_enabled_tables(sql)
    missing = sorted(created - enabled)
    return [f"{label}: {schema}.{table} is created without ENABLE ROW LEVEL SECURITY" for schema, table in missing]


def changed_migrations(base_sha: str, head_sha: str) -> list[pathlib.Path]:
    output = subprocess.check_output(
        ["git", "diff", "--name-only", f"{base_sha}...{head_sha}", "--", "db/migrations/*.sql"],
        text=True,
    )
    return [pathlib.Path(line.strip()) for line in output.splitlines() if line.strip()]


def self_test() -> None:
    good = """
    SET search_path TO comind, public;
    CREATE TABLE IF NOT EXISTS sample(id bigint primary key);
    ALTER TABLE sample ENABLE ROW LEVEL SECURITY;
    CREATE TABLE comind_pm.other(id bigint primary key);
    ALTER TABLE comind_pm.other ENABLE ROW LEVEL SECURITY;
    """
    bad = """
    SET search_path TO comind, public;
    CREATE TABLE missing_rls(id bigint primary key);
    """
    quoted = 'CREATE TABLE "comind"."quoted_table"(id bigint); ALTER TABLE "comind"."quoted_table" ENABLE ROW LEVEL SECURITY;'
    if validate_sql(good, "good"):
        raise SystemExit("self-test rejected valid RLS migration")
    if not validate_sql(bad, "bad"):
        raise SystemExit("self-test failed to detect missing RLS")
    if validate_sql(quoted, "quoted"):
        raise SystemExit("self-test rejected quoted valid RLS migration")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-sha")
    parser.add_argument("--head-sha")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        print("SEC-RLS-001 migration guard self-test passed.")
        if not (args.base_sha and args.head_sha):
            return 0

    if not args.base_sha or not args.head_sha:
        parser.error("--base-sha and --head-sha are required unless only --self-test is used")

    failures: list[str] = []
    for path in changed_migrations(args.base_sha, args.head_sha):
        if not path.exists():
            continue
        failures.extend(validate_sql(path.read_text(encoding="utf-8"), str(path)))

    if failures:
        print("SEC-RLS-001 custom-schema RLS migration guard failed:", file=sys.stderr)
        for failure in failures:
            print(f"- {failure}", file=sys.stderr)
        return 1

    print("SEC-RLS-001 custom-schema RLS migration guard passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
