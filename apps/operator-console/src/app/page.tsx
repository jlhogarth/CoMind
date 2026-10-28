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
        <div className="status">Governed Test operations</div>
      </aside>
      <section className="content">
        <p className="eyebrow">Governed relational operations</p>
        <h1>Inspect the structure and control state before changing the system.</h1>
        <p className="lede">
          The Operator Console exposes bounded Test views for operational activity and RuleBook control health.
          Privileged browser access, raw governance evidence, sensitive runtime context, and destructive operations remain outside these views.
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
        <div className="hud-heading-actions">
          <a className="activity-launch" href="/activity">Open Activity HUD</a>
          <a className="activity-launch" href="/rulebook">Open RuleBook HUD</a>
        </div>
      </section>
    </main>
  );
}
