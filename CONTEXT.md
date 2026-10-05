# Vaulter

A voice-first personal knowledge wiki built as a small kernel plus extensions. Vaulter is both the app and the agent inside it.

## The kernel and extensions

**Kernel**:
The one part that isn't an extension: it imports the extensions a device has on, and lists them.
_Avoid_: core, runtime, host

**Extension**:
A folder in the repo, an ES module; every feature is one, including those Vaulter writes. One extension per job: others import it by folder.
_Avoid_: plugin, module, app

**Agreed export**:
An export by a name others look for, such as `tools` (read by the agent) or `ui` (read by the shell): how an extension plugs into another without either importing the other.
_Avoid_: hook, registration, contribution point

**Shell**:
The one extension that owns the page and lays out every extension's `ui` for the device.

**Preview**:
A pull request's own build of the page, on the same site, where a new extension, Vaulter's included, is tried before it reaches main.
_Avoid_: draft, beta, staging

**Device**:
One browser, with its own data and secrets; nothing about a device syncs yet.
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
One item of typed data an extension keeps through storage.
_Avoid_: row, document, entity

**Record type**:
A named shape of record that one extension registers and others refer to by handle.

**Revision**:
One state of a record; each change makes a new one, and earlier ones are kept.
_Avoid_: version (an extension's version is something else)

**Tombstone**:
A deleted record that is kept, hidden.

**Wiki page**:
A record about a person, place, event or topic, whose facts each cite the notes they came from.
_Avoid_: entity, article
