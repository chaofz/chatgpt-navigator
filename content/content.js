/**
 * ChatGPT Navigator Content Script
 * Main entry point for the extension
 */

(function() {
  'use strict';

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
        console.error('[ChatGPT Navigator] Error updating outline', e);
      }
      return;
    }

    // Initialize navigator
    try {
      navigatorInstance = new ChatGPTNavigator();
      navigatorInstance.init().then(() => {
        window.chatgptNavigator = navigatorInstance;
        console.log('[ChatGPT Navigator] Extension loaded successfully');
      }).catch((error) => {
        console.error('[ChatGPT Navigator] Error initializing', error);
        console.error('[ChatGPT Navigator] Stack trace:', error.stack);
      });
    } catch (error) {
      console.error('[ChatGPT Navigator] Error initializing', error);
      console.error('[ChatGPT Navigator] Stack trace:', error.stack);
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
          console.warn('[ChatGPT Navigator] Error during cleanup:', e);
        }
        navigatorInstance = null;
        window.chatgptNavigator = null;
      }
      // Wait for page to settle, then reinitialize
      setTimeout(init, 1000);
    }
  });

  urlObserver.observe(document, { subtree: true, childList: true });

})();
