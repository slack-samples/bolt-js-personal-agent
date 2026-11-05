import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

import { channelRunbooks } from './channel-runbooks.js';
import { textResult } from './text-result.js';

/** @param {import('../agent.js').AgentDeps} deps */
export const readRunbook = (deps) =>
  tool(
    'read_runbook',
    "Read a runbook's content as markdown.\n\nRead a runbook before you answer from it.",
    {
      canvas_id: z.string().describe("The runbook's canvas ID from `list_runbooks`, such as `F0123ABCD`."),
    },
    async ({ canvas_id }) => {
      let runbooks;
      try {
        runbooks = await channelRunbooks(deps);
      } catch (e) {
        const err = /** @type {any} */ (e);
        return textResult(`Could not read the runbook: ${err.data?.error || err.message}`);
      }

      if (!runbooks.some((file) => file.id === canvas_id)) {
        return textResult("That runbook isn't available here.");
      }

      try {
        const response = await deps.client.canvases.getContent({ canvas_id });
        return textResult(response.content ?? '');
      } catch (e) {
        const err = /** @type {any} */ (e);
        return textResult(`Could not read the runbook: ${err.data?.error || err.message}`);
      }
    },
  );
