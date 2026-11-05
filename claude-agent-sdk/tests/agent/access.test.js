import assert from 'node:assert';
import { describe, it } from 'node:test';

import { isOwner, ownerUserId, replyUserToken } from '../../agent/access.js';
import { setEnv } from '../helpers.js';

describe('access', () => {
  it('isOwner matches OWNER_USER_ID', (t) => {
    setEnv(t, { OWNER_USER_ID: 'U0WNER' });
    assert.strictEqual(isOwner('U0WNER'), true);
    assert.strictEqual(isOwner('U0THER'), false);
  });

  it('has no owner when the env is unset', (t) => {
    setEnv(t, { OWNER_USER_ID: undefined });
    assert.strictEqual(ownerUserId(), null);
    assert.strictEqual(isOwner('U0WNER'), false);
    assert.strictEqual(isOwner(null), false);
    assert.strictEqual(isOwner(undefined), false);
  });

  it('has no owner when the env is empty', (t) => {
    setEnv(t, { OWNER_USER_ID: '' });
    assert.strictEqual(ownerUserId(), null);
  });

  it('replyUserToken only returns a token for private replies', () => {
    assert.strictEqual(replyUserToken('xoxp-1', true), 'xoxp-1');
    assert.strictEqual(replyUserToken('xoxp-1', false), undefined);
    assert.strictEqual(replyUserToken(undefined, true), undefined);
  });
});
