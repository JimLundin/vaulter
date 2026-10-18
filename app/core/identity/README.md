# Identity

Identity owns retained correspondence after records are merged. All domain record types may
participate; source and survivor must have the same retained type. A merge across types would
change the meaning expected by existing typed links and needs a separate explicit policy.

`createIdentityRedirect` records validated historical source and survivor anchors, optional reason
and provenance, with trusted Transaction author and origin. Active correspondence is unique per
source and acyclic. `reviseIdentityRedirect` corrects a survivor or withdraws and restores a redirect
without erasing its history. Source records are never deleted and existing links never rewritten
by this capability. Owners remain responsible for any content consolidation.

`resolveCurrentIdentity` follows active correspondence at one accepted current Snapshot and reports
the survivor's current values and availability. A removed survivor is unavailable; resolution does
not fall back to the merged source. `resolveHistoricalIdentity` reads the original selected identity
and state without following correspondence. Both reject addresses from another journal or scope.

Application installs the definitions. Callers can use the current resolver when interpreting live
links; module route adapters and merge interaction are separate from this retained capability.
