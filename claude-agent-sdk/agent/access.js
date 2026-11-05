/**
 * @returns {string | null}
 */
export function ownerUserId() {
  return process.env.OWNER_USER_ID || null;
}

/**
 * @param {string | null | undefined} userId
 * @returns {boolean}
 */
export function isOwner(userId) {
  const owner = ownerUserId();
  return owner !== null && userId === owner;
}

/**
 * @param {string | null | undefined} userToken
 * @param {boolean} isPrivateReply
 * @returns {string | undefined}
 */
export function replyUserToken(userToken, isPrivateReply) {
  return isPrivateReply && userToken ? userToken : undefined;
}
