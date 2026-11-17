import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, it, mock } from 'node:test';

import { soulFiles } from '../../../agent/soul.js';
import { handleAppHomeOpened } from '../../../listeners/events/app-home-opened.js';
import { setEnv, useSoul } from '../../helpers.js';

describe('handleAppHomeOpened', () => {
  let fakeClient;
  let fakeContext;
  let fakeLogger;

  beforeEach(() => {
    fakeClient = {
      views: { publish: mock.fn(async () => ({ ok: true })) },
      assistant: { threads: { setSuggestedPrompts: mock.fn(async () => ({ ok: true })) } },
    };
    fakeContext = { userId: 'U123', userToken: undefined };
    fakeLogger = { error: mock.fn() };
  });

  /** @param {Record<string, any>} event */
  async function open(event) {
    await handleAppHomeOpened(
      /** @type {any} */ ({ client: fakeClient, event, context: fakeContext, logger: fakeLogger }),
    );
  }

  function promptTitles() {
    const { prompts } = fakeClient.assistant.threads.setSuggestedPrompts.mock.calls[0].arguments[0];
    return prompts.map((/** @type {{ title: string }} */ prompt) => prompt.title);
  }

  function publishedView() {
    return JSON.stringify(fakeClient.views.publish.mock.calls[0].arguments[0].view);
  }

  it('publishes the home view when event.tab === "home"', async () => {
    await open({ tab: 'home', channel: 'D123' });
    assert.strictEqual(fakeClient.views.publish.mock.callCount(), 1);
    const callArgs = fakeClient.views.publish.mock.calls[0].arguments[0];
    assert.strictEqual(callArgs.user_id, 'U123');
    assert.strictEqual(callArgs.view.type, 'home');
    assert.strictEqual(fakeClient.assistant.threads.setSuggestedPrompts.mock.callCount(), 0);
  });

  it('sets suggested prompts when event.tab === "messages"', async () => {
    await open({ tab: 'messages', channel: 'D123' });
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
    await open({ tab: 'home', channel: 'D123' });
    assert.strictEqual(fakeLogger.error.mock.callCount(), 1);
  });

  it('shows owner prompts on the messages tab', async (t) => {
    setEnv(t, { OWNER_USER_ID: 'U123' });
    await open({ tab: 'messages', channel: 'D123' });
    const titles = promptTitles();
    assert.ok(titles.includes('Write a Runbook'));
    assert.ok(titles.includes('Update my soul'));
  });

  it('shows guest prompts on the messages tab', async (t) => {
    setEnv(t, { OWNER_USER_ID: 'UOWNER' });
    fakeContext.userId = 'UGUEST';
    await open({ tab: 'messages', channel: 'D123' });
    const titles = promptTitles();
    assert.ok(titles.includes("Ask what they're working on"));
    assert.ok(!titles.includes('Update my soul'));
  });

  it('shows the soul status to the owner', async (t) => {
    setEnv(t, { OWNER_USER_ID: 'U123' });
    useSoul(t, readFileSync(soulFiles.templatePath, 'utf-8'));
    await open({ tab: 'home', channel: 'D123' });
    assert.ok(publishedView().includes("isn't set up"));
  });

  it('shows a filled-in copy of the template as set up', async (t) => {
    setEnv(t, { OWNER_USER_ID: 'U123' });
    useSoul(t, `${readFileSync(soulFiles.templatePath, 'utf-8')}\nName: Ada`);
    await open({ tab: 'home', channel: 'D123' });
    assert.ok(publishedView().includes('Your soul is set up'));
  });

  it('hides the soul status from guests', async (t) => {
    setEnv(t, { OWNER_USER_ID: 'UOWNER' });
    fakeContext.userId = 'UGUEST';
    await open({ tab: 'home', channel: 'D123' });
    assert.ok(!publishedView().toLowerCase().includes('soul'));
  });
});
