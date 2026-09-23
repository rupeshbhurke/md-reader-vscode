// @ts-nocheck
import { marked } from 'marked';
import { gfmHeadingId } from 'marked-gfm-heading-id';
import hljs from 'highlight.js';

// ── Configure marked ──────────────────────────────────────────────────────────

marked.use(gfmHeadingId());

marked.use({
  renderer: buildRenderer(),
  gfm: true,
  breaks: false,
});

// ── Public API ────────────────────────────────────────────────────────────────

export interface RenderedDocument {
  html: string;
  toc: TocEntry[];
}

export interface TocEntry {
  level: number;    // 1-3
  text: string;
  id: string;
}

/**
 * Convert raw Markdown text into HTML + a TOC structure.
 */
export async function renderMarkdown(markdown: string): Promise<RenderedDocument> {
  const toc: TocEntry[] = [];

  // Intercept headings to build TOC
  const tocRenderer = {
    heading(text: string, level: number, raw: string): string {
      const id = slugify(raw);
      if (level <= 3) {
        toc.push({ level, text: stripHtml(text), id });
      }
      return `<h${level} id="${id}">${text}</h${level}>\n`;
    }
  };

  marked.use({ renderer: tocRenderer as any });

  const html = await marked.parse(markdown);

  return { html, toc };
}

// ── Renderer ──────────────────────────────────────────────────────────────────

function buildRenderer() {
  const renderer = new marked.Renderer();

  // Code blocks — syntax highlighting + copy button + language label
  renderer.code = (code: string, language: string | undefined): string => {
    const lang = language || 'plaintext';
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

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
