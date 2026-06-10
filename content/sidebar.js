/**
 * ChatGPT Navigator Sidebar
 * Handles outline generation, rendering, and navigation
 */

class ChatGPTNavigator {
  constructor() {
    this.sidebar = null;
    this.outline = null;
    this.toggleButton = null;
    this.lockButton = null;
    this.pinButton = null;
    this.backButton = null;
    this.pinnedScroll = null;
    this.scrollLockEnabled = true;
    this.scrollLockTop = 0;
    this.scrollLockContainer = null;
    this._scrollLockListenersAttached = false;
    this._scrollLockUserIntent = false;
    this._scrollLockUserIntentTimer = null;
    this._scrollLockBypass = false;
    this._scrollLockRestoring = false;
    this._scrollLockEnforceQueued = false;
    this._scrollIntoViewPatched = false;
    this._nativeScrollIntoView = null;
    this._scrollLockPostSubmitUntil = 0;
    this.isExpanded = true;
    this.outlineData = [];
    this.activeItem = null;
    this.debug = false;
    this.updateDebounceTimer = null;
    this.resizeDebounceTimer = null;
    this.observer = null;
    this.logPrefix = '[ChatGPT Navigator]';
    this.settings = {
      combineQuestionResponse: false,
      themeMode: 'auto',
      showPinButton: true,
      showOutline: true,
      showScrollLockButton: true
    };
    this._themeObserver = null;
    this._themeMediaQuery = null;
    this._boundThemeMediaChange = null;
  }

  /**
   * Log error with consistent prefix (no-op when debug disabled)
   */
  logError(message, error = null) {
    if (!this.debug) return;
    console.error(`${this.logPrefix} ${message}`, error || '');
    if (error && error.stack) {
      console.error(`${this.logPrefix} Stack trace:`, error.stack);
    }
  }

  /**
   * Log warning with consistent prefix (no-op when debug disabled)
   */
  logWarning(message) {
    if (!this.debug) return;
    console.warn(`${this.logPrefix} ${message}`);
  }

  /**
   * Log info with consistent prefix (no-op when debug disabled)
   */
  logInfo(message) {
    if (!this.debug) return;
    console.log(`${this.logPrefix} ${message}`);
  }

