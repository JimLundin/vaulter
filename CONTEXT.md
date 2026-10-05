# Vaulter

A voice-first personal knowledge wiki built as a small kernel plus extensions. Vaulter is both the app and the agent inside it.

## The kernel and extensions

**Kernel**:
The one part that isn't an extension: it loads extensions, connects them through contracts and checks every call between them.
_Avoid_: core, runtime, host

**Extension**:
A folder in the repo that provides and requires contracts; every feature is one, including those Vaulter writes.
_Avoid_: plugin, module, app

**Contract**:
A named, versioned interface that one extension provides and others require; extensions never depend on each other by name.
_Avoid_: service, API, protocol

**Provider**:
The extension that implements a contract.

**Requirer**:
An extension that uses a contract; it may require it, or use it only when something provides it (optional).
_Avoid_: consumer, client

**Handle**:
What a requirer holds for a contract: the provider behind the kernel's checks.
_Avoid_: proxy, reference

**Boot**:
Going from a device and a source of extensions to a running kernel, or to safe mode with a reason.
_Avoid_: startup, init

**Device**:
One browser, with its own data, secrets, settings and tried drafts; nothing about a device syncs. Tests stand in a test device for a browser.
_Avoid_: client, machine, platform

**Safe mode**:
The kernel's own bare screen for recovering when extensions fail: change the source, pin a commit, turn extensions and drafts off.

## People and Vaulter

**Person**:
The human using Vaulter; some actions are only theirs.
_Avoid_: user, owner

**Personal method**:
A contract method only a person may call, such as approving, answering or changing access.

**Person presence**:
The kernel's knowledge that a person just acted in a particular extension, which a single personal call may use.
_Avoid_: user activation, gesture (the browser's terms for its part of it)

**Guard**:
The mark on a function an extension hands out (a tool's run) that makes every call to it go through Vaulter's access.

**Access level**:
How freely Vaulter may use a guarded function: read (freely), write (logged), or ask (only once the person approves).
_Avoid_: permission (that's a device, network or secret an extension declares)

**Approval**:
A held ask-level call, waiting for the person to approve or decline it.

## Changing Vaulter

**Draft**:
An extension Vaulter wrote or changed, on a `draft/*` branch; a device may try it before the person accepts it into main.
_Avoid_: proposal, PR

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
One item of typed data an extension keeps through the records contract.
_Avoid_: row, document, entity

**Record type**:
A named shape of record that one extension registers and others refer to by handle.

**Revision**:
One state of a record; each change makes a new one, and earlier ones are kept.
_Avoid_: version (an extension's or a contract's version is something else)

**Tombstone**:
A deleted or merged-away record that is kept, hidden, and can be restored.

**Wiki page**:
A record about a person, place, event or topic, whose facts each cite the notes they came from.
_Avoid_: entity, article
