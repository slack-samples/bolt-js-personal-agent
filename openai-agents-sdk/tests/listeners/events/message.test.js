import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';

import { setTracingDisabled } from '@openai/agents';

import { handleMessage } from '../../../listeners/events/message.js';
import { conversationStore } from '../../../thread-context/index.js';
import { call, instructions, say, scripted, toolNames } from '../../fake-model.js';
import { fakeSlackMcp, withOwner } from '../../helpers.js';

setTracingDisabled(true);

describe('handleMessage', () => {
  let client;
  let logger;
  let streamer;
  let mcp;

  beforeEach((t) => {
    conversationStore._store.clear();
    withOwner(t, null);
    mcp = fakeSlackMcp(t);
    streamer = {
      append: mock.fn(async () => {}),
      stop: mock.fn(async () => {}),
    };
    client = {
      canvases: {
        create: mock.fn(async () => ({
          ok: true,
          canvas_id: 'F123',
        })),
      },
      chat: { postEphemeral: mock.fn(async () => ({ ok: true })) },
      files: {
        info: mock.fn(async () => ({
          ok: true,
          file: {
            permalink: 'https://example.com/F123',
            title: 'Runbook: Deploys',
          },
        })),
      },
    };
    logger = { error: mock.fn() };
  });

  /** @param {Record<string, any>} event */
  async function handle(event) {
    await handleMessage(
      /** @type {any} */ ({
        client,
        context: {
          userId: 'U123',
          userToken: 'xoxp-123',
        },
        event: {
          channel: 'C123',
          ...event,
        },
        logger,
        say: mock.fn(),
        sayStream: () => streamer,
        setStatus: mock.fn(),
      }),
    );
  }

  it('learns with the bot token only', async (t) => {
    const model = scripted(t, (callNumber) =>
      callNumber === 1
        ? call('create_runbook', {
            markdown: '# Steps\n1. Rotate the signing secret\n2. Redeploy',
            topic: 'Deploys',
          })
        : say('Added the steps to [Runbook: Deploys](https://example.com/F123).'),
    );

    await handle({
      channel_type: 'channel',
      text: 'Fixed it: rotate the signing secret, then redeploy',
      thread_ts: '1700000000.000100',
      ts: '1700000000.000200',
    });

    const learnInput = JSON.stringify(model.inputs[0]);
    assert.ok(learnInput.includes('Learn from this channel message'));
    assert.ok(learnInput.includes('rotate the signing secret'));
    assert.strictEqual(mcp.servers.length, 0);
    assert.ok(!toolNames(model).includes('update_soul'));
    assert.ok(instructions(model).includes('<@U123>'));
    assert.ok(instructions(model).includes('The requester is not your owner.'));
    assert.ok(instructions(model).includes('Your reply is not private'));
    assert.strictEqual(client.canvases.create.mock.calls[0].arguments[0].channel_id, 'C123');
    assert.deepStrictEqual(client.chat.postEphemeral.mock.calls[0].arguments[0], {
      channel: 'C123',
      markdown_text: 'Added the steps to [Runbook: Deploys](https://example.com/F123).',
      thread_ts: '1700000000.000100',
      user: 'U123',
    });
  });

  it('stays quiet when no runbook changed', async (t) => {
    const model = scripted(t, () => say('Nothing to keep.'));

    await handle({
      channel_type: 'group',
      text: 'Lunch at noon?',
      ts: '1700000000.000100',
    });

    assert.strictEqual(model.inputs.length, 1);
    assert.strictEqual(client.chat.postEphemeral.mock.callCount(), 0);
  });

  it('learns from broadcast thread replies', async (t) => {
    const model = scripted(t, () => say('Nothing to keep.'));

    await handle({
      channel_type: 'channel',
      subtype: 'thread_broadcast',
      text: 'Fixed: restarting the worker cleared the queue',
      thread_ts: '1700000000.000100',
      ts: '1700000000.000200',
    });

    assert.strictEqual(model.inputs.length, 1);
  });

  it('logs learning errors', async (t) => {
    scripted(t, () => {
      throw new Error('test exception');
    });

    await handle({
      channel_type: 'channel',
      text: 'Fixed it: rotate the signing secret',
      ts: '1700000000.000100',
    });

    assert.ok(logger.error.mock.calls[0].arguments[0].includes('test exception'));
  });

  it('does not learn from edits or bots', async (t) => {
    const model = scripted(t, () => say('Nothing to keep.'));

    await handle({
      channel_type: 'channel',
      subtype: 'message_changed',
      ts: '1700000000.000100',
    });
    await handle({
      bot_id: 'B123',
      channel_type: 'channel',
      text: 'Added the steps to the runbook.',
      ts: '1700000000.000200',
    });

    assert.strictEqual(model.inputs.length, 0);
  });

  it('does not learn from DMs', async (t) => {
    const model = scripted(t, () => say('Thanks!'));

    await handle({ channel_type: 'im', text: 'Thanks!', ts: '1700000000.000100' });

    for (const input of model.inputs) {
      assert.ok(!JSON.stringify(input).includes('Learn from'));
    }
  });

  it("uses the requester's token privately in a DM", async (t) => {
    const model = scripted(t, () => say("Here's what's new."));

    await handle({ channel_type: 'im', text: "What's new?", ts: '1700000000.000100' });

    assert.strictEqual(mcp.servers.length, 1);
    assert.strictEqual(mcp.authorization(mcp.servers[0]), 'Bearer xoxp-123');
    assert.ok(instructions(model).includes('Your reply is private'));
    assert.ok(conversationStore.getHistory('C123', '1700000000.000100', 'U123'));
  });

  it("keeps the owner's history out of a teammate's reply in an engaged thread", async (t) => {
    withOwner(t, 'U0WNER');
    conversationStore.setHistory('C123', 't1', 'U0WNER', [{ role: 'user', content: 'owner secret' }]);
    const model = scripted(t, () => say('No update yet.'));

    await handle({ channel_type: 'channel', text: 'Any update?', thread_ts: 't1', ts: 't2' });

    assert.strictEqual(model.inputs.length, 2);
    assert.deepStrictEqual(model.inputs[1], [{ type: 'message', role: 'user', content: 'Any update?' }]);
    assert.ok(!JSON.stringify(model.inputs[1]).includes('owner secret'));
    assert.strictEqual(mcp.servers.length, 0);
    assert.ok(instructions(model, 2).includes('<@U123>'));
    assert.ok(instructions(model, 2).includes('The requester is not your owner.'));
    assert.ok(instructions(model, 2).includes('Your reply is not private'));
  });

  it('ignores thread replies when the thread is not engaged', async (t) => {
    const model = scripted(t, () => say('Nothing to keep.'));

    await handle({ channel_type: 'channel', text: 'Any update?', thread_ts: 't1', ts: 't2' });

    assert.strictEqual(model.inputs.length, 1);
    assert.ok(JSON.stringify(model.inputs[0]).includes('Learn from'));
  });

  it("uses no token for the owner's reply in an engaged thread", async (t) => {
    withOwner(t, 'U123');
    conversationStore.setHistory('C123', 't1', 'U123', []);
    const model = scripted(t, () => say('No update yet.'));

    await handle({ channel_type: 'channel', text: 'Any update?', thread_ts: 't1', ts: 't2' });

    assert.strictEqual(model.inputs.length, 2);
    assert.strictEqual(mcp.servers.length, 0);
    assert.ok(!toolNames(model, 2).includes('update_soul'));
    assert.ok(instructions(model, 2).includes('The requester is your owner.'));
    assert.ok(instructions(model, 2).includes('Your reply is not private'));
  });

  it("treats the owner's 'Brief me' DM as a normal DM", async (t) => {
    withOwner(t, 'U123');
    const model = scripted(t, () => say('Here you go.'));

    await handle({ channel_type: 'im', text: 'Brief me', ts: '1700000000.000100' });

    assert.deepStrictEqual(mcp.allowed(mcp.servers[0]), [
      'slack_create_canvas',
      'slack_read_canvas',
      'slack_search_public_and_private',
      'slack_update_canvas',
    ]);
    assert.ok(toolNames(model).includes('update_soul'));
    assert.ok(instructions(model).includes('The requester is your owner.'));
    assert.ok(instructions(model).includes('Your reply is private'));
  });
});
