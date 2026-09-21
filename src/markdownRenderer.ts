import { Marked, Renderer } from 'marked';
import GithubSlugger from 'github-slugger';
import hljs from 'highlight.js';

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

  const html = await marked.parse(markdown);

  return { html, toc: currentToc };
}

// ── Marked instance (configured once) ──────────────────────────────────────────

let currentToc: TocEntry[] = [];
const slugger = new GithubSlugger();

const marked = new Marked({
  renderer: buildRenderer(),
  gfm: true,
  breaks: false,
});

// ── Renderer ──────────────────────────────────────────────────────────────────

function buildRenderer() {
  const renderer = new Renderer();

  // Headings — GitHub-style unique anchor ids + TOC collection (levels 1-3)
  renderer.heading = (text: string, level: number, raw: string): string => {
    const cleaned = raw
      .toLowerCase()
      .trim()
      .replace(/<[!\/a-z].*?>/gi, '');
    const id = slugger.slug(cleaned);

    if (level <= 3) {
      currentToc.push({ level, text: stripHtml(text), id });
    }

    return `<h${level} id="${id}">${text}</h${level}>\n`;
  };

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
