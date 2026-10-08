// Fictional content for reviewing the product. Never sourced from the private vault.
export const note = (title: string, body: string, type = 'topic') => `---
type: ${type}
aliases: []
tags: [area/craft, programming]
created: 2026-10-08
summary: "${title}."
---
# ${title}

${body}

## See also
`;

export const sampleFiles = {
  'meta/schema.yaml': `owner: Preview
types:
  moc: { label: Hubs, use: a hub }
  topic: { label: Topics, use: an idea }
areas:
  craft: { label: Craft, use: design and making }
statuses:
  active: { label: Active }
  done: { label: Done }
circles: {}
broad:
  craft: [programming]
predicates:
  related-to: { label: Related to, symmetric: true, use: connected ideas }
sources:
  vault-app: { label: The app }
procedures:
  capture: { label: Capture }
  sign-off: { label: Sign-off }
`,
  'Home.md': note('Home', 'A small sample vault for exploring the design.', 'moc'),
  'Slow mornings.md': note(
    'Slow mornings',
    'Leave space before the first meeting. A walk and a notebook make a good start.',
  ),
  'Garden studio.md': note(
    'Garden studio',
    'A quiet place for making things. Keep the desk clear and the afternoon open.',
  ),
  'Reading list.md': note(
    'Reading list',
    'Ideas to return to: attention, good tools, and small daily practices.',
  ),
  'meta/conventions.md':
    '# Preview conventions\n\nThis vault contains fictional notes. The scripted conversation demonstrates searching, staging, checking and committing. All changes stay in memory.\n',
};
