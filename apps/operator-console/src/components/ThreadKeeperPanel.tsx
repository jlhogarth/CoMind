import {
  ExternalLink,
  GitBranch,
  GitCompareArrows,
  History,
  Network,
  RefreshCcw,
  ShieldCheck,
  Waypoints,
} from "lucide-react";

import styles from "./ThreadKeeperPanel.module.css";

const githubRoot = "https://github.com/jlhogarth/CoMind";

const canonicalLinks = [
  {
    label: "C4 final closure",
    detail: "Canonical C4 Operational acceptance and Production=false boundary",
    href: `${githubRoot}/blob/main/docs/provenance/2026-10-28-tk-007-c4-final-closure.md`,
  },
  {
    label: "Expansion closure",
    detail: "TK-008 through TK-012 accepted capability index and consumer direction",
    href: `${githubRoot}/blob/main/docs/architecture/threadkeeper-capability-expansion-closure.md`,
  },
  {
    label: "Closure PR #337",
    detail: "Final documentation reconciliation for the accepted expansion set",
    href: `${githubRoot}/pull/337`,
  },
  {
    label: "Founding capability contract",
    detail: "Original bounded ownership contract, retained as architectural lineage",
    href: `${githubRoot}/blob/main/docs/architecture/threadkeeper-capability-contract.md`,
  },
] as const;

const capabilities = [
  {
    code: "TK-008",
    label: "Continuity propagation",
    icon: Waypoints,
    href: `${githubRoot}/blob/main/docs/architecture/threadkeeper-continuity-propagation.md`,
  },
  {
    code: "TK-009",
    label: "Impact and drift",
    icon: Network,
    href: `${githubRoot}/blob/main/docs/architecture/threadkeeper-continuity-impact-drift.md`,
  },
  {
    code: "TK-010",
    label: "Compatibility and replay",
    icon: History,
    href: `${githubRoot}/blob/main/docs/architecture/threadkeeper-continuity-compatibility-replay.md`,
  },
  {
    code: "TK-011",
    label: "Decision reconsideration",
    icon: RefreshCcw,
    href: `${githubRoot}/blob/main/docs/architecture/threadkeeper-decision-reconsideration.md`,
  },
  {
    code: "TK-012",
    label: "Governed branch and merge",
    icon: GitCompareArrows,
    href: `${githubRoot}/blob/main/docs/architecture/threadkeeper-governed-branch-merge.md`,
  },
] as const;

export function ThreadKeeperPanel() {
  return (
    <section className={styles.panel} id="threadkeeper" aria-labelledby="threadkeeper-heading">
      <div className={styles.header}>
        <div className={styles.headingGroup}>
          <span className={styles.headingIcon} aria-hidden="true">
            <GitBranch size={19} />
          </span>
          <div>
            <p className={styles.eyebrow}>Continuity control plane</p>
            <h2 id="threadkeeper-heading">ThreadKeeper</h2>
            <p className={styles.description}>
              Governed continuity across checkpoints, handoffs, decisions, compatibility, drift, and non-canonical branches.
              The Console exposes accepted status and evidence only; it does not grant ThreadKeeper new authority.
            </p>
          </div>
        </div>
        <div className={styles.statusGroup} aria-label="ThreadKeeper accepted state">
          <span className={styles.statusBadge}><ShieldCheck size={14} aria-hidden="true" /> C4 Operational</span>
          <span className={styles.testBadge}>Test</span>
          <span className={styles.productionBadge}>Production=false</span>
        </div>
      </div>

      <div className={styles.summaryGrid}>
        <article className={styles.summaryCard}>
          <span>Maturity</span>
          <strong>C4 Operational</strong>
          <p>Founder-accepted and canonically promoted under journal <code>JRN-20261028-0001</code>.</p>
        </article>
        <article className={styles.summaryCard}>
          <span>Expansion</span>
          <strong>TK-008 through TK-012</strong>
          <p>Accepted repository capabilities, reconciled through closure PR #337.</p>
        </article>
        <article className={styles.summaryCard}>
          <span>Authority</span>
          <strong>Continuity, not control</strong>
          <p>No truth determination, RuleBook authority, execution ownership, self-approval, or automatic canonical promotion.</p>
        </article>
      </div>

      <div className={styles.capabilityGrid} aria-label="Accepted ThreadKeeper expansion capabilities">
        {capabilities.map(({ code, label, icon: Icon, href }) => (
          <a className={styles.capabilityLink} href={href} target="_blank" rel="noreferrer" key={code}>
            <Icon size={16} aria-hidden="true" />
            <span><b>{code}</b>{label}</span>
            <ExternalLink size={12} aria-hidden="true" />
          </a>
        ))}
      </div>

      <div className={styles.canonicalSection}>
        <div>
          <h3>Canonical ThreadKeeper references</h3>
          <p>Current status comes from the accepted C4 and expansion closures. The founding contract is linked for lineage, not as the current maturity record.</p>
        </div>
        <div className={styles.linkGrid}>
          {canonicalLinks.map(({ label, detail, href }) => (
            <a className={styles.referenceLink} href={href} target="_blank" rel="noreferrer" key={label}>
              <span><strong>{label}</strong><small>{detail}</small></span>
              <ExternalLink size={13} aria-hidden="true" />
            </a>
          ))}
        </div>
      </div>

      <div className={styles.boundaryNote}>
        <ShieldCheck size={14} aria-hidden="true" />
        <span>Visibility only. No ThreadKeeper state mutation, checkpoint acceptance, authority grant, branch promotion, Production activation, or paid provider call is available from this panel.</span>
      </div>
    </section>
  );
}
