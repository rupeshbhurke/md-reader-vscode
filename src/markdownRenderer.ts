import { Marked, Renderer, TokenizerAndRendererExtension } from 'marked';
import GithubSlugger from 'github-slugger';
import hljs from 'highlight.js';
import katex from 'katex';

// ── Public API ────────────────────────────────────────────────────────────────

export interface RenderedDocument {
  html: string;
  toc: TocEntry[];
  /** True if the document contains at least one ```mermaid fenced block — tells the webview whether it needs to lazy-load mermaid.min.js. */
  hasMermaid: boolean;
  /** Word count of the readable text — code blocks, inline code, image/link syntax, and math are excluded (see countWords()). Reading time is derived from this in reader.js using the configurable mdReader.readingSpeed. */
  wordCount: number;
}

export interface TocEntry {
  level: number;    // 1-3
  text: string;
  id: string;
}

/**
 * Convert raw Markdown text into HTML + a TOC structure.
 *
 * `marked` extensions registered via `.use()` stack additively on an
 * instance and are never un-registered. The single `marked` instance below
 * is configured exactly once at module load — never inside this function —
 * so repeated calls don't leak duplicate renderer/extension registrations.
 *
 * TOC collection uses module-level state (`currentToc` / `slugger`) reset
 * immediately before each `marked.parse()` call. This is safe because a
 * single `parse()` call runs its renderer callbacks synchronously (no
 * `await` interleaves mid-parse), so concurrent `renderMarkdown()` calls
 * for different documents can't interleave their TOC state.
 */
export async function renderMarkdown(markdown: string): Promise<RenderedDocument> {
  currentToc = [];
  slugger.reset();
  sawMermaid = false;
  taskIndex = 0;

  const html = await marked.parse(markdown);

  return { html, toc: currentToc, hasMermaid: sawMermaid, wordCount: countWords(markdown) };
}

/**
 * Word count of the readable text, over the raw markdown source rather than
 * the rendered HTML — cheaper (no DOM/regex-strip pass over generated
 * markup, including KaTeX's fairly verbose output) and avoids counting
 * words inside a code block's syntax-highlighting spans twice.
 */
function countWords(markdown: string): number {
  const readable = markdown
    .replace(/```[\s\S]*?```/g, ' ')          // fenced code blocks
    .replace(/`[^`\n]*`/g, ' ')                // inline code
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')         // block math
    .replace(/\$[^$\n]*\$/g, ' ')              // inline math
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')     // images (alt text isn't "read")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')   // links — keep the link text
    .replace(/^-{3,}$/gm, ' ')                 // hr / front-matter fences
    .replace(/[#>*_~`|]/g, ' ');                // remaining markdown punctuation

  const words = readable.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

// ── Marked instance (configured once) ──────────────────────────────────────────

let currentToc: TocEntry[] = [];
let sawMermaid = false;
/** Sequential index of each task-list checkbox in document order — panelManager.toggleTask() uses this to find the matching `- [ ]` line. */
let taskIndex = 0;
const slugger = new GithubSlugger();

const marked = new Marked({
  renderer: buildRenderer(),
  gfm: true,
  breaks: false,
  extensions: [blockMathExtension(), inlineMathExtension()],
});

// ── Renderer ──────────────────────────────────────────────────────────────────

