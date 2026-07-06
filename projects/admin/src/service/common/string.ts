/**
 * Strip HTML tags and decode entities, keep plain text.
 * Block-level tags (<br>, <p>, <div>, <li>, <h1>-<h6>) become newlines.
 */
export const stripHtml = (text: string): string => {
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|li|h[1-6])[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};
