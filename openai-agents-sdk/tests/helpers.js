import fs from 'node:fs';
import { mock } from 'node:test';

import { MCPServerStreamableHttp, RunContext } from '@openai/agents';

/**
 * @param {string} error
 * @param {string} [detail]
 */
export function slackError(error, detail) {
  return Object.assign(new Error(error), {
    data: {
      detail,
      error,
      ok: false,
    },
  });
}

/**
 * @param {any} tool
 * @param {import('../agent/deps.js').AgentDeps} deps
 * @param {Record<string, any>} [args]
 */
export async function invoke(tool, deps, args = {}) {
  return await tool.invoke(new RunContext(deps), JSON.stringify(args));
}

/**
 * Set OWNER_USER_ID for this test, or unset it with null.
 * @param {import('node:test').TestContext} t
 * @param {string | null} ownerUserId
 */
export function withOwner(t, ownerUserId) {
  withEnv(t, { OWNER_USER_ID: ownerUserId });
}

/**
 * Set environment variables for this test, unsetting those given null.
 * @param {import('node:test').TestContext} t
 * @param {Record<string, string | null>} values
 */
export function withEnv(t, values) {
  const original = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  t.after(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

/**
 * Make every file read return `soul` for this test.
 * @param {import('node:test').TestContext} t
 * @param {string} soul
 */
export function withSoul(t, soul) {
  const readFileSync = mock.method(fs, 'readFileSync', () => soul);
  t.after(() => readFileSync.mock.restore());
}

const SLACK_MCP_TOOLS = [
  'slack_create_canvas',
  'slack_read_canvas',
  'slack_read_channel',
  'slack_read_thread',
  'slack_search_public',
  'slack_search_public_and_private',
  'slack_send_message',
  'slack_update_canvas',
];

/**
 * Stand in for the Slack MCP Server for this test, offering every tool it has.
 * Returns the servers the agent connected to.
 * @param {import('node:test').TestContext} t
 */
export function fakeSlackMcp(t) {
  /** @type {any[]} */
  const servers = [];
  const proto = MCPServerStreamableHttp.prototype;
  const mocks = [
    mock.method(proto, 'connect', async function () {
      servers.push(this);
    }),
    mock.method(proto, 'close', async () => {}),
    mock.method(proto, 'listTools', async () =>
      SLACK_MCP_TOOLS.map((name) => ({
        name,
        description: name,
        inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
      })),
    ),
  ];
  t.after(() => {
    for (const m of mocks) {
      m.mock.restore();
    }
  });
  return {
    servers,
    /** @param {any} server */
    authorization: (server) => server.underlying.params.requestInit.headers.Authorization,
    /** @param {any} server */
    allowed: (server) => server.toolFilter.allowedToolNames,
  };
}
