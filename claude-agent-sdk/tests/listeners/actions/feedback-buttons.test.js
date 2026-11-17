import assert from 'node:assert';
import { describe, it, mock } from 'node:test';

import { handleFeedbackButton } from '../../../listeners/actions/feedback-buttons.js';

/**
 * @param {Record<string, any>} message
 * @param {string} [value]
 */
async function clickFeedback(message, value = 'good-feedback') {
  const client = { chat: { postEphemeral: mock.fn(async () => ({ ok: true })) } };
  await handleFeedbackButton(
    /** @type {any} */ ({
      ack: mock.fn(async () => {}),
      body: { actions: [{ value }], channel: { id: 'C123' }, message },
      client,
      context: { userId: 'U123' },
      logger: { debug: mock.fn(), error: mock.fn() },
    }),
  );
  return client.chat.postEphemeral.mock.calls[0].arguments[0];
}

describe('handleFeedbackButton', () => {
  it('posts the ephemeral in the thread of a threaded reply', async () => {
    const args = await clickFeedback({ ts: '1700000000.000200', thread_ts: '1700000000.000100' });
    assert.strictEqual(args.channel, 'C123');
    assert.strictEqual(args.user, 'U123');
    assert.strictEqual(args.thread_ts, '1700000000.000100');
  });

  it('posts the ephemeral under a top-level reply', async () => {
    const args = await clickFeedback({ ts: '1700000000.000200' }, 'bad-feedback');
    assert.strictEqual(args.thread_ts, '1700000000.000200');
    assert.ok(args.text.includes("Sorry that wasn't helpful."));
  });
});
