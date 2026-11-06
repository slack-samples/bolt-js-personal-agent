import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, it, mock } from 'node:test';

import { AgentDeps } from '../../agent/deps.js';
import { isTemplate, loadSoul, SOUL_PATH, saveSoul, TEMPLATE_PATH } from '../../agent/soul.js';
import { updateSoul } from '../../agent/tools/index.js';
import { invoke } from '../helpers.js';

/** @param {import('node:test').TestContext} t */
function tmpDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'soul-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

describe('soul', () => {
  it('falls back to the template when SOUL.md is missing', (t) => {
    const result = loadSoul(path.join(tmpDir(t), 'SOUL.md'));
    assert.ok(result.includes('## Goals'));
    assert.ok(isTemplate(result));
  });

  it('falls back when SOUL.md is unreadable', (t) => {
    const directoryPath = path.join(tmpDir(t), 'SOUL.md');
    fs.mkdirSync(directoryPath);
    const result = loadSoul(directoryPath);
    assert.ok(result.includes('## Goals'));
    assert.ok(isTemplate(result));
  });

  it('round-trips a save and load', (t) => {
    const soulPath = path.join(tmpDir(t), 'SOUL.md');
    const content = '# Soul\n## Goals\nShip it';
    saveSoul(content, soulPath);
    const result = loadSoul(soulPath);
    assert.strictEqual(result, content);
    assert.ok(!isTemplate(result));
  });

  it('falls back inline when the template is unreadable', (t) => {
    const soulPath = path.join(tmpDir(t), 'SOUL.md');
    const original = fs.readFileSync;
    const readFileSync = mock.method(fs, 'readFileSync', (/** @type {any[]} */ ...args) => {
      if (args[0] === TEMPLATE_PATH) {
        throw new Error('ENOENT');
      }
      return original(...args);
    });
    t.after(() => readFileSync.mock.restore());
    const result = loadSoul(soulPath);
    assert.ok(isTemplate(result));
    assert.ok(result.includes('## Goals'));
  });
});

describe('update_soul', () => {
  /** @type {AgentDeps} */
  let deps;
  /** @type {any} */
  let writeFileSync;

  beforeEach((t) => {
    deps = new AgentDeps(/** @type {any} */ ({}), 'U123', 'C123', '1700000000.000100', '1700000000.000100');
    writeFileSync = mock.method(fs, 'writeFileSync', () => {});
    t.after(() => writeFileSync.mock.restore());
  });

  it('is refused for non-owners', async () => {
    deps.isOwner = false;
    deps.isPrivateReply = true;
    const result = await invoke(updateSoul, deps, { markdown: '# Soul\n## Goals\nTest' });
    assert.strictEqual(result, 'Only the owner can change the soul, in a direct message.');
    assert.strictEqual(writeFileSync.mock.callCount(), 0);
  });

  it('is refused in a channel', async () => {
    deps.isOwner = true;
    deps.isPrivateReply = false;
    const result = await invoke(updateSoul, deps, { markdown: '# Soul\n## Goals\nTest' });
    assert.strictEqual(result, 'Only the owner can change the soul, in a direct message.');
    assert.strictEqual(writeFileSync.mock.callCount(), 0);
  });

  it('rejects empty markdown', async () => {
    deps.isOwner = true;
    deps.isPrivateReply = true;
    const result = await invoke(updateSoul, deps, { markdown: '  ' });
    assert.strictEqual(result, "The soul can't be empty.");
    assert.strictEqual(writeFileSync.mock.callCount(), 0);
  });

  it('writes SOUL.md for the owner in a DM', async () => {
    deps.isOwner = true;
    deps.isPrivateReply = true;
    const content = '# Soul\n## Goals\nShip it';
    const result = await invoke(updateSoul, deps, { markdown: content });
    assert.strictEqual(result, 'Saved your soul.');
    assert.deepStrictEqual(writeFileSync.mock.calls[0].arguments, [SOUL_PATH, content]);
  });
});
