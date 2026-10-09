const sanitizeHtml = require('sanitize-html');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Parents render this HTML, so it is whitelisted on the server. Anything not listed here is dropped.
// Images never carry a src: they carry data-asset-id and get a fresh signed URL at read time.
const OPTIONS = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup',
    'blockquote', 'code', 'pre', 'ul', 'ol', 'li', 'a', 'img',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  allowedAttributes: {
    a: ['href', 'title'],
    img: ['data-asset-id', 'alt'],
    th: ['colspan', 'rowspan'],
    td: ['colspan', 'rowspan'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesAppliedToAttributes: ['href'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer nofollow', target: '_blank' }),
  },
  exclusiveFilter: (frame) => frame.tag === 'img' && !UUID_RE.test(frame.attribs['data-asset-id'] || ''),
};

function sanitizeNoteHtml(html) {
  return sanitizeHtml(String(html || ''), OPTIONS);
}

function htmlToText(html) {
  const text = sanitizeHtml(String(html || ''), { allowedTags: [], allowedAttributes: {} });
  return text
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20000);
}

function extractAssetIds(html) {
  const ids = new Set();
  const re = /data-asset-id="([0-9a-f-]{36})"/gi;
  let m;
  while ((m = re.exec(String(html || '')))) ids.add(m[1].toLowerCase());
  return [...ids];
}

const escapeAttr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

// Adds a src to every <img data-asset-id> using urlMap; images without a URL are removed.
function injectSignedImages(html, urlMap) {
  return String(html || '').replace(/<img\b([^>]*?)data-asset-id="([0-9a-fA-F-]{36})"([^>]*)>/g, (all, pre, id, post) => {
    const url = urlMap[id] || urlMap[id.toLowerCase()];
    return url ? `<img src="${escapeAttr(url)}"${pre}data-asset-id="${id}"${post}>` : '';
  });
}

module.exports = { sanitizeNoteHtml, htmlToText, extractAssetIds, injectSignedImages };