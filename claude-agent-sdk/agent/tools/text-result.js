/**
 * @param {string} text
 * @returns {{ content: { type: 'text', text: string }[] }}
 */
export function textResult(text) {
  return { content: [{ type: 'text', text }] };
}
