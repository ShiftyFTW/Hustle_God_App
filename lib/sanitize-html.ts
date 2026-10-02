/**
 * Minimal, dependency-free HTML sanitizer for listing descriptions.
 *
 * Listing description columns are writable through the data API and are also
 * produced by an AI prompt that is itself built from user-editable item
 * fields, so the HTML is untrusted regardless of who wrote it. Anything not
 * needed for a formatted marketplace description is removed.
 */

// Elements removed entirely, including their contents.
const FORBIDDEN_ELEMENTS = [
  'script',
  'style',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'link',
  'meta',
  'base',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
  'svg',
  'math',
  'template',
  'noscript',
];

// Tags allowed to survive; every other tag is unwrapped (contents kept).
const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr', 'div', 'span',
  'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'small', 'sub', 'sup',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'pre', 'code',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  'a', 'img',
]);

// Attributes allowed, per tag. Nothing else survives — in particular no
// event handlers and no style.
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'title']),
  img: new Set(['src', 'alt', 'title', 'width', 'height']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan']),
};

/** Only http(s) and protocol-relative URLs may appear in href/src. */
function isSafeUrl(value: string): boolean {
  const trimmed = value.trim().replace(/[\u0000-\u001f\u007f-\u009f]/g, '');
  if (trimmed.startsWith('//')) return true;
  if (trimmed.startsWith('/') || trimmed.startsWith('#')) return true;
  return /^https?:\/\//i.test(trimmed);
}

function sanitizeAttributes(tag: string, attrString: string): string {
  const allowed = ALLOWED_ATTRS[tag];
  if (!allowed || !attrString.trim()) return '';

  const out: string[] = [];
  const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match: RegExpExecArray | null;

  while ((match = attrRe.exec(attrString)) !== null) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? '';

    // Belt and braces: never let an event handler or style through even if
    // it were somehow added to an allowlist.
    if (name.startsWith('on') || name === 'style' || name === 'srcdoc') continue;
    if (!allowed.has(name)) continue;
    if ((name === 'href' || name === 'src') && !isSafeUrl(value)) continue;

    out.push(`${name}="${value.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}"`);
  }

  return out.length ? ' ' + out.join(' ') : '';
}

export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return '';
  let html = String(input);

  // Drop comments (can hide conditional-comment script in some engines).
  html = html.replace(/<!--[\s\S]*?-->/g, '');

  // Drop forbidden elements together with their contents, then any
  // leftover self-closing or unpaired forms of the same tags.
  for (const tag of FORBIDDEN_ELEMENTS) {
    html = html.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), '');
    html = html.replace(new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi'), '');
  }

  // Rebuild every remaining tag from the allowlist.
  html = html.replace(
    /<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g,
    (_full, closing: string, rawTag: string, rawAttrs: string) => {
      const tag = rawTag.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) return '';
      if (closing) return `</${tag}>`;
      if (tag === 'br' || tag === 'hr' || tag === 'img') {
        return `<${tag}${sanitizeAttributes(tag, rawAttrs)} />`;
      }
      return `<${tag}${sanitizeAttributes(tag, rawAttrs)}>`;
    }
  );

  // Any stray angle bracket that is not part of a rebuilt tag is escaped.
  html = html.replace(/<(?![a-zA-Z/])/g, '&lt;');

  return html;
}
