const RUNBOOK_PREFIX = 'Runbook:';

/**
 * @param {Record<string, any>} runbook
 * @returns {string[]}
 */
function sharedIn(runbook) {
  return [...(runbook.channels ?? []), ...(runbook.groups ?? [])];
}

/**
 * List the runbooks shared in the current conversation.
 * @param {import('../deps.js').AgentDeps} deps
 * @returns {Promise<Record<string, any>[]>}
 */
export async function channelRunbooks(deps) {
  const response = await deps.client.files.list({
    types: 'canvas',
    channel: deps.channelId,
  });
  return (response.files ?? []).filter(
    (file) => (file.title ?? '').startsWith(RUNBOOK_PREFIX) && sharedIn(file).includes(deps.channelId),
  );
}
