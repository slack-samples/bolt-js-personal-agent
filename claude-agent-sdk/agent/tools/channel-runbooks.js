const RUNBOOK_PREFIX = 'Runbook:';

/**
 * @typedef {Object} Runbook
 * @property {string} [id]
 * @property {string} [title]
 * @property {string} [permalink]
 * @property {string[] | null} [channels]
 * @property {string[] | null} [groups]
 */

/**
 * @param {Runbook} runbook
 * @returns {string[]}
 */
export function sharedIn(runbook) {
  return [...(runbook.channels ?? []), ...(runbook.groups ?? [])];
}

/**
 * @param {import('../agent.js').AgentDeps} deps
 * @returns {Promise<Runbook[]>}
 */
export async function channelRunbooks(deps) {
  const response = await deps.client.files.list({ types: 'canvas', channel: deps.channelId });
  /** @type {Runbook[]} */
  const files = response.files ?? [];
  return files.filter((file) => file.title?.startsWith(RUNBOOK_PREFIX) && sharedIn(file).includes(deps.channelId));
}
