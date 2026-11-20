type Execution = {
  execution_id: string;
  source_sha256: string;
  artifact_sha256: string | null;
  event_count: number;
};
type Event = { sequence: number; event_at: string; payload_sha256: string };
type Page<T> = { rows: T[]; total: number; page: number; pageSize: number };
type Detail = Page<Event> & { execution: Execution };

const baseline = [
  { id: "580f3fad73905c8230b2bfc8", count: 65,
    source: "20c8cb5e98411d906d0a7bf6019d1e70180959507089f40459ffe6b7718e48f5",
    artifact: "a013cd169013318b68fbec1da97843da6a9657aabc235def95a45d6eaa916cea",
    hashes: "a96f47fff28ebd9193fda4624f94f8848da513be5e6d437bf2f052c945066934",
    timestamps: "b68b9e531f2d01bb2c6f5b9af45732050093af5edc2cff679ef7901f7e0ba50a" },
  { id: "46a39216f4a41b89382a3fb1", count: 122,
    source: "99b51c0ad111e0c98e3df02c68182f94a4b01d0c8cf688f87ff804f8f06b1a23",
    artifact: "a013cd169013318b68fbec1da97843da6a9657aabc235def95a45d6eaa916cea",
    hashes: "6f80fcdb7e3ded1707e0b3f31dee46c6ff6a388d4696402a009a10477bc97099",
    timestamps: "8191ab0d2c0bd1cc0302510ed70fc26256e2ee831b05e250f4df58c6d0d66e31" },
  { id: "19a6a6fe965a0526017a656c", count: 59,
    source: "8ea539e6eb426ae1bffa607f9c3bffaf299fd371e9496d12cab4e55333972ed8",
    artifact: "d88aea8be00f1959b85d9f18941562a84eaf1ddcce9752737d6a0358d2d68e95",
    hashes: "e0d59d8538432736f3f070a862e3a5d3aa8af06298153caab71787a3b601419a",
    timestamps: "7f8317e78aed76ebc73cdc825277e8c5cbb782558eafd459f445235e8c396aba" },
] as const;

const size = 25;
async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type BaselineResult = { id: string; expected: number; received: number; pages: number; passed: boolean; reason: string };
export type BaselineReport = { checkedAt: string; results: BaselineResult[]; passed: boolean };

export async function verifyAedBaseline(load: (path: string) => Promise<unknown>): Promise<BaselineReport> {
  const checkedAt = new Date().toISOString();
  const list = await load(`/api/aed/executions?page=1&pageSize=100`) as Page<Execution>;
  if (!Number.isSafeInteger(list.total) || list.total < 0 || list.total > 10000) throw new Error("Invalid execution total");
  const executions = [...list.rows];
  for (let page = 2; executions.length < list.total; page++) {
    if (page > 100) throw new Error("Execution history exceeded verification bound");
    const next = await load(`/api/aed/executions?page=${page}&pageSize=100`) as Page<Execution>;
    if (next.page !== page || next.pageSize !== 100 || next.total !== list.total || next.rows.length === 0) throw new Error("Execution pagination changed");
    executions.push(...next.rows);
  }

  const results: BaselineResult[] = [];
  for (const item of baseline) {
    const metadata = executions.filter((row) => row.execution_id === item.id);
    if (metadata.length !== 1) {
      results.push({ id: item.id, expected: item.count, received: 0, pages: 0, passed: false, reason: "Execution missing or duplicated" });
      continue;
    }
    const pages = Math.ceil(item.count / size);
    const events: Event[] = [];
    let validPages = true;
    for (let page = 1; page <= pages; page++) {
      const detail = await load(`/api/aed/executions/${item.id}?page=${page}&pageSize=${size}`) as Detail;
      if (detail.page !== page || detail.pageSize !== size || detail.total !== item.count ||
          detail.execution.execution_id !== item.id || detail.rows.length !== Math.min(size, item.count - events.length)) validPages = false;
      events.push(...detail.rows);
    }
    const sequenceValid = events.length === item.count && events.every((row, index) => row.sequence === index + 1);
    const metadataValid = metadata[0].event_count === item.count && metadata[0].source_sha256 === item.source &&
      metadata[0].artifact_sha256 === item.artifact;
    let digestValid = false;
    if (sequenceValid) {
      const hashes = await sha256(events.map((row) => `${row.sequence}:${row.payload_sha256}`).join("|"));
      const timestamps = await sha256(events.map((row) => `${row.sequence}:${new Date(row.event_at).toISOString()}`).join("|"));
      digestValid = hashes === item.hashes && timestamps === item.timestamps;
    }
    const passed = validPages && sequenceValid && metadataValid && digestValid;
    results.push({ id: item.id, expected: item.count, received: events.length, pages, passed,
      reason: passed ? "Metadata, pages, sequence, recorded hashes and timestamps match independent database digests" :
        "Metadata, pagination, sequence or database digest mismatch" });
  }
  return { checkedAt, results, passed: results.length === baseline.length && results.every((row) => row.passed) };
}
