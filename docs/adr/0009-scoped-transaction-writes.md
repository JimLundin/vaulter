# Retain finalized publications independently of execution lifetimes

EAV transactions calculate and validate changes in a callback and publish atomically on success.
The callback never runs again automatically. Failed or uncertain persistence retains the exact
finalized publication for retry, without recalculating domain changes or replaying models and tools.
This retains the recovery principle of the original scoped-write decision; ADR 0014 supersedes its
former application interface.

Owners preserve their own execution ordering, effect completion and recovery presentation. Closing
admission prevents new work; entered persistence settles before adapter retirement. Session
replacement reconnects the one journal and sign-out drains entered work before clearing device data.
Trusted author and origin come from application context rather than arbitrary tool arguments.
