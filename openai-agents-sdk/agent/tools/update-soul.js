import { tool } from '@openai/agents';
import { z } from 'zod';

import { SOUL_PATH, saveSoul } from '../soul.js';

export const updateSoul = tool({
  name: 'update_soul',
  description: "Update the owner's soul file.",
  parameters: z.object({
    markdown: z.string().describe('The new soul content as markdown.'),
  }),
  execute: async ({ markdown }, context) => {
    const deps = /** @type {import('../deps.js').AgentDeps} */ (context?.context);

    if (!deps.isOwner || !deps.isPrivateReply) {
      return 'Only the owner can change the soul, in a direct message.';
    }

    if (!markdown.trim()) {
      return "The soul can't be empty.";
    }

    saveSoul(markdown, SOUL_PATH);
    return 'Saved your soul.';
  },
});
