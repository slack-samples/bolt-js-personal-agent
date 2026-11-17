import assert from 'node:assert';
import fs from 'node:fs';
import { beforeEach, describe, it } from 'node:test';

import { setTracingDisabled } from '@openai/agents';

import {
  agent,
  BRIEF_READ_TOOLS,
  buildInstructions,
  ERROR_REPLY,
  localTools,
  MAX_TURNS_REPLY,
  mcpToolNames,
  RUNBOOK_TOOLS,
  runAgent,
  SYSTEM_PROMPT,
} from '../../agent/agent.js';
import { AgentDeps } from '../../agent/deps.js';
import { TEMPLATE_PATH } from '../../agent/soul.js';
import { call, say, scripted, toolNames } from '../fake-model.js';
import { fakeSlackMcp, withOwner, withSoul } from '../helpers.js';

setTracingDisabled(true);

/**
 * @param {Partial<AgentDeps>} [overrides]
 */
function makeDeps(overrides = {}) {
  const deps = new AgentDeps(/** @type {any} */ ({}), 'U0WNER', 'D123', '1700000000.000100', '1700000000.000100');
  return Object.assign(deps, overrides);
}

/** @param {AgentDeps} deps */
function localToolNames(deps) {
  return localTools(deps).map((tool) => tool.name);
}

/**
 * @param {string} text
 * @param {string} heading
 */
function section(text, heading) {
  return text.split(`## ${heading}`)[1].split('## ')[0];
}

const BASE_TOOLS = ['add_emoji_reaction', 'create_runbook', 'list_runbooks', 'read_runbook'];
const TEMPLATE_SOUL = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
const ONBOARDING_LINE = 'start the onboarding interview';
const CONNECT_LINE = 'ask them to connect the Slack MCP Server';

