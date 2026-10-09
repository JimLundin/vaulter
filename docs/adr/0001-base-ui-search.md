# Use Base UI Autocomplete for Search

The kit migration in [#18](https://github.com/JimLundin/vaulter/issues/18) needs one interaction
library for nested surfaces. Keeping cmdk would retain its transitive Radix dependency and a
second focus and layering system, so Search uses inline Base UI Autocomplete behind the existing
Command interface. The kit preserves filtering, keyboard selection and empty-state announcements;
Product continues to supply ranked results with `shouldFilter={false}`. This removes cmdk and
all Radix dependencies while leaving Search's public task interface intact.

Search is not yet feature-scoped. The user clarified that legacy cmdk compatibility is not a hard
requirement: prefer the clean Base UI implementation. Default Command filtering uses Base UI's
locale-aware text matching and retains caller order; it does not reproduce cmdk's fuzzy ranking,
keywords, forced results or controlled highlighted-item API. Product owns ranked results and
passes `shouldFilter={false}`. This scope clarification supersedes #18's blanket compatibility
requirement for Search while retaining its current task behavior.
