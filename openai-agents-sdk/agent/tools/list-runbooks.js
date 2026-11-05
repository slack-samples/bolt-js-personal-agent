import { tool } from '@openai/agents';
import { z } from 'zod';

import { channelRunbooks } from './channel-runbooks.js';

export const listRunbooks = tool({
  name: 'list_runbooks',
  description:
    'List the runbooks in this channel: canvases titled `Runbook: <topic>`.\n\n' +
    'Call this before answering a request or writing a runbook, then read the ' +
    'one that covers the topic with `read_runbook`.',
  parameters: z.object({}),
  execute: async (_args, context) => {
    const deps = /** @type {import('../deps.js').AgentDeps} */ (context?.context);
    let runbooks;
    try {
      runbooks = await channelRunbooks(deps);
    } catch (e) {
      const err = /** @type {any} */ (e);
      return `Could not list runbooks: ${err.data?.error || err.message}`;
    }

    const result = runbooks.map((file) => `- [${file.title}](${file.permalink}) (\`${file.id}\`)`);
    if (result.length === 0) {
      return 'No runbooks yet.';
    }
    return result.join('\n');
  },
});
