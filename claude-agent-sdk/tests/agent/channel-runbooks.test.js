import assert from 'node:assert';
import { describe, it, mock } from 'node:test';

import { channelRunbooks } from '../../agent/tools/channel-runbooks.js';

/** @param {any} client */
function makeDeps(client) {
  return {
    client,
    userId: 'U123',
    channelId: 'C123',
    threadTs: '1234.56',
    messageTs: '1234.56',
  };
}

describe('channelRunbooks', () => {
  it('calls files.list with the channel', async () => {
    const client = { files: { list: mock.fn(async () => ({ files: [] })) } };

    await channelRunbooks(makeDeps(client));

    assert.strictEqual(client.files.list.mock.callCount(), 1);
    assert.deepStrictEqual(client.files.list.mock.calls[0].arguments[0], { types: 'canvas', channel: 'C123' });
  });

  it('filters by title and channel', async () => {
    const client = {
      files: {
        list: mock.fn(async () => ({
          files: [
            { title: 'Runbook: Deploy', channels: ['C123'], groups: [] },
            { title: 'Not a runbook', channels: ['C123'], groups: [] },
            { title: 'Runbook: Other', channels: ['C456'], groups: [] },
            { title: 'Runbook: Shared', channels: [], groups: ['C123'] },
          ],
        })),
      },
    };

    const runbooks = await channelRunbooks(makeDeps(client));

    assert.strictEqual(runbooks.length, 2);
    assert.strictEqual(runbooks[0].title, 'Runbook: Deploy');
    assert.strictEqual(runbooks[1].title, 'Runbook: Shared');
  });
});
