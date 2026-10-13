# Store vault contents in plaintext on the device

Store node transaction envelopes, remote heads, file blobs, and application state as plaintext
structured values in IndexedDB to remove per-record encryption and decryption. This supersedes
the device-cache encryption decision in ADR 0003. Credentials in `secrets.json` remain
password-encrypted; the device remembers only the password-derived credential key.
Encrypted device credential overrides extend this decision in [ADR 0008](0008-device-credential-overrides.md).

Reset the old encrypted caches and remembered keys for this format change, with no data migration
or compatibility layer. Sign out and back in when switching to it; GitHub refills remote data.
There are no pending edits to preserve for this cutover. Cache keys and ownership markers are
removed. Plaintext caches survive a new unlock, and sign-out removes the cached vault data and
application state while retaining remote history. Local vault contents are readable directly
from browser storage.
