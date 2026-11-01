import type { ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  BookOpen,
  Boxes,
  CheckCircle2,
  Cloud,
  Database,
  DollarSign,
  ExternalLink,
  FileCheck2,
  FolderGit2,
  Gauge,
  Github,
  GitBranch,
  Globe2,
  HardDrive,
  LayoutDashboard,
  Smartphone,
  LockKeyhole,
  Mail,
  Network,
  ServerCog,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";

import { CoMindMark } from "../components/CoMindMark";
import { ThreadKeeperPanel } from "../components/ThreadKeeperPanel";
import { WorkspaceMailPanel } from "../components/WorkspaceMailPanel";
import styles from "./control-plane.module.css";

const navItems = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard, active: true },
  { label: "Monitoring", href: "/activity", icon: Activity },
  { label: "CBE Mobile Control", href: "/cbe-control", icon: Smartphone },
  { label: "RuleBook HUD", href: "/rulebook", icon: ShieldCheck },
  { label: "Integration Gateway", href: "/integrations", icon: Network },
  { label: "Approvals", href: "https://approvals.comindinc.com", icon: CheckCircle2, external: true },
  { label: "Cloudflare", href: "https://dash.cloudflare.com", icon: Cloud, external: true },
  { label: "ThreadKeeper", href: "#threadkeeper", icon: GitBranch },
  { label: "Workspace Mail", href: "#workspace-mail", icon: Mail },
  { label: "Documentation", href: "https://github.com/jlhogarth/CoMind/tree/main/docs", icon: BookOpen, external: true },
  { label: "Google Drive", href: "https://drive.google.com", icon: HardDrive, external: true },
  { label: "GitHub", href: "https://github.com/jlhogarth/CoMind", icon: Github, external: true },
];

const quickActions = [
  { label: "Open Activity HUD", href: "/activity", icon: Gauge },
  { label: "Open CBE Mobile Control", href: "/cbe-control", icon: Smartphone },
  { label: "Open Integration Gateway", href: "/integrations", icon: Network },
  { label: "Review Approvals", href: "https://approvals.comindinc.com", icon: CheckCircle2, external: true },
  { label: "View Infrastructure", href: "https://dash.cloudflare.com", icon: ServerCog, external: true },
  { label: "Open Documentation", href: "https://github.com/jlhogarth/CoMind/tree/main/docs", icon: BookOpen, external: true },
];

const serviceCards = [
  { title: "Cloudflare", detail: "Registrar, authoritative DNS, Workers", state: "Connected control plane", icon: Cloud, source: "Cloudflare account" },
  { title: "Supabase", detail: "Governed relational state and evidence", state: "Test project bound", icon: Database, source: "RLS remains authoritative" },
  { title: "Google Workspace", detail: "Identity, mail, Drive and planning", state: "DNS integrated", icon: Workflow, source: "CoMindInc.com" },
  { title: "GitHub", detail: "Source, issues, PRs and CI evidence", state: "Repository connected", icon: Github, source: "jlhogarth/CoMind" },
  { title: "Composio", detail: "Governed integration and managed OAuth substrate", state: "CIG-001 verified", icon: Network, source: "GitHub + Supabase proof" },
  { title: "Domain Security", detail: "CoMindInc.com and CoMindForge.com", state: "Two governed domains", icon: Globe2, source: "Cloudflare Registrar" },
  { title: "Evidence", detail: "Acceptance requires executed verification", state: "Evidence-first", icon: FileCheck2, source: "AGENTS.md policy" },
];

const infrastructureRows = [
  ["Operator Console", "Live at console.comindinc.com"],
  ["Activity HUD", "Bounded read-only route"],
  ["RuleBook HUD", "Governed control-health route"],
  ["Integration Gateway", "CIG-001 governed process route"],
  ["Approval Portal", "External governed approval service"],
  ["Deployment perimeter", "Cloudflare Access + origin proxy + Vercel protection"],
];

function ExternalAwareLink({
  href,
  external,
  className,
  children,
}: Readonly<{
  href: string;
  external?: boolean;
  className: string;
  children: ReactNode;
}>) {
  return (
    <a className={className} href={href} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
      {children}
    </a>
  );
}

