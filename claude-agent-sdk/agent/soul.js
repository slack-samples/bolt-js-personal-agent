import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const TEMPLATE_MARKER = '<!-- soul-template -->';

export const FALLBACK_TEMPLATE = `${TEMPLATE_MARKER}\n# Soul\n\n## Identity\n\n## About me\n\n## Goals\n`;

export const soulFiles = {
  soulPath: fileURLToPath(new URL('../soul.md', import.meta.url)),
  templatePath: fileURLToPath(new URL('../soul.template.md', import.meta.url)),
};

/**
 * @param {string} [path]
 * @returns {string}
 */
export function loadSoul(path = soulFiles.soulPath) {
  try {
    return readFileSync(path, 'utf-8');
  } catch {}
  try {
    return readFileSync(soulFiles.templatePath, 'utf-8');
  } catch {
    return FALLBACK_TEMPLATE;
  }
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
  return text.includes(TEMPLATE_MARKER);
}
