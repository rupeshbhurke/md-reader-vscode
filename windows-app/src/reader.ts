import type { AppConfig } from './configManager';

// ── Element refs ────────────────────────────────────────────────────────────
let progressBar: HTMLElement | null;
let tocOverlay: HTMLElement | null;
let tocBackdrop: HTMLElement | null;
let tocList: HTMLElement | null;
let tocClose: HTMLElement | null;
let readerContent: HTMLElement | null;
let readerMain: HTMLElement | null;

let tocOpen = false;
let headingElements: Element[] = [];

// ── Width map ───────────────────────────────────────────────────────────────
const WIDTH_MAP: Record<string, string> = {
  narrow: '640px',
  medium: '760px',
  wide:   '960px',
  wider:  '1100px',
  ultra:  '1400px',
  full:   '100%',
};

export function initReader(onSettingChange: (key: keyof AppConfig, value: any) => void) {
  progressBar   = document.getElementById('progress-bar');
  tocOverlay    = document.getElementById('toc-overlay');
  tocBackdrop   = document.getElementById('toc-backdrop');
  tocList       = document.getElementById('toc-list');
  tocClose      = document.getElementById('toc-close');
  readerContent = document.getElementById('reader-content');
  readerMain    = document.getElementById('reader-main');

  setupSettingsUI(onSettingChange);

  if (tocClose) tocClose.addEventListener('click', closeTOC);
  if (tocBackdrop) tocBackdrop.addEventListener('click', closeTOC);

  // TOC FAB
  const fabToc = document.getElementById('fab-toc');
  if (fabToc) {
    fabToc.addEventListener('click', toggleTOC);
  }

  // Scroll events
  if (readerMain) readerMain.addEventListener('scroll', onScroll);
  window.addEventListener('scroll', onScroll);
}

export function applyConfig(cfg: AppConfig) {
  const root = document.documentElement;

  // Theme
  const theme = cfg.theme || 'auto';
  root.setAttribute('data-theme', theme);

  // Typography
  if (cfg.fontFamily) {
    root.style.setProperty('--reader-font', cfg.fontFamily);
    document.body.style.fontFamily = cfg.fontFamily;
  }
  if (cfg.fontSize) {
    root.style.setProperty('--reader-font-size', cfg.fontSize + 'px');
    document.body.style.fontSize = cfg.fontSize + 'px';
  }
  if (cfg.lineHeight) {
    root.style.setProperty('--reader-line-height', String(cfg.lineHeight));
  }

  // Reading width
  const widthKey = cfg.readingWidth || 'medium';
  root.style.setProperty('--reader-max-width', WIDTH_MAP[widthKey] || '760px');
  if (readerMain) {
    readerMain.style.paddingLeft  = widthKey === 'full' ? '16px' : '32px';
    readerMain.style.paddingRight = widthKey === 'full' ? '16px' : '32px';
  }

  // Blue light filter (Eye Care)
  if (typeof cfg.blueLightFilter === 'number' && cfg.blueLightFilter > 0) {
    document.body.style.setProperty('--eye-care-opacity', (cfg.blueLightFilter / 100).toString());
    document.body.classList.add('blue-light-filter');
  } else {
    document.body.style.removeProperty('--eye-care-opacity');
    document.body.classList.remove('blue-light-filter');
  }

  syncSettingsUI(cfg);
}

export function renderContent(html: string, toc: any[]) {
  if (!readerContent) return;
  
  readerContent.classList.remove('loaded');
  readerContent.innerHTML = html;

  // Show TOC fab if we have content
  const fabToc = document.getElementById('fab-toc');
  if (fabToc) {
    fabToc.style.display = 'flex';
  }

  attachCopyButtons();
  buildTOC(toc);

  headingElements = Array.from(readerContent.querySelectorAll('h1[id], h2[id], h3[id]'));

  requestAnimationFrame(() => {
    readerContent!.classList.add('loaded');
  });

  updateProgressBar();
}

// ── Settings UI ─────────────────────────────────────────────────────────────

function toggleSettings() {
  document.body.classList.toggle('settings-open');
}

