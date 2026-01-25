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
    this.updateDebounceTimer = null;
    this.observer = null;
    this.logPrefix = '[ChatGPT Navigator]';
    this.settings = {
      combineQuestionResponse: false,
      displayMode: 'all',
      maxQuestions: 10
    };
  }

  /**
   * Log error with consistent prefix
   */
  logError(message, error = null) {
    console.error(`${this.logPrefix} ${message}`, error || '');
    if (error && error.stack) {
      console.error(`${this.logPrefix} Stack trace:`, error.stack);
    }
  }

  /**
   * Log warning with consistent prefix
   */
  logWarning(message) {
    console.warn(`${this.logPrefix} ${message}`);
  }

  /**
   * Log info with consistent prefix
   */
  logInfo(message) {
    console.log(`${this.logPrefix} ${message}`);
  }

  /**
   * Load settings from storage
   */
  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get({
        combineQuestionResponse: false,
        displayMode: 'all',
        maxQuestions: 10
      });
      this.settings = result;
      this.logInfo('Settings loaded:', this.settings);
    } catch (error) {
      this.logError('Error loading settings', error);
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
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
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
    } catch (error) {
      this.logError('Failed to generate outline', error);
      // Still try to render empty outline
      this.renderOutline();
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
            questionText.textContent = question.text;
            combinedItem.appendChild(questionText);

            // Add response preview if available
            if (question.responses.length > 0) {
              const responsePreview = document.createElement('span');
              responsePreview.className = 'outline-item-text outline-item-response-preview';
              responsePreview.textContent = question.responses[0].text;
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
            questionText.textContent = question.text;
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
                responseText.textContent = response.text;
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
   * Scroll to target element
   */
  scrollToElement(targetElement, outlineItem) {
    if (!targetElement) return;

    // Remove previous active state
    if (this.activeItem) {
      this.activeItem.classList.remove('active');
    }

    // Add active state to clicked item
    outlineItem.classList.add('active');
    this.activeItem = outlineItem;

    // Scroll to element
    targetElement.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
      inline: 'nearest'
    });

    // Remove active state after scroll completes (faster fade out)
    setTimeout(() => {
      if (this.activeItem === outlineItem) {
        outlineItem.classList.remove('active');
        this.activeItem = null;
      }
    }, 500);
  }


  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Toggle button for expand/collapse
    if (this.toggleButton) {
      this.toggleButton.addEventListener('click', () => this.toggleExpand());
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
        // Debounce updates
        clearTimeout(this.updateDebounceTimer);
        this.updateDebounceTimer = setTimeout(() => {
          try {
            this.generateOutline();
          } catch (error) {
            this.logError('Error in outline update observer', error);
          }
        }, 500);
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
    if (this.sidebar) {
      this.sidebar.remove();
    }
  }
}

// Export for use in content script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChatGPTNavigator;
}