export default function Home() {
  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar} aria-label="CoMind control plane navigation">
        <a className={styles.brandRow} href="/" aria-label="CoMind dashboard home">
          <CoMindMark className={styles.logoWrap} compact />
          <span className={styles.brandName}>CoMind</span>
        </a>

        <nav className={styles.nav}>
          {navItems.slice(0, 8).map(({ label, href, icon: Icon, active, external }) => (
            <ExternalAwareLink
              key={label}
              href={href}
              external={external}
              className={`${external ? styles.navExternal : styles.navLink} ${active ? styles.navLinkActive : ""}`}
            >
              <Icon size={17} aria-hidden="true" />
              <span>{label}</span>
              {external ? <ExternalLink size={12} aria-hidden="true" /> : null}
            </ExternalAwareLink>
          ))}
          <div className={styles.navDivider} aria-hidden="true" />
          {navItems.slice(8).map(({ label, href, icon: Icon, external }) => (
            <ExternalAwareLink key={label} href={href} external={external} className={styles.navExternal}>
              <Icon size={17} aria-hidden="true" />
              <span>{label}</span>
              <ExternalLink size={12} aria-hidden="true" />
            </ExternalAwareLink>
          ))}
        </nav>

        <div className={styles.sideFooter}>
          <div className={styles.sideFooterTop}>
            <CoMindMark className={styles.logoWrap} compact />
            <div>
              <strong>CoMind Control Plane</strong>
              <span>Governed Development/Test operator surface</span>
            </div>
          </div>
          <div className={styles.sideState}><i aria-hidden="true" /> Live deployment · Development/Test controls</div>
        </div>
      </aside>

      <section className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.search} aria-label="Current control plane scope">
            <Network size={15} aria-hidden="true" />
            <span>Operator Console / governed Development-Test surface</span>
            <kbd>DEV/TEST</kbd>
          </div>
          <div className={styles.topStatus}><span className={styles.stateDot} aria-hidden="true" /> Live behind governed access perimeter</div>
        </header>

        <div className={styles.content}>
          <section className={styles.hero} aria-labelledby="control-plane-title">
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>Welcome to CoMind</p>
              <h1 className={styles.title} id="control-plane-title">
                <span className={styles.titleAccent}>CoMind</span> Control Plane
              </h1>
              <p className={styles.subtitle}>Unified infrastructure, monitoring, governance, operations, and evidence.</p>
              <div className={styles.heroBadges} aria-label="Control plane design principles">
                <span className={styles.heroBadge}><LockKeyhole size={13} /> Secure</span>
                <span className={styles.heroBadge}><Boxes size={13} /> Composable</span>
                <span className={styles.heroBadge}><Activity size={13} /> Observable</span>
                <span className={styles.heroBadge}><ShieldCheck size={13} /> Governed</span>
                <span className={styles.heroBadge}><Sparkles size={13} /> Built for what&apos;s next</span>
              </div>
            </div>
            <div className={styles.heroArt} aria-hidden="true">
              <div className={styles.heroGlow} />
              <div className={styles.heroChip}><CoMindMark className={styles.logoWrap} /></div>
              <div className={styles.heroWordmark}>Intelligent infrastructure<br />human authority<br />persistent evidence</div>
            </div>
          </section>

          <section className={styles.quickPanel} aria-labelledby="quick-actions-heading">
            <div className={styles.quickHeader}>
              <Sparkles size={18} color="#4fd8ff" aria-hidden="true" />
              <div>
                <h2 id="quick-actions-heading">Quick Actions</h2>
                <p>Only wired, bounded destinations are enabled from the Control Plane.</p>
              </div>
            </div>
            <div className={styles.quickGrid}>
              {quickActions.map(({ label, href, icon: Icon, external }) => (
                <ExternalAwareLink key={label} href={href} external={external} className={styles.quickAction}>
                  <Icon size={21} aria-hidden="true" />
                  <span>{label}</span>
                  <ArrowRight size={15} aria-hidden="true" />
                </ExternalAwareLink>
              ))}
            </div>
          </section>

          <WorkspaceMailPanel />
          <ThreadKeeperPanel />

          <section className={styles.grid} aria-label="CoMind control plane overview">
            <article className={styles.card}>
              <div className={styles.cardHeader}><span className={styles.cardIcon}><Gauge size={17} color="#55e3bb" /> <strong>System Surface</strong></span></div>
              <div className={styles.metricValue}>2 HUDs</div>
              <div className={styles.metricLabel}>Activity, RuleBook, and Integration Gateway routes are already implemented.</div>
              <div className={styles.metricMeta}>Bounded read-only visibility</div>
            </article>

            <article className={styles.card}>
              <div className={styles.cardHeader}><span className={styles.cardIcon}><FolderGit2 size={17} color="#63d8ff" /> <strong>Development</strong></span></div>
              <div className={styles.metricValue}>Dev/Test</div>
              <div className={styles.metricLabel}>The Console is deployed for governed evaluation while application behavior remains under active development.</div>
              <div className={styles.metricMeta}>Security perimeter active · application posture remains Development/Test</div>
            </article>

            <article className={styles.card}>
              <div className={styles.cardHeader}><span className={styles.cardIcon}><CheckCircle2 size={17} color="#9c82ff" /> <strong>Approvals</strong></span></div>
              <div className={styles.metricValue}>Gated</div>
              <div className={styles.metricLabel}>Consequential and paid actions route through the approval system.</div>
              <div className={styles.metricMeta}>No destructive HUD actions</div>
            </article>

            <article className={styles.card}>
              <div className={styles.cardHeader}><span className={styles.cardIcon}><DollarSign size={17} color="#64d2ff" /> <strong>API / Cost</strong></span></div>
              <div className={styles.metricValue}>Governed</div>
              <div className={styles.metricLabel}>Incremental paid external usage requires a bounded spending envelope.</div>
              <div className={styles.metricMeta}>No paid call triggered by this page</div>
            </article>

            {serviceCards.map(({ title, detail, state, icon: Icon, source }) => (
              <article className={styles.serviceCard} key={title}>
                <div className={styles.serviceHeader}><span className={styles.cardIcon}><Icon size={16} color="#68dfff" /> <strong>{title}</strong></span></div>
                <div className={styles.serviceState}><span className={styles.stateDot} aria-hidden="true" /> {state}</div>
                <div className={styles.serviceBody}>{detail}</div>
                <div className={styles.serviceSource}>Source: {source}</div>
              </article>
            ))}

            <article className={styles.wideCard}>
              <div className={styles.sectionHeader}>
                <h2>Recent Activity</h2>
                <Activity size={16} color="#9d86ff" aria-hidden="true" />
              </div>
              <div className={styles.activityBody}>
                <div>
                  <strong>Runtime activity remains evidence-backed.</strong>
                  <p>The landing page does not fabricate recent events. Open the Activity HUD for current bounded observations and source evidence.</p>
                  <a href="/activity">Open Activity HUD <ArrowRight size={12} /></a>
                </div>
              </div>
            </article>

            <article className={styles.wideCard}>
              <div className={styles.sectionHeader}>
                <h2>Infrastructure Status</h2>
                <Network size={16} color="#62d9ff" aria-hidden="true" />
              </div>
              <div className={styles.statusList}>
                {infrastructureRows.map(([name, state]) => (
                  <div className={styles.statusRow} key={name}>
                    <div className={styles.statusName}><span className={styles.stateDot} aria-hidden="true" /> {name}</div>
                    <div className={styles.statusValue}>{state}</div>
                  </div>
                ))}
              </div>
            </article>

            <aside className={styles.bottomBanner}>
              <CoMindMark className={styles.logoWrap} compact />
              <div>
                <strong>Build. Monitor. Govern. Together.</strong>
                <p>The Control Plane shell is deployed. Live provider telemetry and governed administrative actions can be layered on without replacing it.</p>
              </div>
              <a href="https://github.com/jlhogarth/CoMind/issues/291" target="_blank" rel="noreferrer">Control Plane foundation <ExternalLink size={11} /></a>
            </aside>
          </section>
        </div>
      </section>
    </main>
  );
}
