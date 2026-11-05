import assert from 'node:assert';
import { describe, it } from 'node:test';

import { isOwner, ownerUserId, replyUserToken } from '../../agent/access.js';
import { withOwner } from '../helpers.js';

describe('access', () => {
  it('matches the owner by OWNER_USER_ID', (t) => {
    withOwner(t, 'U0WNER');
    assert.strictEqual(isOwner('U0WNER'), true);
    assert.strictEqual(isOwner('U0THER'), false);
  });

  it('has no owner when OWNER_USER_ID is unset', (t) => {
    withOwner(t, null);
    assert.strictEqual(ownerUserId(), null);
    assert.strictEqual(isOwner('U0WNER'), false);
    assert.strictEqual(isOwner(null), false);
    assert.strictEqual(isOwner(undefined), false);
  });

  it('has no owner when OWNER_USER_ID is empty', (t) => {
    withOwner(t, '');
    assert.strictEqual(ownerUserId(), null);
  });

  it('only gives a user token to private replies', () => {
    assert.strictEqual(replyUserToken('xoxp-1', true), 'xoxp-1');
    assert.strictEqual(replyUserToken('xoxp-1', false), undefined);
    assert.strictEqual(replyUserToken(undefined, true), undefined);
  });
});