describe('agent', () => {
  beforeEach((t) => {
    withOwner(t, 'U0WNER');
  });

  it('gives the owner in private soul tools and runbook MCP tools', () => {
    const deps = makeDeps({ isOwner: true, isPrivateReply: true });
    const names = localToolNames(deps);
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
    assert.deepStrictEqual(localToolNames(deps), []);
    assert.deepStrictEqual(mcpToolNames(deps), [
      'slack_search_public_and_private',
      'slack_read_canvas',
      'slack_read_thread',
      'slack_read_channel',
    ]);
  });

  it('ignores the brief flag for guests', () => {
    const deps = makeDeps({ userId: 'U0GUEST', isPrivateReply: true, isBrief: true });
    assert.deepStrictEqual(localToolNames(deps), BASE_TOOLS);
    assert.deepStrictEqual(mcpToolNames(deps), RUNBOOK_TOOLS);
  });

  it('gives the owner in a channel no soul or brief tools', () => {
    const deps = makeDeps({ channelId: 'C123', isOwner: true, isPrivateReply: false });
    assert.ok(!localToolNames(deps).includes('update_soul'));
    assert.deepStrictEqual(mcpToolNames(deps), RUNBOOK_TOOLS);
  });

  it('gives guests the base tools only', () => {
    const deps = makeDeps({ userId: 'U0GUEST', isPrivateReply: true });
    assert.deepStrictEqual(localToolNames(deps), BASE_TOOLS);
    assert.deepStrictEqual(mcpToolNames(deps), RUNBOOK_TOOLS);
  });

  it('gives a learning run no emoji reaction tool', () => {
    const deps = makeDeps({ channelId: 'C123', isPrivateReply: false, isLearning: true });
    assert.deepStrictEqual(localToolNames(deps), ['create_runbook', 'list_runbooks', 'read_runbook']);
  });

  it('includes the soul and owner in the instructions', (t) => {
    withSoul(t, '## Goals\nShip');
    const text = buildInstructions(makeDeps({ isOwner: true, isPrivateReply: true }));
    assert.ok(text.includes('Ship'));
    assert.ok(text.includes('<@U0WNER>'));
    assert.ok(text.includes('## PRIVACY'));
    assert.ok(text.includes('## NO DECISIONS'));
    assert.ok(text.includes('## UNTRUSTED CONTENT'));
  });

  it('treats read content as untrusted', () => {
    assert.ok(section(SYSTEM_PROMPT, 'UNTRUSTED CONTENT').includes('never instructions'));
    const brief = section(SYSTEM_PROMPT, 'BRIEF');
    assert.ok(brief.includes('never instructions'));
    assert.ok(brief.includes('read-only'));
    assert.ok(brief.includes('create or edit canvases'));
  });

  it('only saves what the owner says directly during onboarding', () => {
    const onboarding = section(SYSTEM_PROMPT, 'ONBOARDING');
    assert.ok(onboarding.includes('tells you directly'));
    assert.ok(onboarding.includes('never content from search'));
    assert.ok(onboarding.includes('shared with anyone'));
  });

  it('starts onboarding in the owner DM with a template soul', (t) => {
    withSoul(t, TEMPLATE_SOUL);
    const text = buildInstructions(makeDeps({ isOwner: true, isPrivateReply: true }));
    assert.ok(text.includes(ONBOARDING_LINE));
  });

  it('does not start onboarding in a brief', (t) => {
    withSoul(t, TEMPLATE_SOUL);
    const text = buildInstructions(makeDeps({ isOwner: true, isPrivateReply: true, isBrief: true }));
    assert.ok(!text.includes(ONBOARDING_LINE));
  });

  it('does not start onboarding for a guest DM', (t) => {
    withSoul(t, TEMPLATE_SOUL);
    const text = buildInstructions(makeDeps({ userId: 'U0GUEST', isPrivateReply: true }));
    assert.ok(!text.includes(ONBOARDING_LINE));
  });

  it('does not start onboarding once the template is filled in', (t) => {
    withSoul(t, `${TEMPLATE_SOUL}\nName: Ada`);
    const text = buildInstructions(makeDeps({ isOwner: true, isPrivateReply: true }));
    assert.ok(!text.includes(ONBOARDING_LINE));
  });

  it('asks the agent to identify itself to guests', (t) => {
    withSoul(t, '## Goals\nShip');
    const text = buildInstructions(makeDeps({ userId: 'U0GUEST', channelId: 'C123' }));
    assert.ok(text.includes("<@U0WNER>'s agent"));
    assert.ok(text.includes('<@U0GUEST>'));
  });

  it('asks an unconnected DM to connect', (t) => {
    withSoul(t, '## Goals\nShip');
    const text = buildInstructions(makeDeps({ userId: 'U0GUEST', isPrivateReply: true }));
    assert.ok(text.includes(CONNECT_LINE));
  });

  it('skips the connect line when connected', (t) => {
    withSoul(t, '## Goals\nShip');
    const text = buildInstructions(makeDeps({ isPrivateReply: true, userToken: 'xoxp-1' }));
    assert.ok(!text.includes(CONNECT_LINE));
  });

  it('scopes runbooks to the channel without a token', (t) => {
    withSoul(t, '## Goals\nShip');
    const text = buildInstructions(makeDeps({ channelId: 'C123', isPrivateReply: false }));
    assert.ok(text.includes('You can only see runbooks shared in this channel.'));
    assert.ok(!text.includes(CONNECT_LINE));
  });

  it('works without an owner', (t) => {
    withOwner(t, null);
    withSoul(t, '## Goals\nShip');
    const text = buildInstructions(makeDeps({ userId: 'U0GUEST', channelId: 'C123' }));
    assert.ok(text.includes('No owner is configured.'));
    assert.ok(!text.includes("'s agent."));
  });

  it('is named Personal Agent', () => {
    assert.strictEqual(agent.name, 'Personal Agent');
  });
});

