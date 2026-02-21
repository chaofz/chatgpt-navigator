/**
 * ChatGPT Navigator Content Script
 * Main entry point for the extension
 */

(function() {
  'use strict';

  const DEBUG = false;
  let navigatorInstance = null;
  let initTimer = null;

  // Wait for DOM to be ready and ChatGPTNavigator class to be available
  function init() {
    // Check if we're on a ChatGPT chat page
    const isChatGPTPage = window.location.href.includes('chat.openai.com') || 
                         window.location.href.includes('chatgpt.com');
    if (!isChatGPTPage) {
      return;
    }

    // Wait for ChatGPTNavigator class to be available
    if (typeof ChatGPTNavigator === 'undefined') {
      // Retry after a short delay
      if (initTimer) clearTimeout(initTimer);
      initTimer = setTimeout(init, 100);
      return;
    }

    // Prevent multiple initializations
    if (navigatorInstance) {
      // Re-initialize if needed (e.g., on navigation)
      try {
        navigatorInstance.generateOutline();
      } catch (e) {
        if (DEBUG) console.error('[ChatGPT Navigator] Error updating outline', e);
      }
      return;
    }

    // Initialize navigator
    try {
      navigatorInstance = new ChatGPTNavigator();
      navigatorInstance.init().then(() => {
        window.chatgptNavigator = navigatorInstance;
        if (DEBUG) console.log('[ChatGPT Navigator] Extension loaded successfully');
      }).catch((error) => {
        if (DEBUG) {
          console.error('[ChatGPT Navigator] Error initializing', error);
          console.error('[ChatGPT Navigator] Stack trace:', error.stack);
        }
      });
    } catch (error) {
      if (DEBUG) {
        console.error('[ChatGPT Navigator] Error initializing', error);
        console.error('[ChatGPT Navigator] Stack trace:', error.stack);
      }
    }
  }

  // Initialize when DOM is ready
  function startInit() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      // DOM already ready, wait a bit for ChatGPT to load
      setTimeout(init, 500);
    }
  }

  startInit();

  // Also initialize on navigation (ChatGPT is a SPA)
  let lastUrl = location.href;
  const urlObserver = new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      // Reset instance on navigation to allow re-initialization
      if (navigatorInstance) {
        try {
          navigatorInstance.destroy();
        } catch (e) {
          if (DEBUG) console.warn('[ChatGPT Navigator] Error during cleanup:', e);
        }
        navigatorInstance = null;
        window.chatgptNavigator = null;
      }
      // Wait for page to settle, then reinitialize
      setTimeout(init, 1000);
    }
  });

  urlObserver.observe(document, { subtree: true, childList: true });

  // --- Option+V: toggle ChatGPT voice dictate ---
  function getVoiceDictateButton() {
    const labels = ['voice', 'microphone', 'mic', 'dictate', 'speech', 'start listening', 'stop listening'];
    const buttons = document.querySelectorAll('button[aria-label], button[title]');
    for (const btn of buttons) {
      const label = (btn.getAttribute('aria-label') || btn.getAttribute('title') || '').toLowerCase();
      if (labels.some(l => label.includes(l))) return btn;
    }
    // Fallback: button that looks like a mic (svg path or role near composer)
    const composer = document.querySelector('[data-testid="composer-textarea"]')?.closest('form')
      || document.querySelector('form');
    if (composer) {
      const inComposer = composer.querySelectorAll('button');
      for (const btn of inComposer) {
        const svg = btn.querySelector('svg');
        if (svg && (svg.innerHTML.includes('path') || btn.getAttribute('aria-label'))) {
          const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
          if (aria.includes('voice') || aria.includes('mic') || aria.includes('listen') || !aria) {
            if (btn.offsetParent !== null) return btn;
          }
        }
      }
    }
    return null;
  }

  function onVoiceShortcut(e) {
    if (e.ctrlKey && (e.key === 'v' || e.key === 'V')) {
      const btn = getVoiceDictateButton();
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        btn.click();
      }
    }
  }

  document.addEventListener('keydown', onVoiceShortcut, true);

})();
