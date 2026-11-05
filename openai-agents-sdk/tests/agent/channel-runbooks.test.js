import assert from 'node:assert';
import { describe, it, mock } from 'node:test';

import { AgentDeps } from '../../agent/deps.js';
import { channelRunbooks } from '../../agent/tools/channel-runbooks.js';

/**
 * @param {Record<string, any>[]} files
 */
function makeDeps(files) {
  const client = { files: { list: mock.fn(async () => ({ ok: true, files })) } };
  return new AgentDeps(/** @type {any} */ (client), 'U123', 'C123', '1234.56', '1234.56');
}

describe('channelRunbooks', () => {
  it('calls files.list with the channel', async () => {
    const deps = makeDeps([]);
    await channelRunbooks(deps);
    const list = /** @type {any} */ (deps.client.files.list);
    assert.strictEqual(list.mock.callCount(), 1);
    assert.deepStrictEqual(list.mock.calls[0].arguments[0], { types: 'canvas', channel: 'C123' });
  });

  it('filters by title and channel', async () => {
    const deps = makeDeps([
      { title: 'Runbook: Deploy', channels: ['C123'], groups: [] },
      { title: 'Not a runbook', channels: ['C123'], groups: [] },
      { title: 'Runbook: Other', channels: ['C456'], groups: [] },
      { title: 'Runbook: Other DM', channels: [], groups: [], ims: ['D456'] },
      { title: 'Runbook: Shared', channels: [], groups: ['C123'] },
      { title: 'Runbook: In a DM', channels: [], groups: [], ims: ['C123'] },
    ]);
    const runbooks = await channelRunbooks(deps);
    assert.deepStrictEqual(
      runbooks.map((runbook) => runbook.title),
      ['Runbook: Deploy', 'Runbook: Shared', 'Runbook: In a DM'],
    );
  });
});
