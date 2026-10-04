// Applying Pip's access (access.ts) to a call that reaches a guarded function: the person's setting for
// that label, or else the level the extension declared. Write calls are logged; ask calls wait in
// `pending` until the person decides, through the kernel contract (contracts/kernel).
import type { Access, Guard } from './access.ts';
import type { KernelStorage } from './storage.ts';

export interface GuardedCall {
  /** The extension calling. */
  from: string;
  /** The extension whose function it is. */
  to: string;
  guard: Guard;
  args: unknown[];
}

export interface Approval {
  id: string;
  from: string;
  to: string;
  label: string;
  /** What the call would do, as its arguments. */
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

export class Declined extends Error {
  override name = 'Declined';
}

const NS = 'kernel';
const AUDIT_MAX = 1000;

export class Policy {
  private readonly pending = new Map<
    string,
    { approval: Approval; decide: (ok: boolean) => void }
  >();
  private readonly listeners = new Set<(pending: Approval[]) => void>();
  /** Every guard seen, by `extension/label`: what the settings can list. */
  readonly known = new Map<string, { ext: string; label: string; declared: Access }>();
  private n = 0;

  private readonly storage: KernelStorage;
  private readonly settings: () => Record<string, Access>;

  constructor(storage: KernelStorage, settings: () => Record<string, Access>) {
    this.storage = storage;
    this.settings = settings;
  }

  levelOf(ext: string, guard: Guard): Access {
    return this.settings()[`${ext}/${guard.label}`] ?? guard.access;
  }

  see(ext: string, guard: Guard) {
    this.known.set(`${ext}/${guard.label}`, { ext, label: guard.label, declared: guard.access });
  }

  /** Resolves when the call may go ahead; rejects with Declined when the person says no. */
  async admit(call: GuardedCall): Promise<void> {
    const level = this.levelOf(call.to, call.guard);
    if (level === 'read') return;
    if (level === 'write') return this.log(call, 'write', 'done');
    const approval: Approval = {
      id: `${Date.now().toString(36)}-${++this.n}`,
      from: call.from,
      to: call.to,
      label: call.guard.label,
      args: call.args,
      at: new Date().toISOString(),
    };
    const ok = await new Promise<boolean>((decide) => {
      this.pending.set(approval.id, { approval, decide });
      this.changed();
    });
    await this.log(call, 'ask', ok ? 'approved' : 'declined');
    if (!ok) throw new Declined(`${call.to}/${call.guard.label}: declined`);
  }

  approvals = () => [...this.pending.values()].map((p) => p.approval);

  decide(id: string, ok: boolean) {
    const p = this.pending.get(id);
    if (!p) throw new Error('no such approval');
    this.pending.delete(id);
    this.changed();
    p.decide(ok);
  }

  onApprovals(f: (pending: Approval[]) => void) {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  async audit(limit = 100): Promise<AuditEntry[]> {
    const all = ((await this.storage.get(NS, 'audit')) as AuditEntry[] | undefined) ?? [];
    return all.slice(-limit).reverse();
  }

  private changed() {
    const list = this.approvals();
    for (const f of this.listeners) f(list);
  }

  private async log(call: GuardedCall, access: Access, outcome: AuditEntry['outcome']) {
    const all = ((await this.storage.get(NS, 'audit')) as AuditEntry[] | undefined) ?? [];
    all.push({
      at: new Date().toISOString(),
      from: call.from,
      to: call.to,
      label: call.guard.label,
      access,
      outcome,
    });
    await this.storage.set(NS, 'audit', all.slice(-AUDIT_MAX));
  }
}
