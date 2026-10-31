import { ExternalLink, Mail, ShieldCheck } from "lucide-react";

import styles from "./WorkspaceMailPanel.module.css";

const workspaceMailboxes = [
  {
    label: "Joseph / Workspace Admin",
    address: "JLHogarth@comindinc.com",
    detail: "Primary CoMindInc.com Workspace identity",
  },
  {
    label: "CoMind Development",
    address: "CoMindDevelopment@comindinc.com",
    detail: "Development mailbox",
  },
] as const;

function gmailInboxUrl(address: string) {
  return `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(address)}`;
}

export function WorkspaceMailPanel() {
  return (
    <section className={styles.panel} id="workspace-mail" aria-labelledby="workspace-mail-heading">
      <div className={styles.header}>
        <div className={styles.headingGroup}>
          <span className={styles.headingIcon} aria-hidden="true">
            <Mail size={19} />
          </span>
          <div>
            <p className={styles.eyebrow}>Google Workspace</p>
            <h2 id="workspace-mail-heading">Workspace Mail</h2>
            <p className={styles.description}>
              Quick access to approved CoMindInc.com mail identities. Mail content and credentials stay with Google.
            </p>
          </div>
        </div>
        <span className={styles.privacyBadge}>
          <ShieldCheck size={14} aria-hidden="true" />
          Navigation only
        </span>
      </div>

      <div className={styles.mailboxGrid}>
        {workspaceMailboxes.map(({ label, address, detail }) => (
          <article className={styles.mailboxCard} key={address}>
            <div className={styles.mailboxIdentity}>
              <span className={styles.mailIcon} aria-hidden="true"><Mail size={17} /></span>
              <div>
                <strong>{label}</strong>
                <span className={styles.address}>{address}</span>
              </div>
            </div>
            <p>{detail}</p>
            <a
              className={styles.openInbox}
              href={gmailInboxUrl(address)}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${address} inbox`}
            >
              Open Inbox
              <ExternalLink size={14} aria-hidden="true" />
            </a>
          </article>
        ))}
      </div>

      <div className={styles.footerLinks}>
        <a href="https://mail.google.com" target="_blank" rel="noreferrer">
          Gmail home <ExternalLink size={12} aria-hidden="true" />
        </a>
        <a href="https://admin.google.com" target="_blank" rel="noreferrer">
          Workspace Admin <ExternalLink size={12} aria-hidden="true" />
        </a>
        <span>No mailbox API access is used by this panel.</span>
      </div>
    </section>
  );
}
