"use client";

import { useEffect, useMemo, useState } from "react";

import { DataGrid } from "@/components/data/DataGrid";
import { RelationSidebar } from "@/components/schema/RelationSidebar";
import { readRelationPage } from "@/lib/queries/read";
import { buildSchemaGraph } from "@/lib/schema/registry";
import type { SchemaGraph, SchemaRelation } from "@/lib/schema/types";
import { validateSchemaMetadata } from "@/lib/schema/validate";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";

interface LiveState {
  graph?: SchemaGraph;
  error?: string;
}

export function LiveExplorer() {
  const [live, setLive] = useState<LiveState>({});
  const [selectedKey, setSelectedKey] = useState<string>();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [readError, setReadError] = useState<string>();
  const [loadingRows, setLoadingRows] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadMetadata() {
      try {
        const response = await fetch("/api/schema", { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body?.message ?? `Schema endpoint returned HTTP ${response.status}`);
        }
        const graph = buildSchemaGraph(validateSchemaMetadata(body));
        if (cancelled) return;
        setLive({ graph });
        setSelectedKey((current) => current ?? graph.relations[0]?.key);
      } catch (error) {
        if (cancelled) return;
        setLive({ error: error instanceof Error ? error.message : "Unable to load live schema metadata" });
      }
    }

    void loadMetadata();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedRelation = useMemo(
    () => (selectedKey && live.graph ? live.graph.byKey.get(selectedKey) : undefined),
    [live.graph, selectedKey],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadRows(relation: SchemaRelation) {
      setLoadingRows(true);
      setReadError(undefined);
      try {
        if (relation.schema !== "public") {
          throw new Error(`Browser reads are not authorized for schema ${relation.schema}`);
        }
        const result = await readRelationPage(getBrowserSupabaseClient(), {
          relation: relation.name,
          page: 1,
          pageSize: 25,
        });
        if (cancelled) return;
        setRows(result.rows);
        setCount(result.count);
      } catch (error) {
        if (cancelled) return;
        setRows([]);
        setCount(null);
        setReadError(error instanceof Error ? error.message : "Unable to read live relation");
      } finally {
        if (!cancelled) setLoadingRows(false);
      }
    }

    if (selectedRelation) {
      void loadRows(selectedRelation);
    } else {
      setRows([]);
      setCount(null);
      setReadError(undefined);
      setLoadingRows(false);
    }

    return () => {
      cancelled = true;
    };
  }, [selectedRelation]);

  if (live.error) {
    return (
      <section className="live-panel" aria-live="polite">
        <h2>Live connection unavailable</h2>
        <p className="failure">{live.error}</p>
        <p>The Console is failing closed. No privileged browser fallback is permitted.</p>
      </section>
    );
  }

  if (!live.graph) {
    return (
      <section className="live-panel" aria-live="polite">
        <h2>Connecting to governed metadata</h2>
        <p>Waiting for the protected schema provider.</p>
      </section>
    );
  }

  return (
    <section className="live-panel" aria-label="Live Supabase relational explorer">
      <div className="live-heading">
        <div>
          <p className="eyebrow">Live Supabase</p>
          <h2>RLS-bound relational explorer</h2>
        </div>
        <span className="connection-badge">publishable browser path</span>
      </div>

      <div className="explorer-grid">
        <div className="relation-list">
          <RelationSidebar graph={live.graph} selectedKey={selectedKey} onSelect={setSelectedKey} />
        </div>

        <div className="relation-detail">
          {selectedRelation ? (
            <>
              <div className="relation-title-row">
                <div>
                  <h3>{selectedRelation.schema}.{selectedRelation.name}</h3>
                  <p>{selectedRelation.kind} · {selectedRelation.columns.length} columns · {count ?? "unknown"} visible rows</p>
                </div>
              </div>

              <div className="relationship-strip">
                <span>{selectedRelation.outboundForeignKeys.length} outbound relationships</span>
                <span>{selectedRelation.inboundForeignKeys.length} inbound relationships</span>
              </div>

              {loadingRows ? <p>Loading RLS-visible rows...</p> : null}
              {readError ? <p className="failure">{readError}</p> : null}
              {!loadingRows && !readError ? <DataGrid rows={rows} /> : null}
            </>
          ) : (
            <p>No registry-approved relation is available.</p>
          )}
        </div>
      </div>
    </section>
  );
}
