import { ConversationMessage } from './assistant.js';

export interface C11TrustBoundaryObservation {
  readonly untrusted_input: boolean;
  readonly asks_for_secrets: boolean;
  readonly authority_escalation: boolean;
  readonly side_effect: boolean;
  readonly human_approved: boolean;
}

const SECRET_TARGET = /\b(api[ _-]?key|access[ _-]?token|refresh[ _-]?token|bearer[ _-]?token|password|passphrase|credential|secret|private[ _-]?key|client[ _-]?secret|service[ _-]?role|database[ _-]?url|authorization[ _-]?header)\b/i;
const DISCLOSURE_ACTION = /\b(show|print|reveal|display|give|send|return|dump|expose|share|tell|provide|read|extract|leak|publish|what\s+is|what(?:'s| is))\b/i;
const AUTHORITY_ESCALATION = [
  /\b(ignore|disregard|override|bypass|disable|remove|skip)\b.{0,80}\b(instruction|policy|rule|approval|authorization|permission|guardrail|safety|security|governance|restriction|limit)\b/i,
  /\b(grant|give|assign|elevate|increase)\b.{0,60}\b(admin|administrator|root|owner|permission|privilege|authority|access)\b/i,
  /\b(act|behave|operate)\s+as\b.{0,40}\b(admin|administrator|root|owner|authorized|unrestricted)\b/i,
  /\b(pretend|assume)\b.{0,60}\b(approved|authorized|permission|authority|admin|administrator|root)\b/i,
  /\b(without|no)\b.{0,40}\b(approval|authorization|permission|review)\b/i,
];

function isUntrustedRole(role: ConversationMessage['role']) {
  return role === 'user' || role === 'tool';
}

function requestsSecret(content: string) {
  return SECRET_TARGET.test(content) && DISCLOSURE_ACTION.test(content);
}

function attemptsAuthorityEscalation(content: string) {
  return AUTHORITY_ESCALATION.some((pattern) => pattern.test(content));
}

export function observeC11TrustBoundary(
  messages: readonly ConversationMessage[],
  options: Readonly<{ sideEffect: boolean; humanApproved: boolean }>
): C11TrustBoundaryObservation {
  const untrusted = messages.filter((message) => isUntrustedRole(message.role));

  return Object.freeze({
    untrusted_input: untrusted.length > 0,
    asks_for_secrets: untrusted.some((message) => requestsSecret(message.content)),
    authority_escalation: untrusted.some((message) => attemptsAuthorityEscalation(message.content)),
    side_effect: options.sideEffect,
    human_approved: options.humanApproved,
  });
}
