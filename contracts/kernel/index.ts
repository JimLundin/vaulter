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
  provides: string[];
  permissions: { device: string[]; network: string[] };
  secrets: { name: string; label: string; hosts: string[]; set: boolean }[];
  agentGuide: string;
  author: { kind: 'person' } | { kind: 'agent'; reason: string };
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
  /** The commit this device is running. */
  commit: string;
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
  source: () => Promise<SourceInfo>;
  /** Every guarded function seen, with its level. */
  access: () => Promise<AccessInfo[]>;
  approvals: () => Promise<Approval[]>;
  onApprovals: (handler: (pending: Approval[]) => void) => Promise<Unsubscribe>;
  audit: (limit?: number) => Promise<AuditEntry[]>;
  drafts: () => Promise<DraftInfo[]>;
  review: (branch: string) => Promise<Review>;

  // Personal: a person, right after a tap or key.
  decide: (id: string, approve: boolean) => Promise<void>;
  setAccess: (ext: string, label: string, access: Access | null) => Promise<void>;
  /** Takes effect on the next start. */
  setEnabled: (id: string, on: boolean) => Promise<void>;
  /** Stops it, drops its data and secrets, and turns it off. */
  remove: (id: string) => Promise<void>;
  setSecret: (ext: string, name: string, value: string) => Promise<void>;
  forgetSecret: (ext: string, name: string) => Promise<void>;
  /** A repo, branch, or a pinned commit (a rollback; null for the branch's latest). Next start. */
  setSource: (change: { repo?: string; ref?: string; pin?: string | null }) => Promise<void>;
  /** Loads a draft branch on this device, on top of the main one. Next start. */
  tryDraft: (branch: string, on: boolean) => Promise<void>;
  /** Merges a draft into the main branch; every device gets it on its next start. */
  accept: (branch: string, message?: string) => Promise<string>;
  restart: () => Promise<void>;
}

const id = z.string().regex(/^[a-z][a-z0-9-]*$/);
const branch = z.string().min(1).max(200);

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
    'setSource',
    'tryDraft',
    'accept',
  ],
  inputs: {
    audit: z.tuple([z.number().int().positive().max(1000).optional()]),
    review: z.tuple([branch]),
    decide: z.tuple([z.string(), z.boolean()]),
    setAccess: z.tuple([id, z.string().min(1), Access.nullable()]),
    setEnabled: z.tuple([id, z.boolean()]),
    remove: z.tuple([id]),
    setSecret: z.tuple([id, z.string().min(1), z.string().min(1)]),
    forgetSecret: z.tuple([id, z.string().min(1)]),
    setSource: z.tuple([
      z.object({
        repo: z
          .string()
          .regex(/^[\w.-]+\/[\w.-]+$/)
          .optional(),
        ref: branch.optional(),
        pin: z
          .string()
          .regex(/^[0-9a-f]{7,40}$/)
          .nullable()
          .optional(),
      }),
    ]),
    tryDraft: z.tuple([branch, z.boolean()]),
    accept: z.tuple([branch, z.string().optional()]),
  },
});
