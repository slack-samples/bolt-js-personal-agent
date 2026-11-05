import assert from 'node:assert';
import { describe, it } from 'node:test';

import { buildAppHomeView } from '../../../listeners/views/app-home-builder.js';

/** @param {import('@slack/types').HomeView} view */
function sectionTexts(view) {
  return view.blocks.filter((b) => b.type === 'section').map((b) => /** @type {any} */ (b).text.text);
}

/** @param {import('@slack/types').HomeView} view */
function contextTexts(view) {
  return view.blocks
    .filter((b) => b.type === 'context')
    .flatMap((b) => /** @type {any} */ (b).elements.map((/** @type {any} */ e) => e.text));
}

describe('buildAppHomeView', () => {
  it('returns a home view', () => {
    const view = buildAppHomeView();
    assert.strictEqual(view.type, 'home');
  });

  it('has a blocks array with header and section', () => {
    const view = buildAppHomeView();
    assert.ok(Array.isArray(view.blocks));
    assert.ok(view.blocks.length >= 3);
    assert.strictEqual(view.blocks[0].type, 'header');
    assert.strictEqual(view.blocks[1].type, 'section');
  });

  it('shows disconnected status with learn-more link by default', () => {
    const mcpText = sectionTexts(buildAppHomeView()).find((t) => t.includes('MCP Server'));
    assert.ok(mcpText);
    assert.ok(mcpText.includes('disconnected'));
    assert.ok(mcpText.includes('Learn how to enable'));
    assert.ok(mcpText.includes('bolt-js-personal-agent'));
  });

  it('shows disconnected status when installUrl is provided', () => {
    const texts = sectionTexts(buildAppHomeView('https://example.com/slack/install'));
    assert.ok(texts.some((t) => t.includes('disconnected')));
  });

  it('shows connected status when isConnected is true', () => {
    const texts = sectionTexts(buildAppHomeView(null, true));
    assert.ok(texts.some((t) => t.includes('connected')));
  });

  it('shows the setup prompt when the soul is the template', () => {
    const soulSection = sectionTexts(buildAppHomeView(null, false, 'template')).find((t) =>
      t.toLowerCase().includes('soul'),
    );
    assert.ok(soulSection);
    assert.ok(soulSection.includes("isn't set up"));
    assert.ok(soulSection.includes(':sparkles:'));
  });

  it('shows the personalized status when the soul is set up', () => {
    const soulSection = sectionTexts(buildAppHomeView(null, false, 'personalized')).find((t) =>
      t.toLowerCase().includes('soul'),
    );
    assert.ok(soulSection);
    assert.ok(soulSection.includes('is set up'));
    assert.ok(soulSection.includes(':white_check_mark:'));
  });

  it('shows no soul status without one', () => {
    const soulSections = sectionTexts(buildAppHomeView(null, false, null)).filter((t) =>
      t.toLowerCase().includes('soul'),
    );
    assert.strictEqual(soulSections.length, 0);
  });

  it('scopes the Slack MCP Server to DMs', () => {
    for (const view of [
      buildAppHomeView(),
      buildAppHomeView('https://example.com/slack/install'),
      buildAppHomeView(null, true),
    ]) {
      const mcpContext = contextTexts(view).find((t) => t.includes('Slack MCP Server'));
      assert.ok(mcpContext);
      assert.ok(mcpContext.includes('only in your DMs with the agent'));
    }
  });
});
