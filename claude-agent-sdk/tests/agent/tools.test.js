import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';

import { addEmojiReaction, createRunbook, listRunbooks, readRunbook } from '../../agent/tools/index.js';
import { invoke, slackError } from '../helpers.js';

/**
 * @param {string} id
 * @param {string} title
 * @param {Record<string, any>} [sharing]
 */
function canvas(id, title, sharing = { channels: ['C123'] }) {
  return { id, title, permalink: `https://example.com/${id}`, ...sharing };
}

describe('tools', () => {
  let client;
  let deps;

  beforeEach(() => {
    client = {
      canvases: { create: mock.fn(), getContent: mock.fn() },
      conversations: { info: mock.fn() },
      files: {
        info: mock.fn(async () => ({
          file: {
            title: 'Runbook: Deploys',
            permalink: 'https://example.slack.com/docs/T1/F123',
          },
        })),
        list: mock.fn(),
      },
      users: { conversations: mock.fn() },
    };
    deps = {
      client,
      userId: 'U123',
      channelId: 'C123',
      threadTs: '1700000000.000100',
      messageTs: '1700000000.000100',
    };
  });

  it('list_runbooks lists only runbooks', async () => {
    client.files.list = mock.fn(async () => ({
      files: [canvas('F123', 'Runbook: Deploys'), canvas('F456', 'Lunch orders')],
    }));

    const result = await invoke(listRunbooks, deps);

    assert.strictEqual(client.files.list.mock.calls[0].arguments[0].types, 'canvas');
    assert.ok(result.includes('[Runbook: Deploys](https://example.com/F123) (`F123`)'));
    assert.ok(!result.includes('Lunch orders'));
  });

  it('list_runbooks without any', async () => {
    client.files.list = mock.fn(async () => ({ files: [] }));

    assert.strictEqual(await invoke(listRunbooks, deps), 'No runbooks yet.');
  });

  it('read_runbook returns its markdown', async () => {
    client.files.list = mock.fn(async () => ({ files: [canvas('F123', 'Runbook: Test')] }));
    client.canvases.getContent = mock.fn(async () => ({ content: '# Steps\n1. Rotate the secret' }));

    const result = await invoke(readRunbook, deps, { canvas_id: 'F123' });

    assert.strictEqual(client.canvases.getContent.mock.callCount(), 1);
    assert.deepStrictEqual(client.canvases.getContent.mock.calls[0].arguments[0], {
      canvas_id: 'F123',
    });
    assert.strictEqual(result, '# Steps\n1. Rotate the secret');
  });

  it('read_runbook reports errors', async () => {
    client.files.list = mock.fn(async () => ({ files: [canvas('F404', 'Runbook: Test')] }));
    client.canvases.getContent = mock.fn(async () => {
      throw slackError('canvas_not_found');
    });

    const result = await invoke(readRunbook, deps, { canvas_id: 'F404' });

    assert.ok(result.includes('canvas_not_found'));
  });

  it('create_runbook adds a channel tab', async () => {
    client.canvases.create = mock.fn(async () => ({ canvas_id: 'F123' }));

    const result = await invoke(createRunbook, deps, {
      topic: 'Deploys',
      markdown: '# Steps\n1. Redeploy',
    });

    const args = client.canvases.create.mock.calls[0].arguments[0];
    assert.strictEqual(args.title, 'Runbook: Deploys');
    assert.strictEqual(args.channel_id, 'C123');
    assert.deepStrictEqual(args.document_content, {
      type: 'markdown',
      markdown: '# Steps\n1. Redeploy',
    });
    assert.strictEqual(client.files.info.mock.callCount(), 1);
    assert.deepStrictEqual(client.files.info.mock.calls[0].arguments[0], { file: 'F123' });
    assert.strictEqual(result, 'Created [Runbook: Deploys](https://example.slack.com/docs/T1/F123).');
  });

  it('create_runbook asks to fix rejected markdown', async () => {
    client.canvases.create = mock.fn(async () => {
      throw slackError('canvas_creation_failed', 'Unsupported nested list');
    });

    const result = await invoke(createRunbook, deps, {
      topic: 'Deploys',
      markdown: '1. - x',
    });

    assert.ok(result.includes('Unsupported nested list'));
    assert.ok(result.includes('call create_runbook again'));
  });

  it('lists only runbooks shared in the current channel', async () => {
    client.files.list = mock.fn(async () => ({
      files: [
        canvas('F_HERE', 'Runbook: Here'),
        canvas('F_HERE_PRIVATE', 'Runbook: Here too', { groups: ['C123'] }),
        canvas('F_OTHER', 'Runbook: Other public channel', { channels: ['C_PUB'] }),
        canvas('F_PRIV', 'Runbook: Private', { groups: ['G_PRIV'] }),
      ],
    }));

    const result = await invoke(listRunbooks, deps);

    assert.ok(result.includes('F_HERE'));
    assert.ok(result.includes('F_HERE_PRIVATE'));
    assert.ok(!result.includes('F_OTHER'));
    assert.ok(!result.includes('F_PRIV'));
    assert.strictEqual(client.conversations.info.mock.callCount(), 0);
    assert.strictEqual(client.users.conversations.mock.callCount(), 0);
  });

  it('read_runbook refuses a runbook from another channel', async () => {
    client.files.list = mock.fn(async () => ({
      files: [canvas('F_OTHER', 'Runbook: Other', { channels: ['C_PUB'] })],
    }));

    const result = await invoke(readRunbook, deps, { canvas_id: 'F_OTHER' });

    assert.strictEqual(result, "That runbook isn't available here.");
    assert.strictEqual(client.canvases.getContent.mock.callCount(), 0);
  });

  it('treats null channels and groups as not shared', async () => {
    client.files.list = mock.fn(async () => ({
      files: [canvas('F_NULL', 'Runbook: Null', { channels: null, groups: null, ims: null })],
    }));

    assert.strictEqual(await invoke(listRunbooks, deps), 'No runbooks yet.');
  });

  it('lists runbooks shared in the current DM only', async () => {
    deps.channelId = 'D123';
    client.files.list = mock.fn(async () => ({
      files: [
        canvas('F_DM', 'Runbook: DM', { ims: ['D123'] }),
        canvas('F_OTHER_DM', 'Runbook: Other DM', { ims: ['D456'] }),
      ],
    }));

    const result = await invoke(listRunbooks, deps);

    assert.ok(result.includes('F_DM'));
    assert.ok(!result.includes('F_OTHER_DM'));
  });

  it('add_emoji_reaction reacts to the current message', async (t) => {
    t.mock.method(Math, 'random', () => 0.5);
    client.reactions = { add: mock.fn(async () => ({ ok: true })) };
    deps.threadTs = '1700000000.000100';
    deps.messageTs = '1700000000.000200';

    const result = await invoke(addEmojiReaction, deps, { emoji_name: 'tada' });

    assert.strictEqual(client.reactions.add.mock.callCount(), 1);
    assert.deepStrictEqual(client.reactions.add.mock.calls[0].arguments[0], {
      channel: 'C123',
      timestamp: '1700000000.000200',
      name: 'tada',
    });
    assert.strictEqual(result, 'Reacted with :tada:');
  });
});
