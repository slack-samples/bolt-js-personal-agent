import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const FALLBACK_TEMPLATE = '# Soul\n\n## Identity\n\n## About me\n\n## Goals\n';

export const soulFiles = {
  soulPath: fileURLToPath(new URL('../SOUL.md', import.meta.url)),
  templatePath: fileURLToPath(new URL('../SOUL.template.md', import.meta.url)),
};

/**
 * @returns {string}
 */
function loadTemplate() {
  try {
    return readFileSync(soulFiles.templatePath, 'utf-8');
  } catch {
    return FALLBACK_TEMPLATE;
  }
}

/**
 * @param {string} [path]
 * @returns {string}
 */
export function loadSoul(path = soulFiles.soulPath) {
  try {
    return readFileSync(path, 'utf-8');
  } catch {}
  return loadTemplate();
}

/**
 * @param {string} markdown
 * @param {string} [path]
 * @returns {void}
 */
export function saveSoul(markdown, path = soulFiles.soulPath) {
  writeFileSync(path, markdown);
}

/**
 * @param {string} text
 * @returns {boolean}
 */
export function isTemplate(text) {
  return text.trim() === loadTemplate().trim();
}
