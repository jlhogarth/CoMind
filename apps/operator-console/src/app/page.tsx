import { Database, GitBranch, ShieldCheck } from "lucide-react";

import { LiveExplorer } from "@/components/live/LiveExplorer";

const foundations = [
  {
    title: "Live Schema Registry",
    detail: "Server-protected metadata discovery exposes only relations approved for browser inspection.",
    icon: Database,
  },
  {
    title: "Relationship Graph",
    detail: "Actual foreign-key structure drives deterministic inbound and outbound navigation.",
    icon: GitBranch,
  },
  {
    title: "Separated Authority",
    detail: "Browser reads remain RLS-bound. Administrative mutations use a distinct server-only execution path.",
    icon: ShieldCheck,
  },
];

export default function Home() {
  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">CoMind</div>
        <div className="product">Operator Console</div>
        <div className="status">OC-002 live activation</div>
      </aside>
      <section className="content">
        <p className="eyebrow">Governed relational operations</p>
        <h1>Observe live state without collapsing the trust boundary.</h1>
        <p className="lede">
          Ordinary Console reads use the live CoMind Supabase project through the publishable browser path and remain subject to RLS. Privileged administrative execution is isolated behind a server-only capability gate and an auditable database mutation contract.
        </p>
        <div className="cards">
          {foundations.map(({ title, detail, icon: Icon }) => (
            <article className="card" key={title}>
              <Icon aria-hidden="true" size={22} />
              <h2>{title}</h2>
              <p>{detail}</p>
            </article>
          ))}
        </div>
        <LiveExplorer />
      </section>
    </main>
  );
}