  /**
   * Load settings from storage
   */
  async loadSettings() {
    const defaults = {
      combineQuestionResponse: false,
      themeMode: 'auto',
      showPinButton: true,
      showOutline: true,
      showScrollLockButton: true,
      scrollLockEnabled: true
    };
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
        this.settings = { ...defaults };
        return;
      }
      const result = await chrome.storage.sync.get(defaults);
      this.settings = result;
      this.settings.themeMode = this._normalizeThemeMode(result);
      this.scrollLockEnabled = !!result.scrollLockEnabled;
      this.logInfo('Settings loaded:', this.settings);
    } catch (error) {
      const invalidated = error?.message?.includes('Extension context invalidated');
      if (invalidated) {
        this.settings = { ...defaults };
        this.logInfo('Using default settings (extension context invalidated)');
      } else {
        this.logError('Error loading settings', error);
        this.settings = { ...defaults };
      }
    }
  }

  /**
   * Initialize the sidebar
   */
  async init() {
    try {
      this.logInfo('Initializing ChatGPT Navigator...');
      await this.loadSettings();
      this.createSidebar();
      if (this.scrollLockEnabled) {
        // Force re-enable to setup listeners and UI
        const targetState = this.scrollLockEnabled;
        this.scrollLockEnabled = false;
        this.setScrollLock(targetState);
      }
      this.applySidebarTheme();
      this.setupThemeObserver();
      this.generateOutline();
      this.attachEventListeners();
      this.observeChanges();
      this.setupMessageListener();
      this.logInfo('ChatGPT Navigator initialized successfully');
    } catch (error) {
      this.logError('Failed to initialize', error);
    }
  }

  /**
   * Setup message listener for settings reload
   */
  setupMessageListener() {
    if (typeof chrome === 'undefined' || !chrome.runtime?.id || !chrome.runtime.onMessage) {
      return;
    }
    // Store the listener so destroy() can detach it. Without this, every
    // SPA navigation (which destroys and re-creates the instance) leaks a
    // listener that keeps the old instance alive.
    this._boundMessageListener = (message, sender, sendResponse) => {
      if (message.action === 'reloadSettings') {
        this.loadSettings().then(() => {
          this.applySidebarTheme();
          this.setupThemeObserver();
          this.applyHeaderToolbarVisibility();
          this.generateOutline();
          sendResponse({ success: true });
        });
        return true; // Keep channel open for async response
      }
    };
    chrome.runtime.onMessage.addListener(this._boundMessageListener);
  }

  /**
   * Create the sidebar DOM structure
   */
  createSidebar() {
    // Check URL again inside sidebar creation to be absolutely sure
    const url = window.location.href;
    const isChatConversation = url.includes('/c/') || url.includes('/chat/');
    const isProjectPage = url.includes('/project/');
    if (!isChatConversation || isProjectPage) {
      this.logInfo('Not a chat conversation page, skipping sidebar creation');
      return;
    }

    // Remove existing sidebar if present
    const existing = document.getElementById('chatgpt-navigator-sidebar');
    if (existing) {
      existing.remove();
    }

    this.sidebar = document.createElement('div');
    this.sidebar.id = 'chatgpt-navigator-sidebar';
    // Initially hide the sidebar with both class and inline style to prevent flash
    this.sidebar.classList.add('hidden');
    this.sidebar.style.display = 'none';

    this.sidebar.innerHTML = `
      <div id="chatgpt-navigator-header">
        <button type="button" id="chatgpt-navigator-lock-btn" class="chatgpt-navigator-header-btn" aria-label="Toggle scroll lock" title="Toggle scroll lock">
          <svg class="chatgpt-navigator-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect class="lock-body" x="4.5" y="11" width="15" height="12" rx="2"></rect>
            <path class="lock-shackle-unlocked" d="M8 5V6a4 4 0 0 1 8 0v5"></path>
            <path class="lock-shackle-locked" d="M8 11V6a4 4 0 0 1 8 0v5"></path>
          </svg>
        </button>
        <button type="button" id="chatgpt-navigator-pin-btn" class="chatgpt-navigator-header-btn" aria-label="Pin or jump to scroll position" title="Pin scroll position">
          <svg class="chatgpt-navigator-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path fill-rule="evenodd" d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"></path>
          </svg>
        </button>
        <button type="button" id="chatgpt-navigator-toggle-btn" class="chatgpt-navigator-header-btn" aria-label="Toggle sidebar">
          <svg id="chatgpt-navigator-toggle-icon" class="chatgpt-navigator-header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
      </div>
      <ul id="chatgpt-navigator-outline"></ul>
    `;

    document.body.appendChild(this.sidebar);
    this.outline = document.getElementById('chatgpt-navigator-outline');
    this.lockButton = document.getElementById('chatgpt-navigator-lock-btn');
    this.pinButton = document.getElementById('chatgpt-navigator-pin-btn');
    this.toggleButton = document.getElementById('chatgpt-navigator-toggle-btn');
    this.applyHeaderToolbarVisibility();
    this.updateScrollPinUI();
    this.updateScrollLockUI();
  }

  /**
   * Show or hide optional toolbar buttons from settings.
   */
  applyHeaderToolbarVisibility() {
    const showPin = !!this.settings.showPinButton;
    const showLock = !!this.settings.showScrollLockButton;
    const showOutline = this.settings.showOutline !== false;

    if (this.lockButton) this.lockButton.hidden = !showLock;
    if (this.pinButton) this.pinButton.hidden = !showPin;
    if (this.toggleButton) this.toggleButton.hidden = !showOutline;
    if (this.outline) this.outline.hidden = !showOutline;

    if (this.sidebar) {
      this.sidebar.classList.toggle('chatgpt-navigator-only-toggle', !showPin && !showLock);
      this.sidebar.classList.toggle('chatgpt-navigator-minimal', !showOutline);
    }

    if (!showPin) this.pinnedScroll = null;
    this.updateScrollPinUI();
    this.updateScrollLockUI();
  }

  /**
   * Resolve themeMode from storage (migrates legacy nightMode boolean).
   */
  _normalizeThemeMode(settings) {
    const mode = settings?.themeMode;
    if (mode === 'auto' || mode === 'light' || mode === 'dark') return mode;
    return settings?.nightMode ? 'dark' : 'light';
  }

  /**
   * Detect whether ChatGPT is in dark mode from the page DOM/CSS.
   */
  detectPageDarkMode() {
    const root = document.documentElement;
    if (root.classList.contains('dark') || root.getAttribute('data-theme') === 'dark') {
      return true;
    }
    if (root.classList.contains('light') || root.getAttribute('data-theme') === 'light') {
      return false;
    }

    const body = document.body;
    if (body) {
      if (body.classList.contains('dark') || body.getAttribute('data-theme') === 'dark') {
        return true;
      }
      if (body.classList.contains('light') || body.getAttribute('data-theme') === 'light') {
        return false;
      }
    }

    const colorScheme = getComputedStyle(root).colorScheme;
    if (colorScheme === 'dark') return true;
    if (colorScheme === 'light') return false;

    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  /**
   * Whether the sidebar should use night (dark) styling.
   */
  shouldUseNightMode() {
    const mode = this._normalizeThemeMode(this.settings);
    if (mode === 'dark') return true;
    if (mode === 'light') return false;
    return this.detectPageDarkMode();
  }

  /**
   * Apply night mode class from settings (sidebar panel only)
   */
  applySidebarTheme() {
    if (!this.sidebar) return;
    this.sidebar.classList.toggle('chatgpt-navigator-night', this.shouldUseNightMode());
  }

  /**
   * Watch ChatGPT theme changes when themeMode is auto.
   */
  setupThemeObserver() {
    const mode = this._normalizeThemeMode(this.settings);
    if (mode !== 'auto') {
      this._teardownThemeObserver();
      return;
    }

    if (!this._themeObserver) {
      // rAF-coalesce so a burst of attribute mutations in one frame results
      // in a single applySidebarTheme() call (which triggers a layout read
      // via getComputedStyle inside detectPageDarkMode).
      let themeUpdatePending = false;
      const scheduleThemeUpdate = () => {
        if (themeUpdatePending) return;
        themeUpdatePending = true;
        requestAnimationFrame(() => {
          themeUpdatePending = false;
          this.applySidebarTheme();
        });
      };
      this._themeObserver = new MutationObserver(scheduleThemeUpdate);
      // ChatGPT signals theme via class / data-theme. Inline `style` changes
      // are noisy and irrelevant to theme detection, so they're excluded.
      this._themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'data-theme']
      });
      if (document.body) {
        this._themeObserver.observe(document.body, {
          attributes: true,
          attributeFilter: ['class', 'data-theme']
        });
      }
    }

    if (!this._themeMediaQuery) {
      this._themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this._boundThemeMediaChange = () => {
        if (this._normalizeThemeMode(this.settings) === 'auto') {
          this.applySidebarTheme();
        }
      };
      this._themeMediaQuery.addEventListener('change', this._boundThemeMediaChange);
    }
  }

  _teardownThemeObserver() {
    if (this._themeObserver) {
      this._themeObserver.disconnect();
      this._themeObserver = null;
    }
    if (this._themeMediaQuery && this._boundThemeMediaChange) {
      this._themeMediaQuery.removeEventListener('change', this._boundThemeMediaChange);
      this._themeMediaQuery = null;
      this._boundThemeMediaChange = null;
    }
  }


  /**
   * Generate outline structure from ChatGPT messages
   */
  generateOutline() {
    try {
      this.outlineData = [];

      // Try multiple selectors to find messages (ChatGPT may change structure)
      const messageSelectors = [
        '[data-message-author-role]',
        '[class*="group"][class*="w-full"]',
        'div[class*="group"]:has(> div[class*="flex"])',
      ];

      let messages = [];

      for (const selector of messageSelectors) {
        try {
          messages = Array.from(document.querySelectorAll(selector));
          if (messages.length > 0) {
            this.logInfo(`Found ${messages.length} messages using selector: ${selector}`);
            break;
          }
        } catch (e) {
          // Some selectors might not be supported (e.g., :has())
          this.logWarning(`Selector not supported: ${selector}`);
        }
      }

      // Fallback: look for common message patterns
      if (messages.length === 0) {
        this.logWarning('Primary selectors failed, trying fallback patterns');
        // Look for elements that contain both user and assistant messages
        const containers = document.querySelectorAll('div[class*="group"], div[class*="message"]');
        messages = Array.from(containers).filter(el => {
          const text = el.textContent || '';
          return text.trim().length > 10; // Filter out empty containers
        });
        if (messages.length > 0) {
          this.logInfo(`Found ${messages.length} messages using fallback selectors`);
        }
      }

      if (messages.length === 0) {
        this.logWarning('No messages found. ChatGPT DOM structure may have changed.');
        this.renderOutline();
        return;
      }

      let currentQuestion = null;
      let questionCount = 0;
      let responseCount = 0;

      for (const messageEl of messages) {
        try {
          const role = this.getMessageRole(messageEl);
          const text = this.extractMessageText(messageEl);

          if (!text || text.trim().length === 0) continue;

          if (role === 'user') {
            // New question
            currentQuestion = {
              element: messageEl,
              text: this.truncateText(text, 60),
              fullText: text,
              responses: []
            };
            this.outlineData.push(currentQuestion);
            questionCount++;
          } else if (role === 'assistant' && currentQuestion) {
            // Response to current question - only keep the first one
            if (currentQuestion.responses.length === 0) {
              currentQuestion.responses.push({
                element: messageEl,
                text: this.truncateText(text, 50),
                fullText: text
              });
              responseCount++;
            }
          }
        } catch (e) {
          this.logError('Error processing message element', e);
        }
      }

      this.logInfo(`Generated outline: ${questionCount} questions, ${responseCount} responses`);
      this.renderOutline();

      // Show sidebar only when we have at least one question with at least one response
      this.checkAndShowSidebar();
    } catch (error) {
      this.logError('Failed to generate outline', error);
      // Still try to render empty outline
      this.renderOutline();
      this.checkAndShowSidebar();
    }
  }

  /**
   * Check if sidebar should be shown (has first Q&A pair) and show it
   */
  checkAndShowSidebar() {
    if (!this.sidebar) return;

    // Check if we have at least one question with at least one response
    const firstQuestion = this.outlineData[0];
    const hasFirstQAPair = firstQuestion &&
      firstQuestion.responses &&
      firstQuestion.responses.length > 0;

    // Check if the first response is still "loading" or "generating"
    // ChatGPT responses often have a class like 'result-streaming' while generating
    const firstResponseElement = hasFirstQAPair ? firstQuestion.responses[0].element : null;

    // Strict loading check: 
    // 1. Must have a markdown container (actual content)
    // 2. Must NOT be streaming
    // 3. Must NOT have a placeholder/loading state
    const hasContent = firstResponseElement && (
      firstResponseElement.querySelector('.markdown') ||
      firstResponseElement.getAttribute('data-message-content')
    );

    const isStillGenerating = firstResponseElement && (
      firstResponseElement.classList.contains('result-streaming') ||
      firstResponseElement.querySelector('.result-streaming') ||
      !hasContent
    );

    const showAlways = this.settings.showOutline === false;

    if ((hasFirstQAPair || showAlways) && !isStillGenerating && (this.sidebar.classList.contains('hidden') || this.sidebar.style.display === 'none')) {
      this.sidebar.style.display = 'flex';
      // Small delay to ensure display:flex is applied before removing hidden class for transition
      requestAnimationFrame(() => {
        this.sidebar.classList.remove('hidden');
      });
      this.logInfo(showAlways ? 'Outline disabled, showing icons' : 'First Q&A pair fully loaded, showing sidebar');
    } else if (!showAlways && (!hasFirstQAPair || isStillGenerating) && !this.sidebar.classList.contains('hidden')) {
      // Hide again if we lost the first Q&A pair or it's still generating
      this.sidebar.classList.add('hidden');
      // Set display:none after transition finishes (approx 300ms)
      setTimeout(() => {
        if (this.sidebar.classList.contains('hidden')) {
          this.sidebar.style.display = 'none';
        }
      }, 300);
    }
  }

  /**
   * Determine message role (user or assistant)
   */
  getMessageRole(element) {
    // Check data attribute
    const roleAttr = element.getAttribute('data-message-author-role');
    if (roleAttr === 'user' || roleAttr === 'assistant') {
      return roleAttr;
    }

    // Check for user indicators
    const userIndicators = [
      element.querySelector('[alt*="User"]'),
      element.querySelector('[class*="user"]'),
      element.querySelector('svg[class*="user"]'),
    ].filter(Boolean);

    if (userIndicators.length > 0) {
      return 'user';
    }

    // Check for assistant indicators
    const assistantIndicators = [
      element.querySelector('[alt*="ChatGPT"]'),
      element.querySelector('[alt*="Assistant"]'),
      element.querySelector('[class*="assistant"]'),
      element.querySelector('svg[class*="assistant"]'),
    ].filter(Boolean);

    if (assistantIndicators.length > 0) {
      return 'assistant';
    }

    // Heuristic: check text content position and styling
    // User messages often come first in a group, assistant messages after
    const parent = element.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children);
      const index = siblings.indexOf(element);
      // First message in group is often user, second is assistant
      return index === 0 ? 'user' : 'assistant';
    }

    // Default to assistant if uncertain
    return 'assistant';
  }

  /**
   * Extract text content from message element
   */
  extractMessageText(element) {
    // Try to find the main text content
    // ChatGPT typically has the text in specific containers
    const textSelectors = [
      '[data-message-content]',
      'div[class*="markdown"]',
      'div[class*="prose"]',
      'div[class*="message"]',
    ];

    for (const selector of textSelectors) {
      const textEl = element.querySelector(selector);
      if (textEl) {
        const text = textEl.textContent || textEl.innerText || '';
        if (text.trim().length > 0) {
          return text.trim();
        }
      }
    }

    // Fallback: get all text from element, but exclude UI elements
    const clone = element.cloneNode(true);
    // Remove buttons, icons, and other UI elements
    clone.querySelectorAll('button, svg, [class*="icon"], [class*="button"]').forEach(el => el.remove());
    return (clone.textContent || clone.innerText || '').trim();
  }

  /**
   * Truncate text to specified length
   */
  truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength).trim() + '...';
  }

  /**
   * Get max truncation length based on window width (narrower window = shorter text)
   * Uses window.innerWidth so resizing the browser actually changes truncation.
   */
  getMaxTruncateLength() {
    const w = window.innerWidth;
    const charsPerPx = 22; // ~60 chars at 1320px, ~30 at 660px, ~20 at 440px
    return Math.min(60, Math.max(15, Math.floor(w / charsPerPx)));
  }

  /**
   * Render outline HTML
   */
  renderOutline() {
    try {
      if (!this.outline) {
        this.logError('Outline element not found');
        return;
      }

      this.outline.textContent = '';

      if (this.outlineData.length === 0) {
        return;
      }

      let questionsToShow = this.outlineData;
      let startIndex = 0;
      if (this.settings.displayMode === 'limited') {
        const maxQuestions = this.settings.maxQuestions || 10;
        startIndex = Math.max(0, this.outlineData.length - maxQuestions);
        questionsToShow = this.outlineData.slice(startIndex);
      }

      // Cache the truncate length once per render (avoid reading window.innerWidth per item)
      const maxLen = this.getMaxTruncateLength();
      const combined = this.settings.combineQuestionResponse;
      const frag = document.createDocumentFragment();

      for (let i = 0; i < questionsToShow.length; i++) {
        const question = questionsToShow[i];
        const originalIndex = startIndex + i;

        if (combined) {
          const combinedItem = document.createElement('li');
          combinedItem.className = 'outline-item outline-item-question';
          combinedItem.dataset.index = originalIndex;
          combinedItem.dataset.type = 'combined';

          const questionText = document.createElement('span');
          questionText.className = 'outline-item-text';
          questionText.textContent = this.truncateText(question.fullText, maxLen);
          combinedItem.appendChild(questionText);

          if (question.responses.length > 0) {
            const responsePreview = document.createElement('span');
            responsePreview.className = 'outline-item-text outline-item-response-preview';
            responsePreview.textContent = this.truncateText(question.responses[0].fullText, maxLen);
            combinedItem.appendChild(responsePreview);
          }

          frag.appendChild(combinedItem);
        } else {
          const questionItem = document.createElement('li');
          questionItem.className = 'outline-item outline-item-question';
          questionItem.dataset.index = originalIndex;
          questionItem.dataset.type = 'question';

          const questionText = document.createElement('span');
          questionText.className = 'outline-item-text';
          questionText.textContent = this.truncateText(question.fullText, maxLen);
          questionItem.appendChild(questionText);

          frag.appendChild(questionItem);

          const responses = question.responses;
          for (let r = 0; r < responses.length; r++) {
            const response = responses[r];
            const responseItem = document.createElement('li');
            responseItem.className = 'outline-item outline-item-response';
            responseItem.dataset.index = `${originalIndex}-${r}`;
            responseItem.dataset.type = 'response';

            const responseText = document.createElement('span');
            responseText.className = 'outline-item-text';
            responseText.textContent = this.truncateText(response.fullText, maxLen);
            responseItem.appendChild(responseText);

            frag.appendChild(responseItem);
          }
        }
      }

      // Detaching the active item via re-render clears the highlight; keep refs consistent.
      this.activeItem = null;
      this.outline.appendChild(frag);
    } catch (error) {
      this.logError('Failed to render outline', error);
    }
  }

  /**
   * Resolve which message element an outline item points at.
   */
  _getTargetForOutlineItem(item) {
    if (!item) return null;
    const type = item.dataset.type;
    const indexStr = item.dataset.index;
    if (type === 'question' || type === 'combined') {
      const qIndex = parseInt(indexStr, 10);
      return this.outlineData[qIndex]?.element || null;
    }
    if (type === 'response') {
      const [qIndex, rIndex] = indexStr.split('-').map(Number);
      return this.outlineData[qIndex]?.responses[rIndex]?.element || null;
    }
    return null;
  }

  /**
   * Scroll to target element (fast 250ms smooth scroll)
   */
  scrollToElement(targetElement, outlineItem) {
    if (!targetElement) return;

    if (this.activeItem) this.activeItem.classList.remove('active');
    outlineItem.classList.add('active');
    this.activeItem = outlineItem;

    const duration = 250;
    const scrollParent = this._getScrollParent(targetElement);
    const offsetAbove = 30;
    this._scrollLockBypass = true;

    const finish = () => {
      if (this.scrollLockEnabled) this._captureScrollLockAnchor();
      this._scrollLockBypass = false;
      if (this.activeItem === outlineItem) {
        outlineItem.classList.remove('active');
        this.activeItem = null;
      }
    };

    if (scrollParent) {
      const startTop = scrollParent.scrollTop;
      if (this._nativeScrollIntoView) {
        this._nativeScrollIntoView.call(targetElement, { block: 'start', behavior: 'auto' });
      } else {
        targetElement.scrollIntoView({ block: 'start', behavior: 'auto' });
      }
      const endTop = Math.max(0, scrollParent.scrollTop - 37);
      scrollParent.scrollTop = startTop;
      const startTime = performance.now();
      const run = (now) => {
        const t = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 2);
        scrollParent.scrollTop = startTop + (endTop - startTop) * eased;
        if (t < 1) requestAnimationFrame(run);
        else finish();
      };
      requestAnimationFrame(run);
    } else {
      const startY = window.scrollY;
      const targetY = targetElement.getBoundingClientRect().top + startY - offsetAbove;
      const endY = Math.max(0, targetY);
      const startTime = performance.now();
      const run = (now) => {
        const t = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 2);
        window.scrollTo(0, startY + (endY - startY) * eased);
        if (t < 1) requestAnimationFrame(run);
        else finish();
      };
      requestAnimationFrame(run);
    }
  }

  _getScrollParent(el) {
    let parent = el.parentElement;
    while (parent) {
      const { overflowY } = getComputedStyle(parent);
      if (/(auto|scroll|overlay)/.test(overflowY) && parent.scrollHeight > parent.clientHeight) {
        return parent;
      }
      parent = parent.parentElement;
    }
    return null;
  }

  /**
   * Main scroll container for the chat transcript
   */
  _getChatScrollContainer() {
    const anchor = document.querySelector('[data-message-author-role]');
    if (anchor) {
      const parent = this._getScrollParent(anchor);
      if (parent) return parent;
    }
    const main = document.querySelector('main') || document.querySelector('[role="main"]');
    if (main) {
      const parent = this._getScrollParent(main);
      if (parent) return parent;
    }
    return null;
  }

  _getCurrentScrollState() {
    const container = this._getChatScrollContainer();
    if (container) {
      return { container, scrollTop: container.scrollTop };
    }
    return { container: null, scrollTop: window.scrollY };
  }

  _resolvePinnedContainer() {
    if (!this.pinnedScroll) return null;
    const { container } = this.pinnedScroll;
    if (container && container.isConnected) return container;
    return this._getChatScrollContainer();
  }

  pinScrollPosition() {
    this.pinnedScroll = this._getCurrentScrollState();
    this.updateScrollPinUI();
    this.logInfo('Pinned scroll position:', this.pinnedScroll.scrollTop);
  }

  restoreScrollPosition(instant = false) {
    if (!this.pinnedScroll) return;

    const container = this._resolvePinnedContainer();
    const targetTop = this.pinnedScroll.scrollTop;
    const duration = instant ? 50 : 250;
    this._scrollLockBypass = true;

    const finish = () => {
      if (this.scrollLockEnabled) this._captureScrollLockAnchor();
      this._scrollLockBypass = false;
    };

    if (container) {
      const startTop = container.scrollTop;
      const startTime = performance.now();
      const run = (now) => {
        const t = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 2);
        container.scrollTop = startTop + (targetTop - startTop) * eased;
        if (t < 1) requestAnimationFrame(run);
        else finish();
      };
      requestAnimationFrame(run);
    } else {
      const startY = window.scrollY;
      const startTime = performance.now();
      const run = (now) => {
        const t = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 2);
        window.scrollTo(0, startY + (targetTop - startY) * eased);
        if (t < 1) requestAnimationFrame(run);
        else finish();
      };
      requestAnimationFrame(run);
    }
  }

  _readScrollTop(container) {
    return container ? container.scrollTop : window.scrollY;
  }

  _writeScrollTop(container, top) {
    if (container) container.scrollTop = top;
    else window.scrollTo(0, top);
  }

  _captureScrollLockAnchor() {
    this.scrollLockContainer = this._getChatScrollContainer();
    this.scrollLockTop = this._readScrollTop(this.scrollLockContainer);
  }

  toggleScrollLock() {
    this.setScrollLock(!this.scrollLockEnabled);
  }

  setScrollLock(enabled) {
    if (enabled === this.scrollLockEnabled) {
      this.updateScrollLockUI();
      return;
    }

    this.scrollLockEnabled = enabled;

    // Persist the lock mode
    if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
      chrome.storage.sync.set({ scrollLockEnabled: enabled });
    }

    if (enabled) {
      this._captureScrollLockAnchor();
      this._attachScrollLockListeners();
      this._enableScrollIntoViewBlock();
      this.logInfo('Scroll lock enabled at', this.scrollLockTop);
    } else {
      this._detachScrollLockListeners();
      this._disableScrollIntoViewBlock();
      this.logInfo('Scroll lock disabled');
    }

    this.updateScrollLockUI();
  }

  updateScrollLockUI() {
    if (!this.lockButton) return;
    this.lockButton.classList.toggle('active', !!this.scrollLockEnabled);
  }

  _markScrollLockUserIntent(duration = 1000) {
    if (!this.scrollLockEnabled) return;
    this._scrollLockUserIntent = true;
    clearTimeout(this._scrollLockUserIntentTimer);
    this._scrollLockUserIntentTimer = setTimeout(() => {
      this._scrollLockUserIntent = false;
    }, duration);
  }

  _clearScrollLockUserIntent() {
    clearTimeout(this._scrollLockUserIntentTimer);
    this._scrollLockUserIntentTimer = null;
    this._scrollLockUserIntent = false;
  }

  /**
   * Mark that a prompt was just submitted. During this window we force-ignore
   * the user-intent flag so ChatGPT's post-submit scroll-to-bottom (and the
   * follow-up scroll-to-bottom from the first streamed tokens) cannot move
   * the lock anchor. Without this, a "typed-then-clicked-Send" sequence
   * leaves user-intent=true for ~1s and the scroll handler updates
   * scrollLockTop to the new bottom instead of restoring.
   */
  _markScrollLockSubmission(duration = 1500) {
    if (!this.scrollLockEnabled) return;
    this._clearScrollLockUserIntent();
    this._scrollLockPostSubmitUntil = performance.now() + duration;
  }

  _inPostSubmitWindow() {
    return this._scrollLockPostSubmitUntil > performance.now();
  }

  _onScrollLockKeyDown(e) {
    if (!this.scrollLockEnabled) return;

    // If typing in an input or textarea, treat as user intent to allow natural auto-scroll
    const target = e.target;
    const isInput = target && (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable ||
      target.getAttribute('role') === 'textbox'
    );

    if (isInput) {
      // Submission keys: Enter (without Shift), Cmd+Enter, Ctrl+Enter
      const isSubmission = e.key === 'Enter' && (!e.shiftKey || e.metaKey || e.ctrlKey);
      if (isSubmission) {
        // Drop any lingering typing intent and start a post-submit window so
        // ChatGPT's auto-scroll-to-bottom after submit can't reset the anchor.
        this._markScrollLockSubmission();
      } else {
        this._markScrollLockUserIntent();
      }
      return;
    }

    const scrollKeys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Enter'];
    if (scrollKeys.includes(e.key)) {
      // For navigation keys like Enter or Arrows, give a bit more time for any 
      // resulting programmatic scrolls to finish.
      this._markScrollLockUserIntent(1000);
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'g')) {
      // Common search shortcuts - give much more time as the user might be 
      // interacting with browser search UI for a while.
      this._markScrollLockUserIntent(10000);
    }
  }

  _onScrollLockScroll() {
    if (!this.scrollLockEnabled || this._scrollLockBypass || this._scrollLockRestoring) return;

    const container = this.scrollLockContainer?.isConnected
      ? this.scrollLockContainer
      : this._getChatScrollContainer();
    this.scrollLockContainer = container;
    const top = this._readScrollTop(container);

    const inPostSubmit = this._inPostSubmitWindow();

    // Upward scrolls always reflect the user (or our own restoration); follow them.
    if (top < this.scrollLockTop - 1) {
      this.scrollLockTop = top;
      return;
    }

    // Honor user intent only when we're NOT in a post-submit window. Otherwise
    // a lingering typing-intent flag would let ChatGPT's auto-scroll-to-bottom
    // after submit move the anchor.
    if (this._scrollLockUserIntent && !inPostSubmit) {
      this.scrollLockTop = top;
      return;
    }

    if (top > this.scrollLockTop + 1) {
      this._scrollLockRestoring = true;
      this._writeScrollTop(container, this.scrollLockTop);
      requestAnimationFrame(() => {
        this._scrollLockRestoring = false;
      });
    }
  }

  _scheduleScrollLockEnforce() {
    if (!this.scrollLockEnabled || this._scrollLockEnforceQueued) return;
    this._scrollLockEnforceQueued = true;
    requestAnimationFrame(() => {
      this._scrollLockEnforceQueued = false;
      this._enforceScrollLock();
    });
  }

  _enforceScrollLock() {
    if (!this.scrollLockEnabled || this._scrollLockBypass || this._scrollLockRestoring) return;

    const container = this.scrollLockContainer?.isConnected
      ? this.scrollLockContainer
      : this._getChatScrollContainer();
    this.scrollLockContainer = container;
    const top = this._readScrollTop(container);

    if (this._scrollLockUserIntent && !this._inPostSubmitWindow()) {
      this.scrollLockTop = top;
      return;
    }

    if (top > this.scrollLockTop + 1) {
      this._scrollLockRestoring = true;
      this._writeScrollTop(container, this.scrollLockTop);
      requestAnimationFrame(() => {
        this._scrollLockRestoring = false;
      });
    }
  }

  _isSubmitButton(el) {
    if (!el) return false;

    // Model switchers and other dropdowns should NEVER be treated as submit buttons
    if (el.getAttribute('aria-haspopup') || el.getAttribute('aria-controls')) return false;

    // Stop-generation button is NOT a submit; treating it as one would clear
    // intent and let the scroll-anchor drift while streaming.
    const stopTestIds = new Set(['stop-button', 'composer-stop-button', 'fruitjuice-stop-button']);
    const elTestId = el.getAttribute('data-testid');
    if (elTestId && stopTestIds.has(elTestId)) return false;
    const elAria = (el.getAttribute('aria-label') || '').toLowerCase();
    if (elAria.includes('stop generating') || elAria === 'stop') return false;

    // Check common ChatGPT submit button attributes
    if (elTestId === 'send-button' || elTestId === 'fruitjuice-send-button') return true;

    // Use more specific matching for "send" to avoid catching "send feedback" etc.
    if (elAria === 'send prompt' || elAria === 'send message' || elAria === 'send') return true;
    if (elAria.includes('submit')) return true;

    const title = (el.getAttribute('title') || '').toLowerCase();
    if (title === 'send prompt' || title === 'send message' || title === 'send') return true;

    if (el.type === 'submit') return true;
    
    // Check if it contains a send icon (common in ChatGPT)
    const svg = el.querySelector('svg');
    if (svg) {
      const paths = Array.from(svg.querySelectorAll('path'));
      // This specific path is very common for the ChatGPT send icon
      if (paths.some(p => p.getAttribute('d')?.includes('M15.1,12.1L12.9,14.3'))) return true;
    }
    
    // Check if it's the primary button in the composer form
    const form = el.closest('form');
    if (form) {
      const composer = form.querySelector('[data-testid="composer-textarea"]');
      if (composer && form.contains(el)) {
        // In the composer form, the main button is usually the send button
        // especially if it's positioned at the bottom right
        const rect = el.getBoundingClientRect();
        const formRect = form.getBoundingClientRect();
        // Send button is almost always in the bottom right of the form
        if (rect.right > formRect.right - 50 && rect.bottom > formRect.bottom - 50) return true;
      }
    }
    
    return false;
  }

  _attachScrollLockListeners() {
    if (this._scrollLockListenersAttached) return;

    this._boundScrollLockScroll = () => this._onScrollLockScroll();
    this._boundScrollLockUserInput = () => this._markScrollLockUserIntent();
    this._boundScrollLockKeyDown = (e) => this._onScrollLockKeyDown(e);
    this._boundScrollLockPointerDown = (e) => {
      const target = e.target;
      if (!target || !(target instanceof Element)) return;

      // Don't mark intent if clicking our own sidebar
      if (this.sidebar && (this.sidebar === target || this.sidebar.contains(target))) {
        return;
      }

      const btn = target.closest('button, [role="button"], a');
      if (btn) {
        // Only clear intent if it's likely the "Send" button.
        // Other buttons (like search results, navigation links, etc.) should
        // be treated as user intent to scroll.
        if (this._isSubmitButton(btn)) {
          this._markScrollLockSubmission();
        } else {
          this._markScrollLockUserIntent();
        }
        return;
      }

      if (target.closest('input, textarea, [contenteditable="true"]')) {
        return;
      }

      this._markScrollLockUserIntent();
    };

    const container = this._getChatScrollContainer();
    this.scrollLockContainer = container;
    if (container) {
      container.addEventListener('scroll', this._boundScrollLockScroll, { passive: true });
    } else {
      window.addEventListener('scroll', this._boundScrollLockScroll, { passive: true });
    }

    // pointerdown must live on document (capture) so we catch clicks on the
    // Send button, which lives in the fixed composer outside the chat scroll
    // container. Previously it was attached to the container only, so a
    // mouse-submitted prompt left user-intent=true from typing and the
    // resulting auto-scroll-to-bottom updated scrollLockTop instead of
    // being restored.
    document.addEventListener('pointerdown', this._boundScrollLockPointerDown, { passive: true, capture: true });
    document.addEventListener('wheel', this._boundScrollLockUserInput, { passive: true, capture: true });
    document.addEventListener('touchstart', this._boundScrollLockUserInput, { passive: true, capture: true });
    document.addEventListener('keydown', this._boundScrollLockKeyDown, true);
    this._scrollLockListenersAttached = true;
  }

  _detachScrollLockListeners() {
    if (!this._scrollLockListenersAttached) return;

    const container = this.scrollLockContainer;
    if (container) {
      container.removeEventListener('scroll', this._boundScrollLockScroll);
    } else {
      window.removeEventListener('scroll', this._boundScrollLockScroll);
    }

    document.removeEventListener('pointerdown', this._boundScrollLockPointerDown, true);
    document.removeEventListener('wheel', this._boundScrollLockUserInput, true);
    document.removeEventListener('touchstart', this._boundScrollLockUserInput, true);
    document.removeEventListener('keydown', this._boundScrollLockKeyDown, true);
    clearTimeout(this._scrollLockUserIntentTimer);
    this._scrollLockUserIntent = false;
    this._scrollLockPostSubmitUntil = 0;
    this._scrollLockListenersAttached = false;
  }

  _enableScrollIntoViewBlock() {
    if (this._scrollIntoViewPatched) return;
    const native = Element.prototype.scrollIntoView;
    this._nativeScrollIntoView = native;
    const self = this;
    Element.prototype.scrollIntoView = function scrollIntoViewWithLock(...args) {
      if (self.scrollLockEnabled && !self._scrollLockBypass) return;
      return native.apply(this, args);
    };
    this._scrollIntoViewPatched = true;
  }

  _disableScrollIntoViewBlock() {
    if (!this._scrollIntoViewPatched || !this._nativeScrollIntoView) return;
    Element.prototype.scrollIntoView = this._nativeScrollIntoView;
    this._scrollIntoViewPatched = false;
  }

  updateScrollPinUI() {
    if (!this.pinButton) return;
    const hasPin = this.pinnedScroll != null;
    this.pinButton.classList.toggle('pinned', hasPin);
    this.pinButton.title = hasPin ? 'Jump back to pinned position' : 'Pin scroll position';

    // Update the SVG path for hole size
    const path = this.pinButton.querySelector('path');
    if (path) {
      if (hasPin) {
        // Large hole (radius 4) for filled/active state
        path.setAttribute('d', 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z M16 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z');
      } else {
        // Small hole (radius 3) for outlined/inactive state
        path.setAttribute('d', 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z');
      }
    }
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    if (this.lockButton) {
      this.lockButton.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleScrollLock();
      });
    }

    if (this.pinButton) {
      this.pinButton.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.pinnedScroll) {
          this.restoreScrollPosition(true); // true for instant jump
          this.pinnedScroll = null;
          this.updateScrollPinUI();
        } else {
          this.pinScrollPosition();
        }
      });
    }

    if (this.toggleButton) {
      this.toggleButton.addEventListener('click', () => this.toggleExpand());
    }

    // Single delegated click handler for all outline items. Avoids attaching
    // one listener per item on every renderOutline() call.
    if (this.outline) {
      this._boundOutlineClick = (e) => {
        const item = e.target.closest('.outline-item');
        if (!item || !this.outline.contains(item)) return;
        e.stopPropagation();
        const target = this._getTargetForOutlineItem(item);
        if (target) {
          try {
            this.scrollToElement(target, item);
          } catch (err) {
            this.logError('Error scrolling from outline click', err);
          }
        }
      };
      this.outline.addEventListener('click', this._boundOutlineClick);
    }

    this._boundResize = () => {
      clearTimeout(this.resizeDebounceTimer);
      this.resizeDebounceTimer = setTimeout(() => {
        if (this.outlineData.length > 0) this.renderOutline();
      }, 150);
    };
    window.addEventListener('resize', this._boundResize);

    this._boundKeyDown = (e) => this.handleKeyDown(e);
    document.addEventListener('keydown', this._boundKeyDown, true);
  }

  /**
   * Handle keydown events for navigation shortcuts
   */
  handleKeyDown(e) {
    // Option + Arrow Up/Down
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      if (!this.outlineData || this.outlineData.length === 0) return;

      e.preventDefault();
      e.stopPropagation();

      const direction = e.key === 'ArrowUp' ? -1 : 1;
      this.navigateOutline(direction);
    }
  }

  /**
   * Navigate to the next/previous item in the outline
   */
  navigateOutline(direction) {
    const items = Array.from(this.outline.querySelectorAll('.outline-item'));
    if (items.length === 0) return;

    let nextIndex = 0;

    // If there's an active item, find its index and move from there
    if (this.activeItem) {
      const currentIndex = items.indexOf(this.activeItem);
      if (currentIndex !== -1) {
        nextIndex = currentIndex + direction;
      }
    } else if (direction === -1) {
      // If no active item and going up, start from the last item
      nextIndex = items.length - 1;
    }

    // Boundary checks
    if (nextIndex < 0) nextIndex = 0;
    if (nextIndex >= items.length) nextIndex = items.length - 1;

    const nextItem = items[nextIndex];
    if (nextItem) {
      const targetElement = this._getTargetForOutlineItem(nextItem);
      if (targetElement) {
        this.scrollToElement(targetElement, nextItem);
      }
    }
  }

  /**
   * Toggle sidebar expand/collapse
   */
  toggleExpand() {
    this.isExpanded = !this.isExpanded;

    if (this.sidebar) {
      if (this.isExpanded) {
        this.sidebar.classList.remove('collapsed');
      } else {
        this.sidebar.classList.add('collapsed');
      }
      if (this.outlineData.length > 0) this.renderOutline();
    }
  }

  /**
   * Observe DOM changes to update outline
   */
  observeChanges() {
    try {
      if (this.observer) {
        this.observer.disconnect();
      }

      const runUpdate = () => {
        try {
          this.generateOutline();
        } catch (error) {
          this.logError('Error in outline update observer', error);
        }
      };

      this.observer = new MutationObserver(() => {
        if (this.scrollLockEnabled) {
          this._scheduleScrollLockEnforce();
        }

        // Shorter debounce while the sidebar hasn't appeared yet so it shows
        // up quickly; longer debounce afterwards to avoid re-rendering on
        // every streaming chunk.
        const delay = this.sidebar?.classList.contains('hidden') ? 150 : 500;
        clearTimeout(this.updateDebounceTimer);
        this.updateDebounceTimer = setTimeout(runUpdate, delay);
      });

      // Observe the main content area
      const mainContent = document.querySelector('main') ||
        document.querySelector('[role="main"]') ||
        document.body;

      if (mainContent) {
        this.observer.observe(mainContent, {
          childList: true,
          subtree: true,
          characterData: true
        });
        this.logInfo('Started observing DOM changes');
      } else {
        this.logWarning('Main content area not found for observation');
      }
    } catch (error) {
      this.logError('Failed to set up DOM observer', error);
    }
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.observer) {
      this.observer.disconnect();
    }
    if (this.updateDebounceTimer) {
      clearTimeout(this.updateDebounceTimer);
    }
    if (this.resizeDebounceTimer) {
      clearTimeout(this.resizeDebounceTimer);
    }
    if (this._boundResize) {
      window.removeEventListener('resize', this._boundResize);
    }
    if (this._boundKeyDown) {
      document.removeEventListener('keydown', this._boundKeyDown, true);
    }
    if (this._boundOutlineClick && this.outline) {
      this.outline.removeEventListener('click', this._boundOutlineClick);
    }
    if (this._boundMessageListener && typeof chrome !== 'undefined' && chrome.runtime?.id && chrome.runtime.onMessage) {
      try {
        chrome.runtime.onMessage.removeListener(this._boundMessageListener);
      } catch (e) {
        // Extension context may already be invalidated; ignore.
      }
    }
    if (this.scrollLockEnabled) {
      this.setScrollLock(false);
    }
    this._teardownThemeObserver();
    if (this.sidebar) {
      this.sidebar.remove();
    }
    this.pinnedScroll = null;
  }
}

// Export for use in content script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChatGPTNavigator;
}
