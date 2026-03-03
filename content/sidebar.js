/**
 * ChatGPT Navigator Sidebar
 * Handles outline generation, rendering, and navigation
 */

class ChatGPTNavigator {
  constructor() {
    this.sidebar = null;
    this.outline = null;
    this.toggleButton = null;
    this.isExpanded = true;
    this.outlineData = [];
    this.activeItem = null;
    this.debug = false;
    this.updateDebounceTimer = null;
    this.updateDebounceTimerFast = null;
    this.resizeDebounceTimer = null;
    this.observer = null;
    this.logPrefix = '[ChatGPT Navigator]';
    this.settings = {
      combineQuestionResponse: false,
      displayMode: 'all',
      maxQuestions: 10
    };
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
      displayMode: 'all',
      maxQuestions: 10
    };
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
        this.settings = { ...defaults };
        return;
      }
      const result = await chrome.storage.sync.get(defaults);
      this.settings = result;
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
    if (typeof chrome !== 'undefined' && chrome.runtime?.id && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'reloadSettings') {
          this.loadSettings().then(() => {
            this.generateOutline();
            sendResponse({ success: true });
          });
          return true; // Keep channel open for async response
        }
      });
    }
  }

  /**
   * Create the sidebar DOM structure
   */
  createSidebar() {
    // Remove existing sidebar if present
    const existing = document.getElementById('chatgpt-navigator-sidebar');
    if (existing) {
      existing.remove();
    }

    this.sidebar = document.createElement('div');
    this.sidebar.id = 'chatgpt-navigator-sidebar';
    // Initially hide the sidebar until first Q&A pair is ready
    this.sidebar.classList.add('hidden');

    this.sidebar.innerHTML = `
      <div id="chatgpt-navigator-header">
        <button id="chatgpt-navigator-toggle-btn" aria-label="Toggle sidebar">
          <svg id="chatgpt-navigator-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
      </div>
      <ul id="chatgpt-navigator-outline"></ul>
    `;

    document.body.appendChild(this.sidebar);
    this.outline = document.getElementById('chatgpt-navigator-outline');
    this.toggleButton = document.getElementById('chatgpt-navigator-toggle-btn');
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
            // Response to current question
            currentQuestion.responses.push({
              element: messageEl,
              text: this.truncateText(text, 50),
              fullText: text
            });
            responseCount++;
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
    const hasFirstQAPair = this.outlineData.length > 0 &&
      this.outlineData[0] &&
      this.outlineData[0].responses &&
      this.outlineData[0].responses.length > 0;

    if (hasFirstQAPair && this.sidebar.classList.contains('hidden')) {
      this.sidebar.classList.remove('hidden');
      this.logInfo('First Q&A pair detected, showing sidebar');
    } else if (!hasFirstQAPair && !this.sidebar.classList.contains('hidden')) {
      // Hide again if we lost the first Q&A pair (e.g., on new chat)
      this.sidebar.classList.add('hidden');
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

      this.outline.innerHTML = '';

      if (this.outlineData.length === 0) {
        // Don't show "no messages found" text - just leave it empty
        return;
      }

      // Apply display limit if enabled (show most recent questions)
      let questionsToShow = this.outlineData;
      let startIndex = 0;
      if (this.settings.displayMode === 'limited') {
        const maxQuestions = this.settings.maxQuestions || 10;
        // Show the most recent questions (last N items)
        startIndex = Math.max(0, this.outlineData.length - maxQuestions);
        questionsToShow = this.outlineData.slice(startIndex);
      }

      questionsToShow.forEach((question, relativeIndex) => {
        try {
          // Calculate original index in outlineData
          const originalIndex = startIndex + relativeIndex;

          if (this.settings.combineQuestionResponse) {
            // Combined mode: single clickable item for question + response
            const combinedItem = document.createElement('li');
            combinedItem.className = 'outline-item outline-item-question';
            combinedItem.dataset.index = originalIndex;
            combinedItem.dataset.type = 'combined';

            const questionText = document.createElement('span');
            questionText.className = 'outline-item-text';
            questionText.textContent = this.truncateText(question.fullText, this.getMaxTruncateLength());
            combinedItem.appendChild(questionText);

            // Add response preview if available
            if (question.responses.length > 0) {
              const responsePreview = document.createElement('span');
              responsePreview.className = 'outline-item-text outline-item-response-preview';
              responsePreview.textContent = this.truncateText(question.responses[0].fullText, this.getMaxTruncateLength());
              combinedItem.appendChild(responsePreview);
            }

            combinedItem.addEventListener('click', (e) => {
              e.stopPropagation();
              try {
                this.scrollToElement(question.element, combinedItem);
              } catch (err) {
                this.logError('Error scrolling to question', err);
              }
            });

            this.outline.appendChild(combinedItem);
          } else {
            // Separate mode: question and responses as separate items
            // Question item
            const questionItem = document.createElement('li');
            questionItem.className = 'outline-item outline-item-question';
            questionItem.dataset.index = originalIndex;
            questionItem.dataset.type = 'question';

            const questionText = document.createElement('span');
            questionText.className = 'outline-item-text';
            questionText.textContent = this.truncateText(question.fullText, this.getMaxTruncateLength());
            questionItem.appendChild(questionText);

            questionItem.addEventListener('click', (e) => {
              e.stopPropagation();
              try {
                this.scrollToElement(question.element, questionItem);
              } catch (err) {
                this.logError('Error scrolling to question', err);
              }
            });

            this.outline.appendChild(questionItem);

            // Response items
            question.responses.forEach((response, rIndex) => {
              try {
                const responseItem = document.createElement('li');
                responseItem.className = 'outline-item outline-item-response';
                responseItem.dataset.index = `${originalIndex}-${rIndex}`;
                responseItem.dataset.type = 'response';

                const responseText = document.createElement('span');
                responseText.className = 'outline-item-text';
                responseText.textContent = this.truncateText(response.fullText, this.getMaxTruncateLength());
                responseItem.appendChild(responseText);

                responseItem.addEventListener('click', (e) => {
                  e.stopPropagation();
                  try {
                    this.scrollToElement(response.element, responseItem);
                  } catch (err) {
                    this.logError('Error scrolling to response', err);
                  }
                });

                this.outline.appendChild(responseItem);
              } catch (err) {
                this.logError(`Error rendering response ${rIndex}`, err);
              }
            });
          }
        } catch (err) {
          this.logError(`Error rendering question ${qIndex}`, err);
        }
      });
    } catch (error) {
      this.logError('Failed to render outline', error);
    }
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

    const offsetAbove = 30; /* 10px more above than default (20px) */

    if (scrollParent) {
      const startTop = scrollParent.scrollTop;
      targetElement.scrollIntoView({ block: 'start', behavior: 'auto' });
      const endTop = Math.max(0, scrollParent.scrollTop - 37);
      scrollParent.scrollTop = startTop;
      const startTime = performance.now();
      const run = (now) => {
        const t = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 2);
        scrollParent.scrollTop = startTop + (endTop - startTop) * eased;
        if (t < 1) requestAnimationFrame(run);
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
      };
      requestAnimationFrame(run);
    }

    setTimeout(() => {
      if (this.activeItem === outlineItem) {
        outlineItem.classList.remove('active');
        this.activeItem = null;
      }
    }, duration + 50);
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
   * Attach event listeners
   */
  attachEventListeners() {
    // Toggle button for expand/collapse
    if (this.toggleButton) {
      this.toggleButton.addEventListener('click', () => this.toggleExpand());
    }

    // Re-render outline on resize so truncation adapts to width
    this._boundResize = () => {
      clearTimeout(this.resizeDebounceTimer);
      this.resizeDebounceTimer = setTimeout(() => {
        if (this.outlineData.length > 0) this.renderOutline();
      }, 150);
    };
    window.addEventListener('resize', this._boundResize);

    // Option + Arrow shortcuts for navigation
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
      // Find the corresponding element in the DOM
      const type = nextItem.dataset.type;
      const indexStr = nextItem.dataset.index;
      
      let targetElement = null;
      if (type === 'question' || type === 'combined') {
        const qIndex = parseInt(indexStr);
        targetElement = this.outlineData[qIndex]?.element;
      } else if (type === 'response') {
        const [qIndex, rIndex] = indexStr.split('-').map(Number);
        targetElement = this.outlineData[qIndex]?.responses[rIndex]?.element;
      }

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

      this.observer = new MutationObserver(() => {
        const runUpdate = () => {
          try {
            this.generateOutline();
          } catch (error) {
            this.logError('Error in outline update observer', error);
          }
        };
        // When nav is still hidden: short debounce (500ms) so we show as soon as content appears
        if (this.sidebar?.classList.contains('hidden')) {
          clearTimeout(this.updateDebounceTimerFast);
          this.updateDebounceTimerFast = setTimeout(runUpdate, 500);
        }
        // Always schedule full debounce (500ms) for stable updates; avoids thrashing while streaming when visible
        clearTimeout(this.updateDebounceTimer);
        this.updateDebounceTimer = setTimeout(runUpdate, 500);
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
    if (this.updateDebounceTimerFast) {
      clearTimeout(this.updateDebounceTimerFast);
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
    if (this.sidebar) {
      this.sidebar.remove();
    }
  }
}

// Export for use in content script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChatGPTNavigator;
}
