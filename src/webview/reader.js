/* ═══════════════════════════════════════════════════════════════════════════
   MD Reader — reader.js
   Webview-side script. Receives messages from the extension host and drives:
   - Content rendering
   - Theme / config application via CSS variables
   - TOC floating overlay (build, open/close, scroll highlight)
   - Reading progress bar
   - Copy-to-clipboard for code blocks
   - Scroll sync (two-way: editor ↔ reader)
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const vscode = acquireVsCodeApi();

  // ── Element refs ────────────────────────────────────────────────────────────
  const progressBar   = document.getElementById('progress-bar');
  const tocOverlay    = document.getElementById('toc-overlay');
  const tocBackdrop   = document.getElementById('toc-backdrop');
  const tocList       = document.getElementById('toc-list');
  const tocClose      = document.getElementById('toc-close');
  const readerContent = document.getElementById('reader-content');
  const readerMain    = document.getElementById('reader-main');

  // ── State ───────────────────────────────────────────────────────────────────
  let tocOpen = false;
  let currentConfig = {};
  let headingElements = [];

  // ── Scroll sync state ────────────────────────────────────────────────────────
  let scrollSyncEnabled  = false;
  let isReceivingScroll  = false;   // true while we're programmatically scrolling
  let receiveScrollTimer = null;    // clears the flag after animation settles
  let sendScrollTimer    = null;    // debounce outbound scroll messages

  // ── Width map ───────────────────────────────────────────────────────────────
  const WIDTH_MAP = {
    narrow: '640px',
    medium: '760px',
    wide:   '960px',
    wider:  '1100px',
    ultra:  '1400px',
    full:   '100%',
  };

  // ── Message handler (from extension host) ───────────────────────────────────
  window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
      case 'update':
        currentConfig = msg.config || {};
        applyConfig(currentConfig);
        renderContent(msg.html, msg.toc);
        break;
      case 'config':
        currentConfig = msg.config || {};
        applyConfig(currentConfig);
        break;
      case 'toggleTOC':
        toggleTOC();
        break;
      case 'scrollTo':
        // Extension host is driving the scroll — suppress echo-back
        isReceivingScroll = true;
        clearTimeout(receiveScrollTimer);
        {
          const docHeight = Math.max(1,
            document.body.scrollHeight - window.innerHeight ||
            readerMain.scrollHeight - readerMain.clientHeight
          );
          const targetY = msg.percentage * docHeight;
          window.scrollTo({ top: targetY, behavior: 'smooth' });
          // Keep flag set long enough for the smooth scroll to finish
          receiveScrollTimer = setTimeout(() => { isReceivingScroll = false; }, 400);
        }
        break;
    }
  });

  // ── Apply config as CSS variables ───────────────────────────────────────────
  function applyConfig(cfg) {
    const root = document.documentElement;

    // Scroll sync flag
    scrollSyncEnabled = !!cfg.scrollSync;

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
      // Apply directly to body — VS Code's webview injects its own body { font-size }
      // which overrides html inheritance. Inline style wins regardless.
      document.body.style.fontSize = cfg.fontSize + 'px';
    }
    if (cfg.lineHeight) {
      root.style.setProperty('--reader-line-height', String(cfg.lineHeight));
    }

    // Reading width
    const widthKey = cfg.readingWidth || 'medium';
    root.style.setProperty('--reader-max-width', WIDTH_MAP[widthKey] || '760px');
    // In full mode, collapse side padding so content truly spans the window
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
  }

  // ── Render content ──────────────────────────────────────────────────────────
  function renderContent(html, toc) {
    readerContent.classList.remove('loaded');
    readerContent.innerHTML = html;

    // Attach copy buttons
    attachCopyButtons();

    // Build TOC
    buildTOC(toc);

    // Cache heading elements for scroll highlight
    headingElements = Array.from(
      readerContent.querySelectorAll('h1[id], h2[id], h3[id]')
    );

    // Trigger fade-in
    requestAnimationFrame(() => {
      readerContent.classList.add('loaded');
    });

    // Reset progress bar
    updateProgressBar();
  }

  // ── Copy buttons ────────────────────────────────────────────────────────────
  function attachCopyButtons() {
    readerContent.querySelectorAll('.copy-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pre = btn.closest('.code-block').querySelector('pre code');
        if (!pre) { return; }

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
  function buildTOC(toc) {
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

    // Smooth-scroll on click
    tocList.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.getElementById(link.dataset.id);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          // Close TOC on small panels after navigation
          if (window.innerWidth < 640) { closeTOC(); }
        }
      });
    });
  }

  function toggleTOC() {
    tocOpen ? closeTOC() : openTOC();
  }

  function openTOC() {
    tocOpen = true;
    tocOverlay.classList.add('open');
    tocBackdrop.classList.add('visible');
  }

  function closeTOC() {
    tocOpen = false;
    tocOverlay.classList.remove('open');
    tocBackdrop.classList.remove('visible');
  }

  tocClose.addEventListener('click', closeTOC);
  tocBackdrop.addEventListener('click', closeTOC);

  // ── Scroll: progress bar + TOC highlight + sync ─────────────────────────────
  let ticking = false;

  function onScroll() {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        updateProgressBar();
        highlightActiveTOCEntry();
        maybeSendScrollSync();
        ticking = false;
      });
      ticking = true;
    }
  }

  readerMain.addEventListener('scroll', onScroll);
  window.addEventListener('scroll', onScroll);

  /** Send current scroll position to extension host (debounced, loop-guarded) */
  function maybeSendScrollSync() {
    if (!scrollSyncEnabled || isReceivingScroll) { return; }
    clearTimeout(sendScrollTimer);
    sendScrollTimer = setTimeout(() => {
      const scrollTop = window.scrollY || readerMain.scrollTop || 0;
      const docHeight = Math.max(1,
        document.body.scrollHeight - window.innerHeight ||
        readerMain.scrollHeight - readerMain.clientHeight
      );
      const percentage = Math.min(1, scrollTop / docHeight);
      vscode.postMessage({ type: 'scroll', percentage });
    }, 60); // 60ms debounce — smooth but responsive
  }

  function updateProgressBar() {
    const scrollTop = readerMain.scrollTop || window.scrollY;
    const docHeight = (readerMain.scrollHeight || document.body.scrollHeight) - (readerMain.clientHeight || window.innerHeight);
    const pct = docHeight > 0 ? Math.min(100, (scrollTop / docHeight) * 100) : 0;
    progressBar.style.width = pct + '%';
  }

  function highlightActiveTOCEntry() {
    if (headingElements.length === 0) { return; }

    const scrollTop = readerMain.scrollTop || window.scrollY;
    let activeId = headingElements[0]?.id;

    for (const heading of headingElements) {
      const rect = heading.getBoundingClientRect();
      if (rect.top <= 80) {
        activeId = heading.id;
      }
    }

    tocList.querySelectorAll('a').forEach((link) => {
      link.classList.toggle('active', link.dataset.id === activeId);
    });
  }

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    // Escape closes TOC
    if (e.key === 'Escape' && tocOpen) {
      closeTOC();
    }
  });

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

})();
