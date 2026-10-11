# Store vault contents in plaintext on the device

Store node transaction envelopes, remote heads, file blobs, and application state in plaintext in
IndexedDB to remove per-record decryption from browser reloads. This supersedes the device-cache
encryption decision in ADR 0003; credentials in secrets.json remain encrypted.

Sign out and back in to clear existing encrypted caches before using the plaintext format; no
migration is provided. Plaintext caches survive a new unlock, and sign-out still removes them.
Local vault contents are now readable directly from browser storage.
