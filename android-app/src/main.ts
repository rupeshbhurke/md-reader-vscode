import { ConfigManager } from './configManager';
import { renderMarkdown } from './markdownRenderer';
import { initReader, applyConfig, renderContent } from './reader';

const configManager = new ConfigManager();

async function init() {
  // Load config
  const config = await configManager.load();
  
  // Initialize UI and pass setting change handler
  initReader((key, value) => {
    configManager.updateSetting(key, value);
  });

  applyConfig(config);

  // Setup file picker
  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  const fabOpen = document.getElementById('fab-open');

  if (fabOpen && fileInput) {
    fabOpen.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const { html, toc } = await renderMarkdown(text);
        renderContent(html, toc);
      } catch (err) {
        console.error('Failed to read or render file', err);
        alert('Failed to read the Markdown file.');
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
