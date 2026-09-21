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

  // Setup file picker for Desktop
  const fabOpen = document.getElementById('fab-open');

  if (fabOpen) {
    fabOpen.addEventListener('click', async () => {
      try {
        // @ts-ignore
        const result = await window.electronAPI.openFile();
        if (result && result.content) {
          const { html, toc } = await renderMarkdown(result.content);
          renderContent(html, toc);
        }
      } catch (err) {
        console.error('Failed to read or render file', err);
        alert('Failed to read the Markdown file.');
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
