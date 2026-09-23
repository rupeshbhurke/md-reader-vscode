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

  const findInput  = document.getElementById('find-input');
  const findCount  = document.getElementById('find-count');
  const findNext   = document.getElementById('find-next');
  const findPrev   = document.getElementById('find-prev');
  const findCase   = document.getElementById('find-case');
  const findClose  = document.getElementById('find-close');

  const shortcutsOverlay  = document.getElementById('shortcuts-overlay');
  const shortcutsBackdrop = document.getElementById('shortcuts-backdrop');

  // ── State ───────────────────────────────────────────────────────────────────
  let tocOpen = false;
  let currentConfig = {};
  let headingElements = [];

  // ── Scroll sync state ────────────────────────────────────────────────────────
  let scrollSyncEnabled  = false;
  let isReceivingScroll  = false;   // true while we're programmatically scrolling
  let receiveScrollTimer = null;    // clears the flag after animation settles
  let sendScrollTimer    = null;    // debounce outbound scroll messages

  // ── Find-in-document state ──────────────────────────────────────────────────
  const highlightsSupported = typeof CSS !== 'undefined' && !!CSS.highlights && typeof Highlight !== 'undefined';
  const matchHighlight  = highlightsSupported ? new Highlight() : null;
  const activeHighlight = highlightsSupported ? new Highlight() : null;
  if (highlightsSupported) {
    CSS.highlights.set('md-find-match', matchHighlight);
    CSS.highlights.set('md-find-active', activeHighlight);
  }
  let findMatches       = [];   // Range[]
  let findIndex         = -1;
  let findCaseSensitive = false;
  let findDebounceTimer = null;
  const FIND_MAX_MATCHES = 5000;

  // ── Mermaid state ────────────────────────────────────────────────────────────
  // mermaid.min.js (~3.5MB) is loaded lazily — only once, only when a
  // document actually contains a ```mermaid block.
  let mermaidReadyPromise = null;

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
        if (msg.hasMermaid) { renderMermaidDiagrams(); }
        break;
      case 'config':
        currentConfig = msg.config || {};
        applyConfig(currentConfig);
        break;
      case 'toggleTOC':
        toggleTOC();
        break;
      case 'toggleSettings':
        toggleSettings();
        break;
      case 'find':
        openFindBar();
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

    syncSettingsUI(cfg);
  }

  // ── Settings UI ─────────────────────────────────────────────────────────────
  
  const settingsDrawer = document.getElementById('settings-drawer');
  const settingsBackdrop = document.getElementById('settings-backdrop');
  
  function toggleSettings() {
    document.body.classList.toggle('settings-open');
  }

  function setupSettingsUI() {
    if (!settingsDrawer) return;

    // Close button & backdrop
    document.getElementById('settings-close')?.addEventListener('click', toggleSettings);
    settingsBackdrop?.addEventListener('click', toggleSettings);

    // Controls
    const ctrls = {
      theme: document.getElementById('set-theme'),
      fontFamily: document.getElementById('set-font'),
      fontSize: document.getElementById('set-size'),
      lineHeight: document.getElementById('set-lineheight'),
      readingWidth: document.getElementById('set-width'),
      blueLightFilter: document.getElementById('set-eyecare'),
      scrollSync: document.getElementById('set-scrollsync')
    };

    // Value displays
    const displays = {
      fontSize: document.getElementById('val-size'),
      lineHeight: document.getElementById('val-lineheight'),
      blueLightFilter: document.getElementById('val-eyecare')
    };

    function bind(key, ctrl, type = 'change', isCheckbox = false) {
      if (!ctrl) return;
      ctrl.addEventListener(type, (e) => {
        const val = isCheckbox ? e.target.checked : (type === 'input' ? parseFloat(e.target.value) : e.target.value);
        
        // Immediate local feedback
        if (key === 'fontSize') {
          displays.fontSize.textContent = val + 'px';
          document.body.style.fontSize = val + 'px';
          document.documentElement.style.setProperty('--reader-font-size', val + 'px');
        } else if (key === 'lineHeight') {
          displays.lineHeight.textContent = val.toFixed(2);
          document.documentElement.style.setProperty('--reader-line-height', val);
        } else if (key === 'blueLightFilter') {
          displays.blueLightFilter.textContent = val + '%';
          if (val > 0) {
            document.body.style.setProperty('--eye-care-opacity', val / 100);
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
        } else if (key === 'scrollSync') {
          scrollSyncEnabled = val;
        }

        // Only send to extension host on change (not on every pixel of input slider drag)
        if (type === 'change') {
          vscode.postMessage({ type: 'updateSetting', key, value: val });
        }
      });
      
      // For range sliders, also bind input for real-time visual feedback before mouse up
      if (type === 'change' && ctrl.type === 'range') {
        bind(key, ctrl, 'input', false);
      }
    }

    bind('theme', ctrls.theme);
    bind('fontFamily', ctrls.fontFamily);
    bind('fontSize', ctrls.fontSize);
    bind('lineHeight', ctrls.lineHeight);
    bind('readingWidth', ctrls.readingWidth);
    bind('blueLightFilter', ctrls.blueLightFilter);
    bind('scrollSync', ctrls.scrollSync, 'change', true);
  }

  function syncSettingsUI(cfg) {
    if (!settingsDrawer) return;
    
    const trySet = (id, val, displayId, displayFmt) => {
      const el = document.getElementById(id);
      if (el) {
        if (el.type === 'checkbox') el.checked = !!val;
        else el.value = val;
      }
      if (displayId && val !== undefined) {
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
    trySet('set-scrollsync', cfg.scrollSync);
  }

  setupSettingsUI();


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

  // ── Mermaid diagrams ─────────────────────────────────────────────────────────
  function ensureMermaidLoaded() {
    if (window.mermaid) { return Promise.resolve(); }
    if (mermaidReadyPromise) { return mermaidReadyPromise; }

    mermaidReadyPromise = new Promise((resolve, reject) => {
      const vendor = window.__mdReaderVendor;
      if (!vendor || !vendor.mermaidJsUri) {
        reject(new Error('mermaid vendor URI missing'));
        return;
      }
      const script = document.createElement('script');
      script.nonce = vendor.nonce;
      script.src = vendor.mermaidJsUri;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('failed to load mermaid.min.js'));
      document.head.appendChild(script);
    });

    return mermaidReadyPromise;
  }

  function mermaidThemeFor(cfg) {
    const theme = (cfg && cfg.theme) || 'auto';
    if (theme === 'dark') { return 'dark'; }
    if (theme === 'auto' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'default';
  }

  function renderMermaidDiagrams() {
    ensureMermaidLoaded()
      .then(() => {
        window.mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: mermaidThemeFor(currentConfig),
        });
        // suppressErrors: a malformed diagram leaves its element in an error
        // state instead of throwing and aborting every other diagram on the
        // page — the escaped source is still visible underneath either way.
        return window.mermaid.run({ querySelector: '.mermaid', suppressErrors: true });
      })
      .catch((err) => {
        // Load/parse failure — the raw (escaped) diagram source is already
        // in the DOM as plain text, so the document still reads fine.
        console.error('MD Reader: mermaid render failed', err);
      });
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

  // ── Find in document ─────────────────────────────────────────────────────────
  // Uses the CSS Custom Highlight API (no DOM mutation — code blocks, copy
  // buttons etc. are untouched). If unavailable, the find bar still opens but
  // matching silently no-ops (count stays 0/0) rather than throwing.
  function openFindBar() {
    document.body.classList.add('find-open');
    findInput.focus();
    findInput.select();
    if (findInput.value) { runFind(findInput.value); }
  }

  function closeFindBar() {
    document.body.classList.remove('find-open');
    clearFindHighlights();
    findMatches = [];
    findIndex = -1;
    updateFindCount();
  }

  function clearFindHighlights() {
    if (matchHighlight) { matchHighlight.clear(); }
    if (activeHighlight) { activeHighlight.clear(); }
  }

  function runFind(query) {
    clearFindHighlights();
    findMatches = [];
    findIndex = -1;

    if (!query || !highlightsSupported) {
      updateFindCount();
      return;
    }

    const needle = findCaseSensitive ? query : query.toLowerCase();
    const walker = document.createTreeWalker(readerContent, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || parent.closest('script, style, .copy-btn, .code-header')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    let node;
    while ((node = walker.nextNode()) && findMatches.length < FIND_MAX_MATCHES) {
      const haystack = findCaseSensitive ? node.textContent : node.textContent.toLowerCase();
      let from = 0;
      let idx;
      while ((idx = haystack.indexOf(needle, from)) !== -1 && findMatches.length < FIND_MAX_MATCHES) {
        const range = new Range();
        range.setStart(node, idx);
        range.setEnd(node, idx + query.length);
        findMatches.push(range);
        matchHighlight.add(range);
        from = idx + query.length;
      }
    }

    updateFindCount();
    if (findMatches.length > 0) { goToMatch(0); }
  }

  function goToMatch(index) {
    if (findMatches.length === 0) { return; }
    if (activeHighlight) { activeHighlight.clear(); }

    findIndex = ((index % findMatches.length) + findMatches.length) % findMatches.length;
    const range = findMatches[findIndex];
    if (activeHighlight) { activeHighlight.add(range); }

    // Scrolling here can trigger the same scroll-sync echo as any other
    // programmatic scroll — suppress it the same way 'scrollTo' does.
    isReceivingScroll = true;
    clearTimeout(receiveScrollTimer);
    const container = range.startContainer;
    const el = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    receiveScrollTimer = setTimeout(() => { isReceivingScroll = false; }, 400);

    updateFindCount();
  }

  function updateFindCount() {
    findCount.textContent = findMatches.length > 0
      ? `${findIndex + 1}/${findMatches.length}`
      : '0/0';
  }

  findInput.addEventListener('input', () => {
    clearTimeout(findDebounceTimer);
    findDebounceTimer = setTimeout(() => runFind(findInput.value), 120);
  });

  findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.shiftKey ? goToMatch(findIndex - 1) : goToMatch(findIndex + 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeFindBar();
    }
  });

  findNext.addEventListener('click', () => goToMatch(findIndex + 1));
  findPrev.addEventListener('click', () => goToMatch(findIndex - 1));
  findClose.addEventListener('click', closeFindBar);
  findCase.addEventListener('click', () => {
    findCaseSensitive = !findCaseSensitive;
    findCase.classList.toggle('active', findCaseSensitive);
    if (findInput.value) { runFind(findInput.value); }
  });

  // ── Keyboard shortcuts help overlay ─────────────────────────────────────────
  function toggleShortcutsHelp() {
    document.body.classList.toggle('shortcuts-open');
  }
  function closeShortcutsHelp() {
    document.body.classList.remove('shortcuts-open');
  }
  document.getElementById('shortcuts-close')?.addEventListener('click', closeShortcutsHelp);
  shortcutsBackdrop?.addEventListener('click', closeShortcutsHelp);

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
  // Ctrl/Cmd+F is deliberately NOT handled here — it's registered as a VS Code
  // command (mdReader.find) with its own keybinding, because the webview's
  // guest page can't reliably claim a modifier chord ahead of the host's own
  // keybinding dispatch. See panelManager.ts / extension.ts.
  function scrollByAmount(delta) {
    window.scrollBy({ top: delta, behavior: 'smooth' });
    readerMain.scrollBy({ top: delta, behavior: 'smooth' });
  }

  function scrollToEdge(top) {
    window.scrollTo({ top, behavior: 'smooth' });
    readerMain.scrollTo({ top, behavior: 'smooth' });
  }

  function jumpHeading(direction) {
    if (headingElements.length === 0) { return; }
    let target = null;
    if (direction > 0) {
      target = headingElements.find(h => h.getBoundingClientRect().top > 90);
    } else {
      for (let i = headingElements.length - 1; i >= 0; i--) {
        if (headingElements[i].getBoundingClientRect().top < -10) { target = headingElements[i]; break; }
      }
    }
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function nudgeFontSize(delta) {
    const current = currentConfig.fontSize || 17;
    const size = delta === 0 ? 17 : Math.min(72, Math.max(10, current + delta));
    currentConfig.fontSize = size;

    document.body.style.fontSize = size + 'px';
    document.documentElement.style.setProperty('--reader-font-size', size + 'px');

    const sizeInput = document.getElementById('set-size');
    if (sizeInput) { sizeInput.value = size; }
    const sizeDisplay = document.getElementById('val-size');
    if (sizeDisplay) { sizeDisplay.textContent = size + 'px'; }

    vscode.postMessage({ type: 'updateSetting', key: 'fontSize', value: size });
  }

  document.addEventListener('keydown', (e) => {
    // Escape closes whichever overlay is open, innermost first.
    if (e.key === 'Escape') {
      if (document.body.classList.contains('find-open')) { closeFindBar(); return; }
      if (document.body.classList.contains('shortcuts-open')) { closeShortcutsHelp(); return; }
      if (document.body.classList.contains('settings-open')) { toggleSettings(); return; }
      if (tocOpen) { closeTOC(); return; }
      return;
    }

    // Font-size zoom works everywhere, including while a field has focus.
    if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
      e.preventDefault(); nudgeFontSize(1); return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === '-') {
      e.preventDefault(); nudgeFontSize(-1); return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === '0') {
      e.preventDefault(); nudgeFontSize(0); return;
    }

    // Everything below is single-key, reading-mode navigation — don't hijack
    // typing in the find box or a settings control.
    const inField = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || '');
    if (inField || e.ctrlKey || e.metaKey || e.altKey) { return; }

    switch (e.key) {
      case 'j': e.preventDefault(); scrollByAmount(80); break;
      case 'k': e.preventDefault(); scrollByAmount(-80); break;
      case ' ':
        e.preventDefault();
        scrollByAmount(e.shiftKey ? -window.innerHeight * 0.85 : window.innerHeight * 0.85);
        break;
      case 'g': e.preventDefault(); scrollToEdge(0); break;
      case 'G': e.preventDefault(); scrollToEdge(document.body.scrollHeight); break;
      case 'n': e.preventDefault(); jumpHeading(1); break;
      case 'p': e.preventDefault(); jumpHeading(-1); break;
      case 't': e.preventDefault(); toggleTOC(); break;
      case 's': e.preventDefault(); toggleSettings(); break;
      case '?': e.preventDefault(); toggleShortcutsHelp(); break;
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
