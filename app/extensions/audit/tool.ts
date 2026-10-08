// The agent's `audit` tool: the weekly sweep's audit as the report the conventions read. Loads with the agent.
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { loadNotes } from '../../../core/vault.ts';
import { report } from '../../../core/audit.ts';
import { weekAudit } from './week.ts';
import type { AgentContext } from '../../shell/extension.ts';
import { schemaOf } from '../../../core/schema.ts';

export const auditTools = ({ w, since }: AgentContext): ToolSet =>
  since
    ? {
        audit: tool({
          description:
            "The weekly sweep's audit (conventions §15, what tools/audit.ts prints) over the vault with any staged edits: what changed in the last 8 days and what needs judgement, by section. Changes nothing.",
          inputSchema: z.object({}),
          execute: async () => {
            const files = w.files();
            return report(await weekAudit(loadNotes(files), schemaOf(files), since));
          },
        }),
      }
    : {};
