import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const TEMPLATE_MARKER = '<!-- soul-template -->';

export const SOUL_PATH = fileURLToPath(new URL('../SOUL.md', import.meta.url));
export const TEMPLATE_PATH = fileURLToPath(new URL('../SOUL.template.md', import.meta.url));

const FALLBACK_TEMPLATE = `${TEMPLATE_MARKER}\n# Soul\n\n## Identity\n\n## About me\n\n## Goals\n`;

/**
 * @param {string} [path]
 * @returns {string}
 */
export function loadSoul(path = SOUL_PATH) {
  try {
    return fs.readFileSync(path, 'utf-8');
  } catch {}
  try {
    return fs.readFileSync(TEMPLATE_PATH, 'utf-8');
  } catch {
    return FALLBACK_TEMPLATE;
  }
}

/**
 * @param {string} markdown
 * @param {string} [path]
 * @returns {void}
 */
export function saveSoul(markdown, path = SOUL_PATH) {
  fs.writeFileSync(path, markdown);
}

/**
 * @param {string} text
 * @returns {boolean}
 */
export function isTemplate(text) {
  return text.includes(TEMPLATE_MARKER);
}
