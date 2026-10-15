# Suggestion design verdict

Selected **B · List** for Questions and Chat. Full-width rows show every suggestion in one reading
order, with complete labels that wrap and subtle separators. Choosing a suggestion fills and
focuses the existing editable text box. The same Questions card is used in Wiki.

Keep each question's context minimal and inline: its Subject and the first short sentence of the
triggering source, capped at 120 characters. Do not add a context button or panel. The text box
always accepts a direct answer, so a separate **Write my own** choice is unnecessary. The Questions
module remains a list with inline answers, without individual question pages.

The comparison is preserved on
[`prototype/suggestion-designs` at `935f53a`](https://github.com/JimLundin/vaulter/tree/935f53a), with
[interactive alternatives](https://jimlundin.github.io/vaulter/preview/prototype/suggestion-designs/?compare=suggestions&variant=list#/questions/):

| Variant | Design |
| --- | --- |
| A · Chips | Content-sized buttons wrapping onto multiple rows. |
| B · List | Full-width text rows with subtle separators. |
| C · Cards | Responsive tiles with stronger separation. |

The selected design is implemented by the public `PromptSuggestions` kit component. Its comparison
overrides stay on the prototype branch. Run `npm run design` for the current Product preview.
