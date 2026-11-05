import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { soulFiles } from '../agent/soul.js';

/**
 * @param {string} error
 * @param {string} [detail]
 */
export function slackError(error, detail) {
  return Object.assign(new Error(error), {
    data: {
      ok: false,
      error,
      ...(detail && { detail }),
    },
  });
}

/**
 * @param {(deps: any) => import('@anthropic-ai/claude-agent-sdk').SdkMcpToolDefinition<any>} tool
 * @param {any} deps
 * @param {Record<string, any>} [args]
 * @returns {Promise<string>}
 */
export async function invoke(tool, deps, args = {}) {
  const result = await tool(deps).handler(args, undefined);
  return /** @type {{ text: string }} */ (result.content[0]).text;
}

/**
 * Set environment variables for one test, restoring them afterwards. `undefined` unsets a variable.
 * @param {import('node:test').TestContext} t
 * @param {Record<string, string | undefined>} values
 */
export function setEnv(t, values) {
  for (const [key, value] of Object.entries(values)) {
    const previous = process.env[key];
    t.after(() => {
      if (previous === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous;
      }
    });
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

/**
 * @returns {string}
 */
export function tempDir() {
  return mkdtempSync(join(tmpdir(), 'personal-agent-'));
}

/**
 * Point the soul at a temporary file for one test, restoring the real paths afterwards.
 * @param {import('node:test').TestContext} t
 * @param {string} [content] - The soul's content, or nothing for a missing soul.
 * @returns {string} The temporary soul path.
 */
export function useSoul(t, content) {
  const { soulPath, templatePath } = soulFiles;
  t.after(() => {
    soulFiles.soulPath = soulPath;
    soulFiles.templatePath = templatePath;
  });
  const path = join(tempDir(), 'soul.md');
  if (content !== undefined) {
    writeFileSync(path, content);
  }
  soulFiles.soulPath = path;
  return path;
}

/**
 * A stand-in for the SDK's `query` that calls `toolNames` and then replies `text`.
 * @param {string} text
 * @param {string[]} [toolNames]
 * @param {string} [sessionId]
 */
export function answer(text, toolNames = [], sessionId = 'session-1') {
  return async function* () {
    yield {
      type: 'assistant',
      message: {
        content: toolNames.map((name) => ({ type: 'tool_use', name })),
      },
    };
    yield { type: 'result', subtype: 'success', result: text, session_id: sessionId };
  };
}

/**
 * @param {string[]} allowedTools
 * @param {string} server
 * @returns {string[]}
 */
export function allowedOn(allowedTools, server) {
  const prefix = `mcp__${server}__`;
  return allowedTools.filter((name) => name.startsWith(prefix)).map((name) => name.slice(prefix.length));
}
