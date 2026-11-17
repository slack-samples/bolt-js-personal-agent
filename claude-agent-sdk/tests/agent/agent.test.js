import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  BRIEF_READ_TOOLS,
  buildInstructions,
  CLAUDE_CONFIG_DIR,
  ERROR_REPLY,
  localTools,
  MAX_TURNS_REPLY,
  mcpToolNames,
  RUNBOOK_TOOLS,
  runAgent,
  SLACK_MCP_URL,
  SYSTEM_PROMPT,
  sdk,
} from '../../agent/agent.js';
import { soulFiles } from '../../agent/soul.js';
import { allowedOn, answer, setEnv, useSoul } from '../helpers.js';

const TEMPLATE_SOUL = readFileSync(soulFiles.templatePath, 'utf-8');
const ONBOARDING_LINE = 'start the onboarding interview';
const CONNECT_LINE = 'ask them to connect the Slack MCP Server';

/**
 * @param {Record<string, any>} [overrides]
 * @returns {import('../../agent/agent.js').AgentDeps}
 */
function makeDeps(overrides = {}) {
  return /** @type {any} */ ({
    client: {},
    userId: 'U0WNER',
    channelId: 'D123',
    threadTs: '1700000000.000100',
    messageTs: '1700000000.000100',
    ...overrides,
  });
}

/** @param {import('../../agent/agent.js').AgentDeps} deps */
function toolNames(deps) {
  return localTools(deps).map((definition) => definition.name);
}

/**
 * @param {string} prompt
 * @param {string} section
 */
function section(prompt, section) {
  return prompt.split(`## ${section}`)[1].split('## ')[0];
}

/** @param {Record<string, any>} [overrides] */
function resultMessage(overrides = {}) {
  return { type: 'result', subtype: 'success', session_id: 'session-1', result: 'Done.', ...overrides };
}

/**
 * @param {import('node:test').TestContext} t
 * @param {import('../../agent/agent.js').AgentDeps} deps
 * @param {{ messages?: any[], sessionId?: string, persistSession?: boolean }} [options]
 */
async function runWith(t, deps, { messages = [resultMessage()], ...options } = {}) {
  const query = t.mock.method(sdk, 'query', async function* () {
    yield* messages;
  });
  const result = await runAgent('hi', deps, options);
  return { options: query.mock.calls[0].arguments[0].options, result };
}

