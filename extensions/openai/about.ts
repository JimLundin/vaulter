import type { About } from '#kernel';

export const about: About = {
  version: '1.0.0',
  agentGuide: 'The language model. Other extensions use it; Vaulter rarely calls it directly.',
  secrets: {
    key: { label: 'OpenAI API key, from a project with a spend limit', hosts: ['api.openai.com'] },
  },
};
