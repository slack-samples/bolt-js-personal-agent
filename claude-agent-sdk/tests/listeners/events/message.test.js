import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';

import { sdk } from '../../../agent/agent.js';
import { handleMessage } from '../../../listeners/events/message.js';
import { sessionStore } from '../../../thread-context/index.js';
import { answer, setEnv } from '../../helpers.js';

const LEARNED = 'Added the steps to [Runbook: Deploys](https://example.com).';

/** @param {any} query */
function callOptions(query, index = 0) {
  return query.mock.calls[index].arguments[0];
}

describe('handleMessage', () => {
  let client;
  let context;
  let logger;
  let streamer;

  beforeEach((t) => {
    sessionStore._store.clear();
    setEnv(/** @type {import('node:test').TestContext} */ (t), { OWNER_USER_ID: 'U0WNER' });
    client = { chat: { postEphemeral: mock.fn(async () => ({ ok: true })) } };
    context = { botUserId: 'UB0T', userId: 'U123', userToken: 'xoxp-123' };
    logger = { error: mock.fn() };
    streamer = { append: mock.fn(async () => {}), stop: mock.fn(async () => {}) };
  });

  /** @param {Record<string, any>} event */
  async function handle(event) {
    await handleMessage(
      /** @type {any} */ ({
        client,
        context,
        event: { channel: 'C123', ...event },
        logger,
        say: mock.fn(async () => {}),
        sayStream: () => streamer,
        setStatus: mock.fn(async () => {}),
      }),
    );
  }

  it('learns with the bot token only', async (t) => {
    const query = t.mock.method(sdk, 'query', answer(LEARNED, ['mcp__agent-tools__create_runbook']));

    await handle({
      channel_type: 'channel',
      text: 'Fixed it: rotate the signing secret, then redeploy',
      thread_ts: '1700000000.000100',
      ts: '1700000000.000200',
    });

    const { prompt, options } = callOptions(query);
    assert.ok(prompt.startsWith('Learn from this channel message'));
    assert.ok(prompt.includes('rotate the signing secret'));
    assert.ok(options.systemPrompt.includes('<@U123>'));
    assert.ok(options.systemPrompt.includes('The requester is not your owner.'));
    assert.ok(options.systemPrompt.includes('Your reply is not private'));
    assert.deepStrictEqual(Object.keys(options.mcpServers), ['agent-tools']);
    const args = client.chat.postEphemeral.mock.calls[0].arguments[0];
    assert.strictEqual(args.user, 'U123');
    assert.strictEqual(args.thread_ts, '1700000000.000100');
    assert.ok(args.markdown_text.includes('Runbook: Deploys'));
  });

  it('never resumes or stores a session while learning', async (t) => {
    sessionStore.setSession('C123', 't1', 'U123', 'reply-session');
    const query = t.mock.method(sdk, 'query', answer(LEARNED, ['mcp__agent-tools__create_runbook']));

    await handle({
      channel_type: 'channel',
      subtype: 'thread_broadcast',
      text: 'Fixed it',
      thread_ts: 't1',
      ts: 't2',
    });

    assert.strictEqual(query.mock.callCount(), 1);
    const { options } = callOptions(query);
    assert.strictEqual(options.resume, undefined);
    assert.strictEqual(options.persistSession, false);
    assert.strictEqual(sessionStore.getSession('C123', 't1', 'U123'), 'reply-session');
  });

  it('stays quiet when no runbook changed', async (t) => {
    const query = t.mock.method(sdk, 'query', answer('Nothing to keep.', ['mcp__agent-tools__list_runbooks']));

    await handle({
      channel_type: 'group',
      text: 'Lunch at noon?',
      ts: '1700000000.000100',
    });

    assert.strictEqual(query.mock.callCount(), 1);
    assert.strictEqual(client.chat.postEphemeral.mock.callCount(), 0);
  });

  it('learns from broadcast thread replies', async (t) => {
    const query = t.mock.method(sdk, 'query', answer('Nothing to keep.'));

    await handle({
      channel_type: 'channel',
      subtype: 'thread_broadcast',
      text: 'Fixed: restarting the worker cleared the queue',
      thread_ts: '1700000000.000100',
      ts: '1700000000.000200',
    });

    assert.strictEqual(query.mock.callCount(), 1);
  });

  it('logs learning errors', async (t) => {
    t.mock.method(sdk, 'query', async function* () {
      yield* [];
      throw new Error('test exception');
    });

    await handle({
      channel_type: 'channel',
      text: 'Fixed it: rotate the signing secret',
      ts: '1700000000.000100',
    });

    assert.ok(logger.error.mock.calls[0].arguments[0].includes('test exception'));
  });

  it('learns with the bot token without a user token', async (t) => {
    context.userToken = undefined;
    const query = t.mock.method(sdk, 'query', answer(LEARNED, ['mcp__agent-tools__create_runbook']));

    await handle({
      channel_type: 'channel',
      text: 'Fixed it: rotate the signing secret',
      ts: '1700000000.000100',
    });

    const { options } = callOptions(query);
    assert.deepStrictEqual(Object.keys(options.mcpServers), ['agent-tools']);
    assert.strictEqual(client.chat.postEphemeral.mock.callCount(), 1);
  });

  it('does not learn from edits or bots', async (t) => {
    const query = t.mock.method(sdk, 'query', answer('Nothing to keep.'));

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

    assert.strictEqual(query.mock.callCount(), 0);
  });

  it('does not learn from DMs', async (t) => {
    const query = t.mock.method(sdk, 'query', answer('Hi.'));

    await handle({ channel_type: 'im', text: 'Thanks!', ts: '1700000000.000100' });

    for (const call of query.mock.calls) {
      assert.ok(!call.arguments[0].prompt.startsWith('Learn from'));
    }
  });

  it("uses the requester's token privately in a DM", async (t) => {
    const query = t.mock.method(sdk, 'query', answer('Hi.'));

    await handle({ channel_type: 'im', text: "What's new?", ts: '1700000000.000100' });

    const { options } = callOptions(query);
    assert.strictEqual(options.mcpServers['slack-mcp'].headers.Authorization, 'Bearer xoxp-123');
    assert.ok(options.systemPrompt.includes('Your reply is private'));
    assert.strictEqual(sessionStore.getSession('C123', '1700000000.000100', 'U123'), 'session-1');
  });

  it("excludes the owner's history from a teammate reply in an engaged thread", async (t) => {
    sessionStore.setSession('C123', 't1', 'U0WNER', 'owner-session');
    const query = t.mock.method(sdk, 'query', answer('Nothing to keep.'));

    await handle({ channel_type: 'channel', text: 'Any update?', thread_ts: 't1', ts: 't2' });

    assert.strictEqual(query.mock.callCount(), 2);
    const { prompt, options } = callOptions(query, 1);
    assert.strictEqual(prompt, 'Any update?');
    assert.strictEqual(options.resume, undefined);
    assert.ok(options.systemPrompt.includes('<@U123>'));
    assert.ok(options.systemPrompt.includes('The requester is not your owner.'));
    assert.ok(options.systemPrompt.includes('Your reply is not private'));
    assert.ok(!('slack-mcp' in options.mcpServers));
  });

  it('ignores a thread reply when the thread is not engaged', async (t) => {
    const query = t.mock.method(sdk, 'query', answer('Nothing to keep.'));

    await handle({ channel_type: 'channel', text: 'Any update?', thread_ts: 't1', ts: 't2' });

    assert.strictEqual(query.mock.callCount(), 1);
    assert.ok(callOptions(query).prompt.startsWith('Learn from'));
  });

  it('uses no token for an owner reply in an engaged thread', async (t) => {
    setEnv(t, { OWNER_USER_ID: 'U123' });
    sessionStore.setSession('C123', 't1', 'U123', 'owner-session');
    const query = t.mock.method(sdk, 'query', answer('Nothing to keep.'));

    await handle({ channel_type: 'channel', text: 'Any update?', thread_ts: 't1', ts: 't2' });

    assert.strictEqual(query.mock.callCount(), 2);
    const { options } = callOptions(query, 1);
    assert.strictEqual(options.resume, 'owner-session');
    assert.ok(options.systemPrompt.includes('The requester is your owner.'));
    assert.ok(options.systemPrompt.includes('Your reply is not private'));
    assert.ok(!('slack-mcp' in options.mcpServers));
    assert.ok('agent-tools' in options.mcpServers);
  });

  it('treats "Brief me" in the owner DM as a normal DM', async (t) => {
    setEnv(t, { OWNER_USER_ID: 'U123' });
    context.userToken = undefined;
    const query = t.mock.method(sdk, 'query', answer('Hi.'));

    await handle({ channel_type: 'im', text: 'Brief me', ts: '1700000000.000100' });

    const { options } = callOptions(query);
    assert.ok(options.systemPrompt.includes('The requester is your owner.'));
    assert.ok(options.systemPrompt.includes('Your reply is private'));
    assert.ok(options.allowedTools.includes('mcp__agent-tools__update_soul'));
    assert.strictEqual(options.persistSession, true);
  });

  it('leaves replies that mention the agent to app_mention', async (t) => {
    sessionStore.setSession('C123', 't1', 'U123', 'reply-session');
    const query = t.mock.method(sdk, 'query', answer('Nothing to keep.'));

    await handle({ channel_type: 'channel', text: '<@UB0T> any update?', thread_ts: 't1', ts: 't2' });

    assert.strictEqual(query.mock.callCount(), 1);
    assert.ok(callOptions(query).prompt.startsWith('Learn from'));
    assert.strictEqual(streamer.append.mock.callCount(), 0);
  });

  it('looks up the bot user once when the context has none', async (t) => {
    context = { botToken: 'xoxb-fallback', userId: 'U123' };
    client.auth = { test: mock.fn(async () => ({ ok: true, user_id: 'UB0T' })) };
    sessionStore.setSession('C123', 't1', 'U123', 'reply-session');
    const query = t.mock.method(sdk, 'query', answer('Nothing to keep.'));

    await handle({ channel_type: 'channel', text: '<@UB0T> any update?', thread_ts: 't1', ts: 't2' });
    await handle({ channel_type: 'channel', text: '<@UB0T> still there?', thread_ts: 't1', ts: 't3' });

    assert.strictEqual(client.auth.test.mock.callCount(), 1);
    assert.strictEqual(query.mock.callCount(), 2);
    assert.strictEqual(streamer.append.mock.callCount(), 0);
  });

  it('still replies to DMs that mention the agent', async (t) => {
    const query = t.mock.method(sdk, 'query', answer('Hi.'));

    await handle({ channel_type: 'im', text: '<@UB0T> hello', ts: '1700000000.000100' });

    assert.strictEqual(query.mock.callCount(), 1);
    assert.strictEqual(streamer.append.mock.callCount(), 1);
  });
});
