# Keep credential changes as encrypted device overrides

Settings permits replacing login-preloaded credentials without republishing `secrets.json`. Store
only explicit overrides in the remembered credential record, encrypted with its password-derived key;
merge them over each valid login's current secrets, and remove them on sign-out. This extends
[ADR 0004](0004-plaintext-device-cache.md)'s credential storage decision while vault contents remain
plaintext: device overrides preserve deployment defaults and avoid putting credentials in ordinary
preferences or shared vault records.

Restoring a login value removes its override; clearing an optional credential records an explicit
absence. Validate replacement GitHub access by opening and refreshing candidate storage adapters,
then persist the encrypted override before activating those adapters. Failed access or persistence
keeps the active session intact. Development overrides last only for that session.
