const COMIND_GITHUB = "https://github.com/jlhogarth/CoMind";

export interface ActivityReferenceLink {
  href: string;
  external: true;
}

function safeHttpUrl(reference: string): string | null {
  try {
    const url = new URL(reference);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function resolveActivityReference(
  sourceSystem: string | null | undefined,
  reference: string | null | undefined,
): ActivityReferenceLink | null {
  const ref = reference?.trim();
  if (!ref) return null;

  const literalUrl = safeHttpUrl(ref);
  if (literalUrl) return { href: literalUrl, external: true };

  if ((sourceSystem ?? "").trim().toLowerCase() !== "github") return null;

  const issue = ref.match(/^github:issue[/:](\d+)$/i);
  if (issue) return { href: `${COMIND_GITHUB}/issues/${issue[1]}`, external: true };

  const pull = ref.match(/^github:pr[/:](\d+)(?:@[0-9a-f]{7,40})?$/i);
  if (pull) return { href: `${COMIND_GITHUB}/pull/${pull[1]}`, external: true };

  const humanPull = ref.match(/^PR\s*#?\s*(\d+)\b/i);
  if (humanPull) return { href: `${COMIND_GITHUB}/pull/${humanPull[1]}`, external: true };

  const merge = ref.match(/^github:(?:merge|commit)[/:]([0-9a-f]{7,40})$/i);
  if (merge) return { href: `${COMIND_GITHUB}/commit/${merge[1]}`, external: true };

  if (/^[0-9a-f]{7,40}$/i.test(ref)) {
    return { href: `${COMIND_GITHUB}/commit/${ref}`, external: true };
  }

  return null;
}
