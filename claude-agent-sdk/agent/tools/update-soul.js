import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

import { saveSoul, soulFiles } from '../soul.js';
import { textResult } from './text-result.js';

/** @param {import('../agent.js').AgentDeps} deps */
export const updateSoul = (deps) =>
  tool(
    'update_soul',
    "Update the owner's soul file.",
    { markdown: z.string().describe('The new soul content as markdown.') },
    async ({ markdown }) => {
      if (!deps.isOwner || !deps.isPrivateReply) {
        return textResult('Only the owner can change the soul, in a direct message.');
      }

      if (!markdown.trim()) {
        return textResult("The soul can't be empty.");
      }

      saveSoul(markdown, soulFiles.soulPath);
      return textResult('Saved your soul.');
    },
  );
