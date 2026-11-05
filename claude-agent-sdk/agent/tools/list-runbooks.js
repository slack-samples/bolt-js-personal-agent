import { tool } from '@anthropic-ai/claude-agent-sdk';

import { channelRunbooks } from './channel-runbooks.js';
import { textResult } from './text-result.js';

/** @param {import('../agent.js').AgentDeps} deps */
export const listRunbooks = (deps) =>
  tool(
    'list_runbooks',
    'List the runbooks in this channel: canvases titled `Runbook: <topic>`.\n\n' +
      'Call this before answering a request or writing a runbook, then read the ' +
      'one that covers the topic with `read_runbook`.',
    {},
    async () => {
      let runbooks;
      try {
        runbooks = await channelRunbooks(deps);
      } catch (e) {
        const err = /** @type {any} */ (e);
        return textResult(`Could not list runbooks: ${err.data?.error || err.message}`);
      }

      const result = runbooks.map((file) => `- [${file.title}](${file.permalink}) (\`${file.id}\`)`);
      if (result.length === 0) {
        return textResult('No runbooks yet.');
      }
      return textResult(result.join('\n'));
    },
  );
