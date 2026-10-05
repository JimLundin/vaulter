# Vaulter

A voice-first personal knowledge wiki built as a small kernel plus extensions. Vaulter is both the app and the agent inside it.

## The kernel and extensions

**Kernel**:
The one part that isn't an extension: it imports the extensions a device has on, lists them, and keeps their errors.
_Avoid_: core, runtime, host

**Extension**:
A folder in the repo, an ES module and its about; every feature is one, including those Vaulter writes. One extension per job: others import it by folder.
_Avoid_: plugin, module, app

**About**:
An extension's own description (version, agent guide, hosts and secrets, whether it is a preview), which the kernel reads before running any of it.
_Avoid_: manifest, metadata

**Preview**:
An extension on main that is off until a device turns it on: how a new extension, Vaulter's included, is tried.
_Avoid_: draft, beta, experiment

**Device**:
One browser, with its own data, secrets and choices of what is on; nothing about a device syncs.
_Avoid_: client, machine, platform

## People and Vaulter

**Person**:
The human using Vaulter.
_Avoid_: user, owner

**Access level**:
What Vaulter may do with a tool on its own: read (run it), write (run it, shown in its steps), or ask (only once the person says yes).
_Avoid_: permission (that's a host or secret an extension declares)

**Approval**:
The question Vaulter asks before a tool that asks first; the person's yes runs the call.

**Secret**:
A value an extension declares, held by the secrets extension and attached only to requests for the hosts it was declared for.
_Avoid_: key, token, credential (a secret may be any of these)

**Sealed secrets**:
The secrets as CI publishes them with the page, encrypted with a password a device asks for once.

## Knowledge

**Note**:
Something the person said or wrote, kept for good; everything else can be rebuilt from notes.
_Avoid_: entry, memo, transcript

**Record**:
One item of typed data an extension keeps through store-local.
_Avoid_: row, document, entity

**Record type**:
A named shape of record that one extension registers and others refer to by handle.

**Revision**:
One state of a record; each change makes a new one, and earlier ones are kept.
_Avoid_: version (an extension's version is something else)

**Tombstone**:
A deleted or merged-away record that is kept, hidden.

**Wiki page**:
A record about a person, place, event or topic, whose facts each cite the notes they came from.
_Avoid_: entity, article