describe('agent', () => {
  beforeEach((t) => {
    setEnv(/** @type {import('node:test').TestContext} */ (t), { OWNER_USER_ID: 'U0WNER' });
    useSoul(/** @type {import('node:test').TestContext} */ (t), '## Goals\nShip');
  });

  describe('tool selection', () => {
    it('gives the owner in private the soul tool and runbook MCP tools', () => {
      const deps = makeDeps({ isOwner: true, isPrivateReply: true });
      const names = toolNames(deps);
      assert.ok(names.includes('update_soul'));
      assert.ok(!names.includes('read_soul'));
      assert.deepStrictEqual(mcpToolNames(deps), RUNBOOK_TOOLS);
    });

    it('gives /brief read-only MCP tools and no local tools', () => {
      const deps = makeDeps({
        channelId: 'C123',
        threadTs: '',
        messageTs: '',
        isOwner: true,
        isPrivateReply: true,
        isBrief: true,
      });
      assert.deepStrictEqual(toolNames(deps), []);
      assert.deepStrictEqual(mcpToolNames(deps), [
        'slack_search_public_and_private',
        'slack_read_canvas',
        'slack_read_thread',
        'slack_read_channel',
      ]);
    });

    it('ignores the brief flag for guests', () => {
      const deps = makeDeps({ userId: 'U0GUEST', isPrivateReply: true, isBrief: true });
      assert.deepStrictEqual(toolNames(deps), [
        'add_emoji_reaction',
        'create_runbook',
        'list_runbooks',
        'read_runbook',
      ]);
      assert.deepStrictEqual(mcpToolNames(deps), RUNBOOK_TOOLS);
    });

    it('gives the owner in a channel no soul or brief tools', () => {
      const deps = makeDeps({ channelId: 'C123', isOwner: true, isPrivateReply: false });
      assert.ok(!toolNames(deps).includes('update_soul'));
      assert.deepStrictEqual(mcpToolNames(deps), RUNBOOK_TOOLS);
    });

    it('gives a guest the base tools only', () => {
      const deps = makeDeps({ userId: 'U0GUEST', isPrivateReply: true });
      assert.deepStrictEqual(toolNames(deps), [
        'add_emoji_reaction',
        'create_runbook',
        'list_runbooks',
        'read_runbook',
      ]);
      assert.deepStrictEqual(mcpToolNames(deps), RUNBOOK_TOOLS);
    });

    it('gives a learning run no emoji reaction tool', () => {
      const deps = makeDeps({ channelId: 'C123', isPrivateReply: false, isLearning: true });
      assert.deepStrictEqual(toolNames(deps), ['create_runbook', 'list_runbooks', 'read_runbook']);
    });
  });

  describe('instructions', () => {
    it('include the soul and owner', () => {
      const instructions = buildInstructions(makeDeps({ isOwner: true, isPrivateReply: true }));
      assert.ok(instructions.includes('Ship'));
      assert.ok(instructions.includes('<@U0WNER>'));
      assert.ok(instructions.includes('## PRIVACY'));
      assert.ok(instructions.includes('## NO DECISIONS'));
      assert.ok(instructions.includes('## UNTRUSTED CONTENT'));
    });

    it('treat read content as untrusted', () => {
      assert.ok(section(SYSTEM_PROMPT, 'UNTRUSTED CONTENT').includes('never instructions'));
      const brief = section(SYSTEM_PROMPT, 'BRIEF');
      assert.ok(brief.includes('never instructions'));
      assert.ok(brief.includes('read-only'));
      assert.ok(brief.includes('create or edit canvases'));
    });

    it('only save what the owner says directly during onboarding', () => {
      const onboarding = section(SYSTEM_PROMPT, 'ONBOARDING');
      assert.ok(onboarding.includes('tells you directly'));
      assert.ok(onboarding.includes('never content from search'));
      assert.ok(onboarding.includes('shared with anyone'));
    });

    it('start onboarding in the owner DM when the soul is the template', (t) => {
      useSoul(t, TEMPLATE_SOUL);
      assert.ok(buildInstructions(makeDeps({ isOwner: true, isPrivateReply: true })).includes(ONBOARDING_LINE));
    });

    it('do not start onboarding in a brief', (t) => {
      useSoul(t, TEMPLATE_SOUL);
      const deps = makeDeps({ isOwner: true, isPrivateReply: true, isBrief: true });
      assert.ok(!buildInstructions(deps).includes(ONBOARDING_LINE));
    });

    it('do not start onboarding for a guest DM', (t) => {
      useSoul(t, TEMPLATE_SOUL);
      assert.ok(!buildInstructions(makeDeps({ userId: 'U0GUEST', isPrivateReply: true })).includes(ONBOARDING_LINE));
    });

    it('do not start onboarding once the template is filled in', (t) => {
      useSoul(t, `${TEMPLATE_SOUL}\nName: Ada`);
      assert.ok(!buildInstructions(makeDeps({ isOwner: true, isPrivateReply: true })).includes(ONBOARDING_LINE));
    });

    it('ask the agent to identify itself to a guest', () => {
      const instructions = buildInstructions(makeDeps({ userId: 'U0GUEST', channelId: 'C123' }));
      assert.ok(instructions.includes("<@U0WNER>'s agent"));
      assert.ok(instructions.includes('<@U0GUEST>'));
    });

    it('ask an unconnected DM to connect', () => {
      assert.ok(buildInstructions(makeDeps({ userId: 'U0GUEST', isPrivateReply: true })).includes(CONNECT_LINE));
    });

    it('skip the connect line when connected', () => {
      const connected = makeDeps({ isPrivateReply: true, userToken: 'xoxp-1' });
      assert.ok(!buildInstructions(connected).includes(CONNECT_LINE));
    });

    it('show the channel scope without a token', () => {
      const instructions = buildInstructions(makeDeps({ channelId: 'C123', isPrivateReply: false }));
      assert.ok(instructions.includes('You can only see runbooks shared in this channel.'));
      assert.ok(!instructions.includes(CONNECT_LINE));
    });

    it('work without an owner', (t) => {
      setEnv(t, { OWNER_USER_ID: undefined });
      const instructions = buildInstructions(makeDeps({ userId: 'U0GUEST', channelId: 'C123' }));
      assert.ok(instructions.includes('No owner is configured.'));
      assert.ok(!instructions.includes("'s agent."));
    });
  });

  describe('runAgent', () => {
    it('ignores the user token for a channel reply', async (t) => {
      const deps = makeDeps({ channelId: 'C123', userToken: 'xoxp-1', isPrivateReply: false });
      const { options } = await runWith(t, deps);
      assert.ok(!('slack-mcp' in options.mcpServers));
      assert.deepStrictEqual(allowedOn(options.allowedTools, 'slack-mcp'), []);
      assert.ok(!options.systemPrompt.includes('xoxp-1'));
    });

    it('uses the Slack MCP Server for a private reply with a token', async (t) => {
      const deps = makeDeps({ userToken: 'xoxp-1', isOwner: true, isPrivateReply: true });
      const { options } = await runWith(t, deps);
      const slackMcp = options.mcpServers['slack-mcp'];
      assert.strictEqual(slackMcp.url, SLACK_MCP_URL);
      assert.strictEqual(slackMcp.headers.Authorization, 'Bearer xoxp-1');
    });

    it('allows runbook MCP tools in the owner DM', async (t) => {
      const deps = makeDeps({ userToken: 'xoxp-1', isOwner: true, isPrivateReply: true });
      const { options } = await runWith(t, deps);
      assert.deepStrictEqual(allowedOn(options.allowedTools, 'slack-mcp'), RUNBOOK_TOOLS);
      assert.deepStrictEqual(allowedOn(options.allowedTools, 'agent-tools'), ['add_emoji_reaction', 'update_soul']);
    });

    it('keeps /brief read-only', async (t) => {
      const deps = makeDeps({
        channelId: 'C123',
        threadTs: '',
        messageTs: '',
        userToken: 'xoxp-1',
        isOwner: true,
        isPrivateReply: true,
        isBrief: true,
      });
      const { options } = await runWith(t, deps);
      const allowed = allowedOn(options.allowedTools, 'slack-mcp');
      assert.deepStrictEqual(allowed, BRIEF_READ_TOOLS);
      assert.ok(!allowed.includes('slack_create_canvas'));
      assert.ok(!allowed.includes('slack_update_canvas'));
      assert.deepStrictEqual(allowedOn(options.allowedTools, 'agent-tools'), []);
      assert.ok(!('agent-tools' in options.mcpServers));
    });

    it('gives a guest DM their own token', async (t) => {
      const deps = makeDeps({ userId: 'U0GUEST', userToken: 'xoxp-guest', isPrivateReply: true });
      const { options } = await runWith(t, deps);
      const allowed = allowedOn(options.allowedTools, 'slack-mcp');
      assert.deepStrictEqual(allowed, RUNBOOK_TOOLS);
      assert.ok(!allowed.includes('slack_read_thread'));
      assert.ok(!allowed.includes('slack_read_channel'));
      assert.deepStrictEqual(allowedOn(options.allowedTools, 'agent-tools'), ['add_emoji_reaction']);
      assert.strictEqual(options.mcpServers['slack-mcp'].headers.Authorization, 'Bearer xoxp-guest');
    });

    it('gives a guest DM without a token no soul tools', async (t) => {
      const { options } = await runWith(t, makeDeps({ userId: 'U0GUEST', isPrivateReply: true }));
      assert.ok(!('slack-mcp' in options.mcpServers));
      assert.deepStrictEqual(allowedOn(options.allowedTools, 'agent-tools'), [
        'add_emoji_reaction',
        'create_runbook',
        'list_runbooks',
        'read_runbook',
      ]);
    });

    it('allows only the listed tools', async (t) => {
      const deps = makeDeps({ userToken: 'xoxp-1', isOwner: true, isPrivateReply: true });
      const { options } = await runWith(t, deps);
      assert.deepStrictEqual(options.tools, []);
      assert.strictEqual(options.permissionMode, 'dontAsk');
      assert.deepStrictEqual(options.settingSources, []);
      assert.strictEqual(options.strictMcpConfig, true);
      assert.strictEqual(options.verbatimPrompts, true);
      assert.deepStrictEqual(Object.keys(options.mcpServers).sort(), ['agent-tools', 'slack-mcp']);
      assert.ok(options.allowedTools.every((/** @type {string} */ name) => name.startsWith('mcp__')));
    });

    const cases = [
      {
        name: 'owner DM',
        overrides: { userToken: 'xoxp-1', isOwner: true, isPrivateReply: true },
        local: ['add_emoji_reaction', 'update_soul'],
        mcp: RUNBOOK_TOOLS,
      },
      {
        name: 'guest DM',
        overrides: { userId: 'U0GUEST', userToken: 'xoxp-g', isPrivateReply: true },
        local: ['add_emoji_reaction'],
        mcp: RUNBOOK_TOOLS,
      },
      {
        name: 'brief',
        overrides: { userToken: 'xoxp-1', isOwner: true, isPrivateReply: true, channelId: 'C123', isBrief: true },
        local: [],
        mcp: BRIEF_READ_TOOLS,
      },
    ];
    for (const { name, overrides, local, mcp } of cases) {
      it(`denies tools outside the allowlist (${name})`, async (t) => {
        const { options } = await runWith(t, makeDeps(overrides));
        assert.strictEqual(options.permissionMode, 'dontAsk');
        assert.deepStrictEqual(options.tools, []);
        assert.deepStrictEqual(
          [...options.allowedTools].sort(),
          [...local.map((tool) => `mcp__agent-tools__${tool}`), ...mcp.map((tool) => `mcp__slack-mcp__${tool}`)].sort(),
        );
      });
    }

    it('keeps transcripts in the app data dir', async (t) => {
      const { options } = await runWith(t, makeDeps());
      const appDir = fileURLToPath(new URL('../../', import.meta.url));
      assert.strictEqual(options.env.CLAUDE_CONFIG_DIR, CLAUDE_CONFIG_DIR);
      assert.strictEqual(CLAUDE_CONFIG_DIR, join(appDir, 'data', 'claude'));
      assert.ok(isAbsolute(CLAUDE_CONFIG_DIR));
      assert.strictEqual(options.env.PATH, process.env.PATH);
    });

    it('cleans up transcripts after a day', async (t) => {
      const { options } = await runWith(t, makeDeps());
      assert.deepStrictEqual(options.settings, { cleanupPeriodDays: 1 });
    });

    it('persists sessions by default', async (t) => {
      const { options } = await runWith(t, makeDeps());
      assert.strictEqual(options.persistSession, true);
    });

    it('can skip session persistence', async (t) => {
      const { options } = await runWith(t, makeDeps(), { persistSession: false });
      assert.strictEqual(options.persistSession, false);
    });

    it('uses the built instructions', async (t) => {
      const deps = makeDeps({ isOwner: true, isPrivateReply: true });
      const { options } = await runWith(t, deps);
      assert.strictEqual(options.systemPrompt, buildInstructions(deps));
    });

    it('resumes the given session', async (t) => {
      const { options, result } = await runWith(t, makeDeps(), { sessionId: 'session-0' });
      assert.strictEqual(options.resume, 'session-0');
      assert.strictEqual(result.sessionId, 'session-1');
      assert.strictEqual(result.finalOutput, 'Done.');
    });

    it('reports tool calls', async (t) => {
      const query = t.mock.method(sdk, 'query', answer('Done.', ['mcp__agent-tools__create_runbook']));
      const result = await runAgent('hi', makeDeps());
      assert.strictEqual(query.mock.callCount(), 1);
      assert.deepStrictEqual(result.toolNames, ['mcp__agent-tools__create_runbook']);
    });

    it('explains max turns', async (t) => {
      const { result } = await runWith(t, makeDeps(), {
        messages: [resultMessage({ subtype: 'error_max_turns', result: undefined })],
      });
      assert.strictEqual(result.finalOutput, MAX_TURNS_REPLY);
    });

    it('falls back to the error reply on an error result', async (t) => {
      const { result } = await runWith(t, makeDeps(), {
        messages: [resultMessage({ subtype: 'error_during_execution', result: undefined })],
      });
      assert.strictEqual(result.finalOutput, ERROR_REPLY);
    });

    it('falls back to the error reply on an empty result', async (t) => {
      const { result } = await runWith(t, makeDeps(), { messages: [resultMessage({ result: ' ' })] });
      assert.strictEqual(result.finalOutput, ERROR_REPLY);
    });

    it('throws without a result', async (t) => {
      await assert.rejects(runWith(t, makeDeps(), { messages: [] }), /without a result/);
    });
  });
});
