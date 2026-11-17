import assert from 'node:assert';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { isTemplate, loadSoul, saveSoul, soulFiles } from '../../agent/soul.js';
import { updateSoul } from '../../agent/tools/index.js';
import { invoke, tempDir, useSoul } from '../helpers.js';

/** @param {Record<string, any>} [overrides] */
function makeDeps(overrides = {}) {
  return {
    client: {},
    userId: 'U123',
    channelId: 'C123',
    threadTs: '1700000000.000100',
    messageTs: '1700000000.000100',
    ...overrides,
  };
}

describe('soul', () => {
  it('loadSoul falls back to the template when missing', () => {
    const result = loadSoul(join(tempDir(), 'SOUL.md'));
    assert.ok(result.includes('## Goals'));
    assert.ok(isTemplate(result));
  });

  it('loadSoul falls back when unreadable', () => {
    const directoryPath = join(tempDir(), 'SOUL.md');
    mkdirSync(directoryPath);
    const result = loadSoul(directoryPath);
    assert.ok(result.includes('## Goals'));
    assert.ok(isTemplate(result));
  });

  it('save then load round trips', () => {
    const path = join(tempDir(), 'SOUL.md');
    const content = '# Soul\n## Goals\nShip it';
    saveSoul(content, path);
    const result = loadSoul(path);
    assert.strictEqual(result, content);
    assert.ok(!isTemplate(result));
  });

  it('treats an unedited copy of the template as the template', () => {
    const path = join(tempDir(), 'SOUL.md');
    saveSoul(`\n${readFileSync(soulFiles.templatePath, 'utf-8')}\n\n`, path);
    assert.ok(isTemplate(loadSoul(path)));
  });

  it('does not treat an edited copy of the template as the template', () => {
    const path = join(tempDir(), 'SOUL.md');
    saveSoul(readFileSync(soulFiles.templatePath, 'utf-8').replace('## Goals', '## Goals\n\nShip it'), path);
    assert.ok(!isTemplate(loadSoul(path)));
  });

  it('loadSoul falls back inline when the template is unreadable', (t) => {
    const path = useSoul(t);
    soulFiles.templatePath = join(tempDir(), 'missing.md');
    const result = loadSoul(path);
    assert.ok(isTemplate(result));
    assert.ok(result.includes('## Goals'));
  });
});

describe('update_soul', () => {
  it('is refused for a non-owner', async (t) => {
    const path = useSoul(t);
    const result = await invoke(updateSoul, makeDeps({ isOwner: false, isPrivateReply: true }), {
      markdown: '# Soul\n## Goals\nTest',
    });
    assert.strictEqual(result, 'Only the owner can change the soul, in a direct message.');
    assert.ok(!existsSync(path));
  });

  it('is refused in a channel', async (t) => {
    const path = useSoul(t);
    const result = await invoke(updateSoul, makeDeps({ isOwner: true, isPrivateReply: false }), {
      markdown: '# Soul\n## Goals\nTest',
    });
    assert.strictEqual(result, 'Only the owner can change the soul, in a direct message.');
    assert.ok(!existsSync(path));
  });

  it('rejects empty markdown', async (t) => {
    const path = useSoul(t);
    const result = await invoke(updateSoul, makeDeps({ isOwner: true, isPrivateReply: true }), { markdown: '  ' });
    assert.strictEqual(result, "The soul can't be empty.");
    assert.ok(!existsSync(path));
  });

  it('writes for the owner in a DM', async (t) => {
    const path = useSoul(t);
    const content = '# Soul\n## Goals\nShip it';
    const result = await invoke(updateSoul, makeDeps({ isOwner: true, isPrivateReply: true }), { markdown: content });
    assert.strictEqual(result, 'Saved your soul.');
    assert.strictEqual(readFileSync(path, 'utf-8'), content);
  });
});