function buildRenderer() {
  const renderer = new Renderer();

  // Headings — GitHub-style unique anchor ids + TOC collection (levels 1-3),
  // plus a hover-revealed "copy link" button (levels 1-3 only, matching TOC).
  renderer.heading = (text: string, level: number, raw: string): string => {
    const cleaned = raw
      .toLowerCase()
      .trim()
      .replace(/<[!\/a-z].*?>/gi, '');
    const id = slugger.slug(cleaned);

    if (level <= 3) {
      currentToc.push({ level, text: stripHtml(text), id });
    }

    const anchorBtn = level <= 3
      ? ` <a class="heading-anchor" href="#${id}" data-copy-anchor="${id}" aria-label="Copy link to this heading" title="Copy link">#</a>`
      : '';

    return `<h${level} id="${id}">${text}${anchorBtn}</h${level}>\n`;
  };

  // Task-list checkboxes — clickable (not disabled) and tagged with a
  // sequential document-order index so the webview can report back which
  // one was toggled (see panelManager.ts toggleTask()).
  renderer.checkbox = (checked: boolean): string => {
    const index = taskIndex++;
    return `<input type="checkbox" data-task-index="${index}"${checked ? ' checked=""' : ''}>`;
  };

  // Code blocks — syntax highlighting + copy button + language label
  renderer.code = (code: string, language: string | undefined): string => {
    const lang = language || 'plaintext';

    // ```mermaid fences render as diagrams, not highlighted code. The
    // webview lazy-loads mermaid.min.js only when hasMermaid says it's
    // needed; the raw (escaped) source stays in the DOM as a fallback if
    // that load or the diagram parse fails.
    if (lang === 'mermaid') {
      sawMermaid = true;
      return `<pre class="mermaid">${escapeHtml(code)}</pre>`;
    }

    let highlighted: string;
    try {
      highlighted = lang && hljs.getLanguage(lang)
        ? hljs.highlight(code, { language: lang }).value
        : hljs.highlightAuto(code).value;
    } catch {
      highlighted = escapeHtml(code);
    }

    return `
<div class="code-block">
  <div class="code-header">
    <span class="code-lang">${escapeHtml(lang)}</span>
    <button class="copy-btn" aria-label="Copy code" title="Copy to clipboard">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
      </svg>
      Copy
    </button>
  </div>
  <pre><code class="hljs language-${escapeHtml(lang)}">${highlighted}</code></pre>
</div>`;
  };

  // Blockquotes — styled callout
  renderer.blockquote = (quote: string): string => {
    return `<blockquote class="md-blockquote">${quote}</blockquote>\n`;
  };

  // Images — lazy loading + responsive
  renderer.image = (href: string, title: string | null, text: string): string => {
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
    return `<figure class="md-figure">
  <img src="${href}" alt="${escapeHtml(text)}"${titleAttr} loading="lazy" />
  ${text ? `<figcaption>${escapeHtml(text)}</figcaption>` : ''}
</figure>`;
  };

  // Tables — wrapped for horizontal scrolling
  renderer.table = (header: string, body: string): string => {
    return `<div class="table-wrap"><table><thead>${header}</thead><tbody>${body}</tbody></table></div>\n`;
  };

  return renderer;
}

// ── Math (KaTeX) ─────────────────────────────────────────────────────────────
//
// Math is rendered host-side (here) rather than shipping KaTeX's JS to the
// webview: renderToString() produces plain HTML + inline <span> markup, so
// the webview only needs KaTeX's stylesheet (vendored — see
// scripts/copy-vendor-assets.js), not its script. Faster, and avoids adding
// another CSP surface.
//
// Registered as marked TokenizerAndRendererExtensions rather than a regex
// pre-pass over the raw markdown: marked tries custom extension tokenizers
// at each cursor position BEFORE its built-in ones (fenced code, inline
// code), so a fence or code span starting at that position is always
// tokenized whole, first — these tokenizers, anchored with `^`, never get a
// chance to match a `$`/`$$` that's inside one.

/** Block math: `$$` alone on a line, content, `$$` alone on a line. */
function blockMathExtension(): TokenizerAndRendererExtension {
  return {
    name: 'blockMath',
    level: 'block',
    start(src) {
      const i = src.indexOf('$$');
      return i === -1 ? undefined : i;
    },
    tokenizer(src) {
      const match = /^\$\$[ \t]*\n([\s\S]+?)\n\$\$(?:\n|$)/.exec(src);
      if (!match) { return undefined; }
      return { type: 'blockMath', raw: match[0], text: match[1].trim() };
    },
    renderer(token) {
      return renderMath(token.text as string, true);
    },
  };
}

/**
 * Inline math: `$...$`, single line, no space directly inside the
 * delimiters (so "costs $5 and $10" doesn't get misread as math) and no
 * digit immediately after the closing `$`. `\$` escapes a literal dollar.
 */
function inlineMathExtension(): TokenizerAndRendererExtension {
  return {
    name: 'inlineMath',
    level: 'inline',
    start(src) {
      const i = src.indexOf('$');
      return i === -1 ? undefined : i;
    },
    tokenizer(src) {
      const match = /^\$(?!\s)((?:\\\$|[^\n$])+?)(?<!\\|\s)\$(?!\d)/.exec(src);
      if (!match) { return undefined; }
      return { type: 'inlineMath', raw: match[0], text: match[1].replace(/\\\$/g, '$') };
    },
    renderer(token) {
      return renderMath(token.text as string, false);
    },
  };
}

function renderMath(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, { displayMode, throwOnError: true, strict: 'ignore' });
  } catch {
    // Malformed formula — show the original source rather than breaking
    // the rest of the document's render.
    const raw = escapeHtml(displayMode ? `$$\n${tex}\n$$` : `$${tex}$`);
    return `<span class="katex-error" title="Invalid math syntax">${raw}</span>`;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}
