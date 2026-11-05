import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';

import { AgentDeps } from '../../agent/deps.js';
import { createRunbook, listRunbooks, readRunbook } from '../../agent/tools/index.js';
import { invoke, slackError } from '../helpers.js';

/**
 * @param {Record<string, any>[]} files
 */
function filesList(files) {
  return async () => ({ ok: true, files });
}

describe('runbook tools', () => {
  let client;
  let deps;

  beforeEach(() => {
    client = {
      canvases: { create: mock.fn(), getContent: mock.fn() },
      conversations: { info: mock.fn() },
      files: {
        info: mock.fn(async () => ({
          ok: true,
          file: {
            permalink: 'https://example.slack.com/docs/T1/F123',
            title: 'Runbook: Deploys',
          },
        })),
        list: mock.fn(),
      },
      users: { conversations: mock.fn() },
    };
    deps = new AgentDeps(client, 'U123', 'C123', '1700000000.000100', '1700000000.000100');
  });

  it('list_runbooks lists only runbooks', async () => {
    client.files.list.mock.mockImplementation(async () => ({
      ok: true,
      files: [
        {
          id: 'F123',
          permalink: 'https://example.com/F123',
          title: 'Runbook: Deploys',
          channels: ['C123'],
        },
        {
          id: 'F456',
          permalink: 'https://example.com/F456',
          title: 'Lunch orders',
          channels: ['C123'],
        },
      ],
    }));

    const result = await invoke(listRunbooks, deps);

    assert.strictEqual(client.files.list.mock.calls[0].arguments[0].types, 'canvas');
    assert.ok(result.includes('[Runbook: Deploys](https://example.com/F123) (`F123`)'));
    assert.ok(!result.includes('Lunch orders'));
  });

  it('list_runbooks without any', async () => {
    client.files.list.mock.mockImplementation(async () => ({
      ok: true,
      files: [],
    }));

    assert.strictEqual(await invoke(listRunbooks, deps), 'No runbooks yet.');
  });

  it('read_runbook returns its markdown', async () => {
    client.files.list.mock.mockImplementation(
      filesList([{ id: 'F123', title: 'Runbook: Test', permalink: 'https://example.com/F123', channels: ['C123'] }]),
    );
    client.canvases.getContent.mock.mockImplementation(async () => ({
      ok: true,
      content: '# Steps\n1. Rotate the secret',
    }));

    const result = await invoke(readRunbook, deps, {
      canvas_id: 'F123',
    });

    assert.deepStrictEqual(client.canvases.getContent.mock.calls[0].arguments[0], {
      canvas_id: 'F123',
    });
    assert.strictEqual(result, '# Steps\n1. Rotate the secret');
  });

  it('read_runbook reports errors', async () => {
    client.files.list.mock.mockImplementation(
      filesList([{ id: 'F404', title: 'Runbook: Test', permalink: 'https://example.com/F404', channels: ['C123'] }]),
    );
    client.canvases.getContent.mock.mockImplementation(async () => {
      throw slackError('canvas_not_found');
    });

    const result = await invoke(readRunbook, deps, {
      canvas_id: 'F404',
    });

    assert.ok(result.includes('canvas_not_found'));
  });

  it('create_runbook adds a channel tab', async () => {
    client.canvases.create.mock.mockImplementation(async () => ({
      ok: true,
      canvas_id: 'F123',
    }));

    const result = await invoke(createRunbook, deps, {
      markdown: '# Steps\n1. Redeploy',
      topic: 'Deploys',
    });

    assert.deepStrictEqual(client.canvases.create.mock.calls[0].arguments[0], {
      channel_id: 'C123',
      document_content: {
        markdown: '# Steps\n1. Redeploy',
        type: 'markdown',
      },
      title: 'Runbook: Deploys',
    });
    assert.deepStrictEqual(client.files.info.mock.calls[0].arguments[0], {
      file: 'F123',
    });
    assert.strictEqual(result, 'Created [Runbook: Deploys](https://example.slack.com/docs/T1/F123).');
  });

  it('create_runbook asks to fix rejected markdown', async () => {
    client.canvases.create.mock.mockImplementation(async () => {
      throw slackError('canvas_creation_failed', 'Unsupported nested list');
    });

    const result = await invoke(createRunbook, deps, {
      markdown: '1. - x',
      topic: 'Deploys',
    });

    assert.ok(result.includes('Unsupported nested list'));
    assert.ok(result.includes('call create_runbook again'));
  });

  it('lists only runbooks shared in the current channel', async () => {
    client.files.list.mock.mockImplementation(
      filesList([
        { id: 'F_HERE', title: 'Runbook: Here', permalink: 'https://example.com/F_HERE', channels: ['C123'] },
        {
          id: 'F_HERE_PRIVATE',
          title: 'Runbook: Here too',
          permalink: 'https://example.com/F_HERE_PRIVATE',
          groups: ['C123'],
        },
        {
          id: 'F_OTHER',
          title: 'Runbook: Other public channel',
          permalink: 'https://example.com/F_OTHER',
          channels: ['C_PUB'],
        },
        { id: 'F_PRIV', title: 'Runbook: Private', permalink: 'https://example.com/F_PRIV', groups: ['G_PRIV'] },
      ]),
    );

    const result = await invoke(listRunbooks, deps);

    assert.ok(result.includes('F_HERE'));
    assert.ok(result.includes('F_HERE_PRIVATE'));
    assert.ok(!result.includes('F_OTHER'));
    assert.ok(!result.includes('F_PRIV'));
    assert.strictEqual(client.conversations.info.mock.callCount(), 0);
    assert.strictEqual(client.users.conversations.mock.callCount(), 0);
  });

  it('read_runbook refuses a runbook from another channel', async () => {
    client.files.list.mock.mockImplementation(
      filesList([
        { id: 'F_OTHER', title: 'Runbook: Other', permalink: 'https://example.com/F_OTHER', channels: ['C_PUB'] },
      ]),
    );

    const result = await invoke(readRunbook, deps, { canvas_id: 'F_OTHER' });

    assert.strictEqual(result, "That runbook isn't available here.");
    assert.strictEqual(client.canvases.getContent.mock.callCount(), 0);
  });

  it('treats null channels and groups as not shared', async () => {
    client.files.list.mock.mockImplementation(
      filesList([
        {
          id: 'F_NULL',
          title: 'Runbook: Null',
          permalink: 'https://example.com/F_NULL',
          channels: null,
          groups: null,
          ims: null,
        },
      ]),
    );

    assert.strictEqual(await invoke(listRunbooks, deps), 'No runbooks yet.');
  });

  it('lists runbooks shared in the current DM only', async () => {
    deps.channelId = 'D123';
    client.files.list.mock.mockImplementation(
      filesList([
        { id: 'F_DM', title: 'Runbook: DM', permalink: 'https://example.com/F_DM', ims: ['D123'] },
        { id: 'F_OTHER_DM', title: 'Runbook: Other DM', permalink: 'https://example.com/F_OTHER_DM', ims: ['D456'] },
      ]),
    );

    const result = await invoke(listRunbooks, deps);

    assert.ok(result.includes('F_DM'));
    assert.ok(!result.includes('F_OTHER_DM'));
  });
});
