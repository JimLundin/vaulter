# Vaulter

A voice-first personal knowledge wiki built as extensions that import one another. Vaulter is both the app and the agent inside it.

## Extensions

**Extension**:
A folder in the repo, an ES module; every feature is one, including those Vaulter writes. One extension per job: others import it by folder.
_Avoid_: plugin, module, app

**Core**:
What every extension is read by (`src/core`): the shape of what an extension offers, and the collecting of it from every extension.
_Avoid_: kernel, framework

**Operation**:
Something a person or Vaulter can do through an extension, and other code calls the same way: a function of one input, with a description and whether it rewrites what is known.
_Avoid_: tool (that's an operation as the model sees it), command, action

**Shell**:
The part of the core that owns the page and lays out the `ui` the core collects from each extension, for the device.

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

**Asking first**:
What Vaulter does before an operation that rewrites what is known: it asks the person, and runs it only on their yes.
_Avoid_: permission (that's a host or secret an extension declares)

**Approval**:
The question Vaulter asks before an operation that rewrites what is known, whose yes holds the call; the person's yes makes it.

**Secret**:
A value an extension declares, held by the secrets extension and attached only to requests for the hosts it was declared for.
_Avoid_: key, token, credential (a secret may be any of these)

**Sealed secrets**:
The secrets as CI publishes them with the page, encrypted with a password a device asks for once.

## Knowledge

**Note**:
Something the person said or wrote, kept for good; the wiki's facts cite the notes they came from.
_Avoid_: entry, memo, transcript

**Record**:
One item of typed data an extension keeps through storage.
_Avoid_: row, document, entity

**Wiki page**:
A record about a person, place, event or topic, whose facts each cite the notes they came from.
_Avoid_: entity, article
