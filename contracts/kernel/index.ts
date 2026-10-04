// The kernel's own contract: what the extensions list, the settings, the review screen and the
// approvals need (ARCHITECTURE.md, "UI for extensions"). The kernel provides it; an extension that
// requires it shows that in its static fields, and every change it can make is personal: only a person
// can make it, right after a tap or key in that extension.
import { defineContract } from '@pip/kernel';
import { z } from 'zod';

export const Access = z.enum(['read', 'write', 'ask']);
export type Access = z.infer<typeof Access>;
export type Unsubscribe = () => void;

export interface ExtensionInfo {
  id: string;
  version?: string;
  status: 'running' | 'refused' | 'off';
  problems: string[];
  /** Shipped inside the kernel bundle (the source provider). */
  bundled: boolean;
  /** The draft branch it loads from on this device, if not the main one. */
  draft?: string;
  requires: string[];
  /** Contracts it uses when present. */
  optional: string[];
  provides: string[];
  permissions: { device: string[]; network: string[] };
  secrets: { name: string; label: string; hosts: string[]; set: boolean }[];
  agentGuide: string;
  author: { kind: 'person' } | { kind: 'agent'; reason: string };
  /** The kernel API it was written against. */
  kernel: string;
  /** Its last errors, newest last, and whether there were many in the last minute. */
  errors: ErrorEntry[];
  failing: boolean;
}

export interface ErrorEntry {
  at: string;
  where: 'setup' | 'call' | 'callback' | 'stop' | 'uncaught';
  message: string;
  stack?: string;
}

export interface AccessInfo {
  ext: string;
  label: string;
  declared: Access;
  /** The person's setting, when it differs from what the extension declared. */
  setting?: Access;
}

export interface Approval {
  id: string;
  /** Who is calling (usually Pip's agent) and whose guarded function. */
  from: string;
  to: string;
  label: string;
  args: unknown[];
  at: string;
}

export interface AuditEntry {
  at: string;
  from: string;
  to: string;
  label: string;
  access: Access;
  outcome: 'done' | 'approved' | 'declined';
}

export interface SourceInfo {
  repo: string;
  ref: string;
  pin?: string;
  /** The commit this device is running, and the kernel's API version. */
  commit: string;
  kernelApi: string;
  /** Draft branches this device loads on top. */
  drafts: string[];
}

export interface DraftInfo {
  branch: string;
  /** Extensions it adds or changes. */
  extensions: string[];
  loaded: boolean;
}

export interface StaticsSummary {
  version: string;
  requires: string[];
  provides: string[];
  device: string[];
  network: string[];
  secrets: { name: string; hosts: string[] }[];
  author: ExtensionInfo['author'];
}

export interface Review {
  branch: string;
  /** The commits compared: the main branch and the draft's head. */
  base: string;
  head: string;
  files: { path: string; status: 'added' | 'changed' | 'removed' }[];
  extensions: {
    id: string;
    change: 'added' | 'changed' | 'removed';
    before?: StaticsSummary;
    after?: StaticsSummary;
    /** What it may do that it couldn't before, in plain words: to approve on purpose. */
    raises: string[];
    problems: string[];
  }[];
  checks: {
    state: 'none' | 'pending' | 'success' | 'failure';
    runs: { name: string; state: string }[];
  };
}

export interface KernelV1 {
  extensions: () => Promise<ExtensionInfo[]>;
  /** An extension's last errors. */
  errors: (id: string) => Promise<ErrorEntry[]>;
  source: () => Promise<SourceInfo>;
  /** Every guarded function seen, with its level. */
  access: () => Promise<AccessInfo[]>;
  approvals: () => Promise<Approval[]>;
  onApprovals: (handler: (pending: Approval[]) => void) => Promise<Unsubscribe>;
  audit: (limit?: number) => Promise<AuditEntry[]>;
  drafts: () => Promise<DraftInfo[]>;
  review: (branch: string) => Promise<Review>;
  /** Whether the page carries sealed secrets (secrets.json). */
  sealed: () => Promise<{ present: boolean }>;

  // Personal: a person, right after a tap or key.
  decide: (id: string, approve: boolean) => Promise<void>;
  setAccess: (ext: string, label: string, access: Access | null) => Promise<void>;
  /** Starts or stops it now, and on every start from then on. */
  setEnabled: (id: string, on: boolean) => Promise<void>;
  /** Stops it, drops its data and secrets, and turns it off. */
  remove: (id: string) => Promise<void>;
  setSecret: (ext: string, name: string, value: string) => Promise<void>;
  forgetSecret: (ext: string, name: string) => Promise<void>;
  /** Opens the page's sealed secrets with the password and keeps them on this device. */
  unlock: (password: string) => Promise<void>;
  /** A repo, branch, or a pinned commit (a rollback; null for the branch's latest). Next start. */
  setSource: (change: { repo?: string; ref?: string; pin?: string | null }) => Promise<void>;
  /** Loads a draft branch on this device, on top of the main one. Next start. */
  tryDraft: (branch: string, on: boolean) => Promise<void>;
  /** Merges a draft into the main branch; every device gets it on its next start. */
  accept: (branch: string, message?: string) => Promise<string>;
  restart: () => Promise<void>;
}

export const kernel = defineContract<KernelV1>({
  name: 'kernel',
  version: '1.0.0',
  personal: [
    'decide',
    'setAccess',
    'setEnabled',
    'remove',
    'setSecret',
    'forgetSecret',
    'unlock',
    'setSource',
    'tryDraft',
    'accept',
  ],
});
