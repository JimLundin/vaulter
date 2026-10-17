# Keep source translation in the Vault and let Vaulter modules evolve

The old Vault's file formats, Git history and content-review policy belong to the Vault. Its private
tooling owns translation and enrichment, while Vaulter modules own the design, validation and
historical interpretation of their records. Keeping the translator with its source lets extraction
become richer without making old Markdown organization or an initial mapping an application contract.

The Vault pins public Vaulter code as a Git submodule and imports existing owner entries through its
own `#vaulter/*` mapping. These are current source interfaces, not a new stable SDK or export catalogue.
The consumer adapts and verifies output when advancing the pin; Vaulter does not retain legacy-source
adapters to keep that consumer unchanged. A separate compatibility layer in Vaulter would make its
modules responsible for source-specific policy and constrain subsequent design.

[ADR 0014](0014-eav-only-vault.md) and [ADR 0005](0005-wiki-citation-selections.md) require
immutable accepted history, validated historical references and the retained text grammar of selections.
Modules may introduce new shapes and behavior through explicit schema evolution. Source translation
must target the current typed owner interfaces and verify historical evidence and provenance before
publication. Application opening performs no translation or regeneration of private source data.
