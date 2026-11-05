import { tool } from '@openai/agents';
import { z } from 'zod';

import { channelRunbooks } from './channel-runbooks.js';

export const readRunbook = tool({
  name: 'read_runbook',
  description: "Read a runbook's content as markdown.\n\nRead a runbook before you answer from it.",
  parameters: z.object({
    canvas_id: z.string().describe("The runbook's canvas ID from `list_runbooks`, such as `F0123ABCD`."),
  }),
  execute: async ({ canvas_id }, context) => {
    const deps = /** @type {import('../deps.js').AgentDeps} */ (context?.context);
    let runbooks;
    try {
      runbooks = await channelRunbooks(deps);
    } catch (e) {
      const err = /** @type {any} */ (e);
      return `Could not read the runbook: ${err.data?.error || err.message}`;
    }

    if (!runbooks.some((file) => file.id === canvas_id)) {
      return "That runbook isn't available here.";
    }

    try {
      const response = await deps.client.canvases.getContent({
        canvas_id,
      });
      return response.content ?? '';
    } catch (e) {
      const err = /** @type {any} */ (e);
      return `Could not read the runbook: ${err.data?.error || err.message}`;
    }
  },
});
