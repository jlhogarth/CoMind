import { Database, GitBranch, ShieldCheck } from "lucide-react";

const foundations = [
  {
    title: "Schema Registry",
    detail: "Normalized PostgreSQL relations, columns, keys, and referential actions.",
    icon: Database,
  },
  {
    title: "Relationship Graph",
    detail: "Deterministic inbound and outbound foreign-key navigation.",
    icon: GitBranch,
  },
  {
    title: "Governed Access",
    detail: "Browser access remains RLS-bound. Privileged credentials stay server-side.",
    icon: ShieldCheck,
  },
];

export default function Home() {
  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">CoMind</div>
        <div className="product">Operator Console</div>
        <div className="status">OC-001 foundation</div>
      </aside>
      <section className="content">
        <p className="eyebrow">Governed relational operations</p>
        <h1>Inspect the structure before changing the system.</h1>
        <p className="lede">
          OC-001 establishes the schema-driven foundation. Live schema mutation, destructive operations,
          and privileged browser access remain outside this milestone.
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
        <a className="activity-launch" href="/activity">Open Activity HUD</a>
      </section>
    </main>
  );
}