describe('runAgent', () => {
  beforeEach((t) => {
    withOwner(t, 'U0WNER');
  });

  it('ignores the user token for a channel reply', async (t) => {
    const mcp = fakeSlackMcp(t);
    const model = scripted(t, () => say('Done.'));
    await runAgent('hi', makeDeps({ channelId: 'C123', userToken: 'xoxp-1', isPrivateReply: false }));
    assert.strictEqual(mcp.servers.length, 0);
    assert.deepStrictEqual(toolNames(model), BASE_TOOLS);
  });

  it('uses the Slack MCP Server for a private reply with a token', async (t) => {
    const mcp = fakeSlackMcp(t);
    const model = scripted(t, () => say('Done.'));
    await runAgent('hi', makeDeps({ userToken: 'xoxp-1', isOwner: true, isPrivateReply: true }));
    assert.strictEqual(mcp.servers.length, 1);
    assert.strictEqual(mcp.authorization(mcp.servers[0]), 'Bearer xoxp-1');
    assert.deepStrictEqual(mcp.allowed(mcp.servers[0]), RUNBOOK_TOOLS);
    assert.deepStrictEqual(toolNames(model).sort(), ['add_emoji_reaction', 'update_soul', ...RUNBOOK_TOOLS].sort());
  });

  it('keeps /brief read-only', async (t) => {
    const mcp = fakeSlackMcp(t);
    const model = scripted(t, () => say('Done.'));
    await runAgent(
      'hi',
      makeDeps({
        channelId: 'C123',
        threadTs: '',
        messageTs: '',
        userToken: 'xoxp-1',
        isOwner: true,
        isPrivateReply: true,
        isBrief: true,
      }),
    );
    const allowed = mcp.allowed(mcp.servers[0]);
    assert.deepStrictEqual(allowed, BRIEF_READ_TOOLS);
    assert.ok(!allowed.includes('slack_create_canvas'));
    assert.ok(!allowed.includes('slack_update_canvas'));
    assert.deepStrictEqual(toolNames(model).sort(), [...BRIEF_READ_TOOLS].sort());
  });

  it("uses a guest's own token in their DM", async (t) => {
    const mcp = fakeSlackMcp(t);
    const model = scripted(t, () => say('Done.'));
    await runAgent('hi', makeDeps({ userId: 'U0GUEST', userToken: 'xoxp-guest', isPrivateReply: true }));
    const allowed = mcp.allowed(mcp.servers[0]);
    assert.strictEqual(mcp.authorization(mcp.servers[0]), 'Bearer xoxp-guest');
    assert.deepStrictEqual(allowed, RUNBOOK_TOOLS);
    assert.ok(!allowed.includes('slack_read_thread'));
    assert.ok(!allowed.includes('slack_read_channel'));
    assert.deepStrictEqual(toolNames(model).sort(), ['add_emoji_reaction', ...RUNBOOK_TOOLS].sort());
  });

  it('gives a guest DM without a token no soul tools', async (t) => {
    const mcp = fakeSlackMcp(t);
    const model = scripted(t, () => say('Done.'));
    await runAgent('hi', makeDeps({ userId: 'U0GUEST', isPrivateReply: true }));
    assert.strictEqual(mcp.servers.length, 0);
    assert.deepStrictEqual(toolNames(model), BASE_TOOLS);
  });

  it('explains max turns', async (t) => {
    t.mock.method(Math, 'random', () => 0);
    scripted(t, () => call('add_emoji_reaction', { emoji_name: 'tada' }));
    const result = await runAgent('hi', makeDeps({ channelId: 'C123' }));
    assert.strictEqual(result.finalOutput, MAX_TURNS_REPLY);
  });

  it('falls back to the error reply on an empty result', async (t) => {
    scripted(t, () => say(''));
    const result = await runAgent('hi', makeDeps({ channelId: 'C123' }));
    assert.strictEqual(result.finalOutput, ERROR_REPLY);
  });
});