function setupSettingsUI(onSettingChange: (key: keyof AppConfig, value: any) => void) {
  const settingsDrawer = document.getElementById('settings-drawer');
  const settingsBackdrop = document.getElementById('settings-backdrop');
  if (!settingsDrawer) return;

  document.getElementById('settings-close')?.addEventListener('click', toggleSettings);
  settingsBackdrop?.addEventListener('click', toggleSettings);
  
  const fabSettings = document.getElementById('fab-settings');
  if (fabSettings) {
    fabSettings.addEventListener('click', toggleSettings);
  }

  const ctrls = {
    theme: document.getElementById('set-theme') as HTMLSelectElement,
    fontFamily: document.getElementById('set-font') as HTMLSelectElement,
    fontSize: document.getElementById('set-size') as HTMLInputElement,
    lineHeight: document.getElementById('set-lineheight') as HTMLInputElement,
    readingWidth: document.getElementById('set-width') as HTMLSelectElement,
    blueLightFilter: document.getElementById('set-eyecare') as HTMLInputElement,
  };

  const displays = {
    fontSize: document.getElementById('val-size'),
    lineHeight: document.getElementById('val-lineheight'),
    blueLightFilter: document.getElementById('val-eyecare')
  };

  function bind(key: keyof AppConfig, ctrl: HTMLElement, type = 'change', isCheckbox = false) {
    if (!ctrl) return;
    ctrl.addEventListener(type, (e: any) => {
      const val = isCheckbox ? e.target.checked : (type === 'input' ? parseFloat(e.target.value) : e.target.value);
      
      if (key === 'fontSize') {
        displays.fontSize!.textContent = val + 'px';
        document.body.style.fontSize = val + 'px';
        document.documentElement.style.setProperty('--reader-font-size', val + 'px');
      } else if (key === 'lineHeight') {
        displays.lineHeight!.textContent = val.toFixed(2);
        document.documentElement.style.setProperty('--reader-line-height', val);
      } else if (key === 'blueLightFilter') {
        displays.blueLightFilter!.textContent = val + '%';
        if (val > 0) {
          document.body.style.setProperty('--eye-care-opacity', (val / 100).toString());
          document.body.classList.add('blue-light-filter');
        } else {
          document.body.style.removeProperty('--eye-care-opacity');
          document.body.classList.remove('blue-light-filter');
        }
      } else if (key === 'theme') {
        document.documentElement.setAttribute('data-theme', val);
      } else if (key === 'fontFamily') {
        document.body.style.fontFamily = val;
        document.documentElement.style.setProperty('--reader-font', val);
      } else if (key === 'readingWidth') {
        document.documentElement.style.setProperty('--reader-max-width', WIDTH_MAP[val] || '760px');
        if (readerMain) {
          readerMain.style.paddingLeft = val === 'full' ? '16px' : '32px';
          readerMain.style.paddingRight = val === 'full' ? '16px' : '32px';
        }
      }

      if (type === 'change') {
        onSettingChange(key, val);
      }
    });
    
    if (type === 'change' && (ctrl as HTMLInputElement).type === 'range') {
      bind(key, ctrl, 'input', false);
    }
  }

  bind('theme', ctrls.theme);
  bind('fontFamily', ctrls.fontFamily);
  bind('fontSize', ctrls.fontSize);
  bind('lineHeight', ctrls.lineHeight);
  bind('readingWidth', ctrls.readingWidth);
  bind('blueLightFilter', ctrls.blueLightFilter);
}

function syncSettingsUI(cfg: AppConfig) {
  const trySet = (id: string, val: any, displayId?: string, displayFmt?: (v: any) => string) => {
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement;
    if (el) {
      if (el.type === 'checkbox') (el as HTMLInputElement).checked = !!val;
      else el.value = val;
    }
    if (displayId && val !== undefined && displayFmt) {
      const dEl = document.getElementById(displayId);
      if (dEl) dEl.textContent = displayFmt(val);
    }
  };

  trySet('set-theme', cfg.theme || 'auto');
  trySet('set-font', cfg.fontFamily);
  trySet('set-size', cfg.fontSize, 'val-size', v => v + 'px');
  trySet('set-lineheight', cfg.lineHeight, 'val-lineheight', v => v.toFixed(2));
  trySet('set-width', cfg.readingWidth || 'medium');
  trySet('set-eyecare', cfg.blueLightFilter || 0, 'val-eyecare', v => v + '%');
}

// ── Copy buttons ────────────────────────────────────────────────────────────
function attachCopyButtons() {
  if (!readerContent) return;
  readerContent.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pre = btn.closest('.code-block')?.querySelector('pre code') as HTMLElement;
      if (!pre) return;

      navigator.clipboard.writeText(pre.innerText).then(() => {
        btn.textContent = '✓ Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            Copy`;
          btn.classList.remove('copied');
        }, 2000);
      });
    });
  });
}

// ── TOC ─────────────────────────────────────────────────────────────────────
function buildTOC(toc: any[]) {
  if (!tocList) return;
  if (!toc || toc.length === 0) {
    tocList.innerHTML = '<li style="padding:1rem;color:var(--text-muted);font-size:0.85em;">No headings found.</li>';
    return;
  }

  tocList.innerHTML = toc
    .map((entry) => `
      <li data-level="${entry.level}">
        <a href="#${entry.id}" data-id="${entry.id}">${escapeHtml(entry.text)}</a>
      </li>`)
    .join('');

  tocList.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.getElementById(link.dataset.id!);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (window.innerWidth < 640) closeTOC();
      }
    });
  });
}

function toggleTOC() {
  tocOpen ? closeTOC() : openTOC();
}

function openTOC() {
  tocOpen = true;
  tocOverlay?.classList.add('open');
  tocBackdrop?.classList.add('visible');
}

function closeTOC() {
  tocOpen = false;
  tocOverlay?.classList.remove('open');
  tocBackdrop?.classList.remove('visible');
}

let ticking = false;
function onScroll() {
  if (!ticking) {
    window.requestAnimationFrame(() => {
      updateProgressBar();
      highlightActiveTOCEntry();
      ticking = false;
    });
    ticking = true;
  }
}

function updateProgressBar() {
  if (!progressBar) return;
  const scrollTop = readerMain?.scrollTop || window.scrollY;
  const docHeight = (readerMain?.scrollHeight || document.body.scrollHeight) - (readerMain?.clientHeight || window.innerHeight);
  const pct = docHeight > 0 ? Math.min(100, (scrollTop / docHeight) * 100) : 0;
  progressBar.style.width = pct + '%';
}

function highlightActiveTOCEntry() {
  if (headingElements.length === 0 || !tocList) return;

  let activeId = headingElements[0]?.id;
  for (const heading of headingElements) {
    const rect = heading.getBoundingClientRect();
    if (rect.top <= 80) activeId = heading.id;
  }

  tocList.querySelectorAll('a').forEach((link) => {
    link.classList.toggle('active', link.dataset.id === activeId);
  });
}

function escapeHtml(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
