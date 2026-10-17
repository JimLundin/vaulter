# Store vault contents in plaintext on the device

Store EAV transaction envelopes, remote heads, and application state as plaintext
structured values in IndexedDB to remove per-record encryption and decryption. This defines the device-cache policy for ADR 0003. Credentials in `secrets.json` remain
password-encrypted; the device remembers only the password-derived credential key.
Encrypted device credential overrides extend this decision in [ADR 0008](0008-device-credential-overrides.md).

Plaintext caches survive a new unlock, and sign-out removes the cached vault data and application
state while retaining remote history. Local vault contents are readable directly from browser storage.

The original format cutover reset encrypted caches and remembered keys without migrating cached
data; GitHub refilled remote data. That completed cutover also covered the file blobs used by the
then-existing file workflows. These are historical implementation details, not current reset or
migration instructions.
