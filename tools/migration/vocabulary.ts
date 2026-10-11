// The vocabulary in meta/schema.yaml as terms: each scheme a term of scheme 'scheme' described by its
// section's comment, each entry a term under it, with hubs, topic areas and the owner as relationships.
import { CORE_SCHEMA, load } from 'js-yaml';
import type { JsonObject } from '../../app/vault/nodes/model.ts';
import { asObject, json, list, type Specs } from './records.ts';
import { report, tally } from './report.ts';

const SCHEMES: Record<string, string> = {
  components: 'component',
  types: 'type',
  areas: 'area',
  statuses: 'status',
  circles: 'circle',
  broad: 'topic',
  predicates: 'predicate',
  sources: 'source',
  procedures: 'procedure',
};

export function projectSchema(text: string): Specs {
  const specs: Specs = new Map();
  const data = asObject(json(load(text, { schema: CORE_SCHEMA })));
  // A section's leading comment says what the scheme is for.
  const comments = new Map<string, string>();
  let pending: string[] = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('#')) pending.push(line.replace(/^#\s?/, ''));
    else if (/^[a-z-]+:/.test(line)) {
      comments.set(line.split(':')[0]!, pending.join(' ').trim());
      pending = [];
    }
  }
  if (typeof data.owner === 'string')
    specs.set('owner/is', {
      parent: 'owner',
      order: 'a',
      data: { kind: 'relationship', predicate: 'is', label: data.owner },
      target: { page: data.owner },
    });
  let n = 0;
  for (const [section, value] of Object.entries(data)) {
    if (section === 'owner') continue;
    const scheme = SCHEMES[section];
    if (!(scheme && value) || typeof value !== 'object') {
      tally(report.unknownFields, `schema.${section}`);
      continue;
    }
    const schemeKey = `term:scheme:${scheme}`;
    const use = comments.get(section);
    specs.set(schemeKey, {
      parent: null,
      order: 'a',
      data: { kind: 'term', scheme: 'scheme', key: scheme, ...(use ? { use } : {}) },
    });
    const entries: [key: string, fields: JsonObject, group?: string][] = Array.isArray(value)
      ? value.map((name): [string, JsonObject] => [String(name), {}])
      : scheme === 'topic'
        ? Object.entries(value).flatMap(([group, topics]) =>
            list(topics).map((t): [string, JsonObject, string] => [String(t), {}, group]),
          )
        : Object.entries(value).map(([k, v]): [string, JsonObject] => [k, asObject(v)]);
    for (const [key, fields, group] of entries) {
      const termKey = `term:${scheme}:${key}`;
      const { label, use: termUse, inverse, symmetric, hub, ...rest } = fields;
      for (const k of Object.keys(rest)) tally(report.unknownFields, `schema.${section}.${k}`);
      n++;
      specs.set(termKey, {
        parent: schemeKey,
        order: `t${String(n).padStart(4, '0')}`,
        data: {
          kind: 'term',
          scheme,
          key,
          ...(label ? { label: String(label) } : {}),
          ...(termUse ? { use: String(termUse) } : {}),
          ...(inverse ? { inverse: String(inverse) } : {}),
          ...(symmetric === undefined ? {} : { symmetric: !!symmetric }),
        },
      });
      if (hub)
        specs.set(`${termKey}/hub`, {
          parent: termKey,
          order: 'a',
          data: { kind: 'relationship', predicate: 'hub', label: String(hub) },
          target: { page: String(hub) },
        });
      if (group)
        specs.set(`${termKey}/area`, {
          parent: termKey,
          order: 'a',
          data: { kind: 'relationship', predicate: 'area', label: group },
          target: { term: `area:${group}` },
        });
    }
  }
  return specs;
}
