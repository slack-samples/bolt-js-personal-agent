import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';

import { handleAppHomeOpened } from '../../../listeners/events/app-home-opened.js';
import { withOwner, withSoul } from '../../helpers.js';

describe('handleAppHomeOpened', () => {
  let fakeClient;
  let fakeContext;
  let fakeLogger;

  beforeEach(() => {
    fakeClient = {
      views: { publish: mock.fn(async () => ({ ok: true })) },
      assistant: { threads: { setSuggestedPrompts: mock.fn(async () => ({ ok: true })) } },
    };
    fakeContext = { userId: 'U123' };
    fakeLogger = { error: mock.fn() };
  });

  it('publishes the home view when event.tab === "home"', async () => {
    const event = { tab: 'home', channel: 'D123' };
    await handleAppHomeOpened({ client: fakeClient, event, context: fakeContext, logger: fakeLogger });
    assert.strictEqual(fakeClient.views.publish.mock.callCount(), 1);
    const callArgs = fakeClient.views.publish.mock.calls[0].arguments[0];
    assert.strictEqual(callArgs.user_id, 'U123');
    assert.strictEqual(callArgs.view.type, 'home');
    assert.strictEqual(fakeClient.assistant.threads.setSuggestedPrompts.mock.callCount(), 0);
  });

  it('sets suggested prompts when event.tab === "messages"', async () => {
    const event = { tab: 'messages', channel: 'D123' };
    await handleAppHomeOpened({ client: fakeClient, event, context: fakeContext, logger: fakeLogger });
    assert.strictEqual(fakeClient.assistant.threads.setSuggestedPrompts.mock.callCount(), 1);
    const callArgs = fakeClient.assistant.threads.setSuggestedPrompts.mock.calls[0].arguments[0];
    assert.strictEqual(callArgs.channel_id, 'D123');
    assert.ok(Array.isArray(callArgs.prompts));
    assert.strictEqual(fakeClient.views.publish.mock.callCount(), 0);
  });

  it('logs error when views.publish fails', async () => {
    fakeClient.views.publish = mock.fn(async () => {
      throw new Error('API error');
    });
    const event = { tab: 'home', channel: 'D123' };
    await handleAppHomeOpened({ client: fakeClient, event, context: fakeContext, logger: fakeLogger });
    assert.strictEqual(fakeLogger.error.mock.callCount(), 1);
  });

  it('shows owner prompts on the Messages tab', async (t) => {
    withOwner(t, 'U123');
    const event = { tab: 'messages', channel: 'D123' };
    await handleAppHomeOpened({ client: fakeClient, event, context: fakeContext, logger: fakeLogger });
    const { prompts } = fakeClient.assistant.threads.setSuggestedPrompts.mock.calls[0].arguments[0];
    const titles = prompts.map((/** @type {any} */ p) => p.title);
    assert.ok(titles.includes('Write a Runbook'));
    assert.ok(titles.includes('Update my soul'));
  });

  it('shows guest prompts on the Messages tab', async (t) => {
    withOwner(t, 'UOWNER');
    fakeContext.userId = 'UGUEST';
    const event = { tab: 'messages', channel: 'D123' };
    await handleAppHomeOpened({ client: fakeClient, event, context: fakeContext, logger: fakeLogger });
    const { prompts } = fakeClient.assistant.threads.setSuggestedPrompts.mock.calls[0].arguments[0];
    const titles = prompts.map((/** @type {any} */ p) => p.title);
    assert.ok(titles.includes("Ask what they're working on"));
    assert.ok(!titles.includes('Update my soul'));
  });

  it('shows the soul status to the owner', async (t) => {
    withOwner(t, 'U123');
    withSoul(t, '<!-- soul-template -->\nTemplate content');
    const event = { tab: 'home', channel: 'D123' };
    await handleAppHomeOpened({ client: fakeClient, event, context: fakeContext, logger: fakeLogger });
    const { view } = fakeClient.views.publish.mock.calls[0].arguments[0];
    assert.ok(JSON.stringify(view).includes("isn't set up"));
  });

  it('hides the soul status from guests', async (t) => {
    withOwner(t, 'UOWNER');
    fakeContext.userId = 'UGUEST';
    const event = { tab: 'home', channel: 'D123' };
    await handleAppHomeOpened({ client: fakeClient, event, context: fakeContext, logger: fakeLogger });
    const { view } = fakeClient.views.publish.mock.calls[0].arguments[0];
    assert.ok(!JSON.stringify(view).toLowerCase().includes('soul'));
  });
});
