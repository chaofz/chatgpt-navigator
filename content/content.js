/**
 * ChatGPT Navigator Content Script
 * Main entry point for the extension
 */

(function () {
  'use strict';

  const DEBUG = false;
  let navigatorInstance = null;
  let initTimer = null;

  // --- ChatGPT Toolkit Logic (URL hash parameters) ---
  let toolkitDebug = true;
  const ContentUtils = window.ChatGPTToolkitContentUtils;

  let toolkitPrompt = "";
  let toolkitAutoSubmit = false;
  let modelIntent = "keep";
  let toolkitThink = false;
  let toolkitThinkSpecified = false;
  let extendedThink = false;
  let extendedThinkSpecified = false;
  let modelVerboseDebug = false;
  let modelPreferenceRequired = false;
  let modelPreferenceDone = true;
  let modelPreferenceInProgress = false;
  let modelPreferenceAttempts = 0;
  let modelPreferenceWaitLogTs = 0;
  const MAX_MODEL_PREFERENCE_ATTEMPTS = 200;

  function toolkitDelay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function modelLog(...args) {
    if (!toolkitDebug && !modelVerboseDebug) return;
    console.log("[ChatGPTToolkit][model]", ...args);
  }

  function modelTrace(...args) {
    if (!modelVerboseDebug) return;
    console.log("[ChatGPTToolkit][model][trace]", ...args);
  }

  function clearHash() {
    if (history.replaceState) {
      history.replaceState(null, document.title, window.location.pathname + window.location.search);
    } else {
      window.location.hash = "";
    }
  }

  function parseHashParams() {
    const hash = location.hash.substring(1);
    if (!hash) return false;

    if (!ContentUtils) {
      console.error("[ChatGPTToolkit] Missing ContentUtils; check manifest.json script order.");
      return false;
    }

    const parsed = ContentUtils.parseToolkitHash(hash, location.search);
    toolkitPrompt = parsed.prompt || "";
    toolkitAutoSubmit = !!parsed.autoSubmit;
    modelIntent = parsed.modelIntent || "keep";
    toolkitThink = !!parsed.think;
    toolkitThinkSpecified = !!parsed.thinkSpecified;
    extendedThink = !!parsed.extendedThink;
    extendedThinkSpecified = !!parsed.extendedThinkSpecified;
    modelVerboseDebug = !!parsed.debugModel;

    modelPreferenceRequired = modelIntent !== "keep";
    modelPreferenceDone = !modelPreferenceRequired;
    modelPreferenceInProgress = false;
    modelPreferenceAttempts = 0;
    modelPreferenceWaitLogTs = 0;

    if (toolkitDebug) console.log("hash: ", hash);
    if (toolkitDebug) console.log("prompt: ", toolkitPrompt);
    if (toolkitDebug) console.log("autoSubmit: ", toolkitAutoSubmit);
    modelLog("intent:", modelIntent, {
      toolkitThink,
      toolkitThinkSpecified,
      extendedThink,
      extendedThinkSpecified,
      modelVerboseDebug,
    });

    return !!toolkitPrompt || modelPreferenceRequired;
  }

  function fillContentEditableWithParagraphs(target, text) {
    if (!target) return;
    const lines = (text || "").split("\n");
    target.innerHTML = "";
    lines.forEach((line) => {
      const paragraph = document.createElement("p");
      paragraph.innerText = line;
      target.appendChild(paragraph);
    });
  }

  function setChatGPTPromptEditor(editorDiv, promptText) {
    if (!editorDiv) return;
    fillContentEditableWithParagraphs(editorDiv, promptText);
    editorDiv.dispatchEvent(new Event("input", { bubbles: true }));
    editorDiv.focus();
  }

  function normalizeText(value) {
    return (value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function isElementVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function collectVisibleMenuActionElements() {
    const menuRoots = [
      ...document.querySelectorAll("[role=\"menu\"], [data-radix-menu-content], [data-radix-popper-content-wrapper]"),
    ].filter(isElementVisible);

    if (menuRoots.length === 0) return [];

    const elements = [];
    menuRoots.forEach((root) => {
      elements.push(...root.querySelectorAll("button, [role=\"menuitem\"], [role=\"menuitemradio\"], [data-radix-collection-item]"));
    });
    return elements.filter(isElementVisible);
  }

  function findElementByTextTokens(elements, includeTokens, excludeTokens = []) {
    return elements.find((element) => {
      const text = normalizeText(
        `${element.innerText || element.textContent || ""} ${element.getAttribute("aria-label") || ""}`
      );
      if (!text) return false;
      if (!includeTokens.some((token) => text.includes(token))) return false;
      if (excludeTokens.some((token) => text.includes(token))) return false;
      return true;
    });
  }

  function getModelSwitcherButton() {
    const selectors = [
      "button[data-testid=\"model-switcher-dropdown-button\"]",
      "button[aria-label*=\"模型选择器\"]",
      "button[aria-label*=\"model switcher\"]",
      "button[aria-label*=\"切换模型\"]",
      "button[aria-label*=\"switch model\"]",
    ];
    for (const selector of selectors) {
      const candidates = [...document.querySelectorAll(selector)].filter(isElementVisible);
      if (candidates.length > 0) return candidates[0];
    }
    return null;
  }

  function isModelMenuOpenByButtonState(button) {
    if (!button) return false;
    return button.getAttribute("aria-expanded") === "true" || button.getAttribute("data-state") === "open";
  }

  function getCurrentChatGPTModelMode() {
    const switcher = getModelSwitcherButton();
    if (!switcher) return "unknown";

    const text = normalizeText(
      `${switcher.getAttribute("aria-label") || ""} ${switcher.innerText || switcher.textContent || ""}`
    );
    if (text.includes("instant")) return "instant";
    if (text.includes("thinking") || text.includes("思考")) return "thinking";
    return "auto";
  }

  async function openModelSwitcherMenu() {
    const switcher = getModelSwitcherButton();
    if (!switcher) {
      modelLog("cannot open model menu: switcher button not found");
      return false;
    }

    if (isModelMenuOpenByButtonState(switcher)) return true;
    modelTrace("model switcher expanded before open:", switcher.getAttribute("aria-expanded"));

    const attemptOpen = async () => {
      switcher.focus();
      switcher.click();
      await toolkitDelay(180);
      if (isModelMenuOpenByButtonState(switcher)) return true;
      if (collectVisibleMenuActionElements().length > 0) return true;

      switcher.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      switcher.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      switcher.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      switcher.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true, cancelable: true }));
      await toolkitDelay(180);

      return isModelMenuOpenByButtonState(switcher) || collectVisibleMenuActionElements().length > 0;
    };

    const opened = await attemptOpen();
    if (!opened) {
      modelTrace("model switcher did not open after click/keyboard attempts");
      return false;
    }

    modelTrace("model switcher expanded after open:", switcher.getAttribute("aria-expanded"));
    return true;
  }

  async function selectChatGPTModelMode(targetMode) {
    const opened = await openModelSwitcherMenu();
    if (!opened) return false;

    let candidates = [];
    for (let i = 0; i < 8; i++) {
      candidates = collectVisibleMenuActionElements();
      if (candidates.length > 0) break;
      await toolkitDelay(120);
    }
    if (candidates.length === 0) {
      modelLog("model menu options not found");
      return false;
    }

    const includeTokens = targetMode === "instant" ? ["instant"] : ["thinking", "思考"];
    const target = findElementByTextTokens(candidates, includeTokens);
    if (!target) {
      modelLog("target model option not found:", targetMode);
      return false;
    }

    target.click();
    await toolkitDelay(180);
    const currentMode = getCurrentChatGPTModelMode();
    return targetMode === "instant" ? currentMode === "instant" : currentMode === "thinking";
  }

  function getThinkingPillButton() {
    const pills = [...document.querySelectorAll("button.__composer-pill")].filter(isElementVisible);
    return (
      pills.find((pill) => {
        const text = normalizeText(
          `${pill.innerText || pill.textContent || ""} ${pill.getAttribute("aria-label") || ""}`
        );
        return (
          text.includes("thinking") ||
          text.includes("思考") ||
          text.includes("发散") ||
          text.includes("發散") ||
          text.includes("extended")
        );
      }) || null
    );
  }

  function getThinkingStrengthMode() {
    const pill = getThinkingPillButton();
    if (!pill) return "none";
    const text = normalizeText(
      `${pill.innerText || pill.textContent || ""} ${pill.getAttribute("aria-label") || ""}`
    );
    if (text.includes("发散") || text.includes("發散") || text.includes("extended")) return "extended";
    return "default";
  }

  async function selectThinkingStrengthMode(targetStrength) {
    const pill = getThinkingPillButton();
    if (!pill) {
      modelLog("thinking pill not found");
      return false;
    }

    if (pill.getAttribute("aria-expanded") !== "true") {
      pill.click();
      await toolkitDelay(120);
    }

    let candidates = [];
    const controlsId = pill.getAttribute("aria-controls");
    if (controlsId) {
      const menuRoot = document.getElementById(controlsId);
      if (menuRoot && isElementVisible(menuRoot)) {
        candidates = [
          ...menuRoot.querySelectorAll("button, [role=\"menuitem\"], [role=\"menuitemradio\"], [data-radix-collection-item]"),
        ].filter(isElementVisible);
      }
    }

    for (let i = 0; i < 8 && candidates.length === 0; i++) {
      candidates = collectVisibleMenuActionElements();
      if (candidates.length > 0) break;
      await toolkitDelay(120);
    }
    if (candidates.length === 0) {
      modelLog("thinking strength menu options not found");
      return false;
    }

    let target;
    if (targetStrength === "extended") {
      target = findElementByTextTokens(candidates, ["发散", "發散", "extended"]);
    } else {
      target = findElementByTextTokens(
        candidates,
        ["默认", "預設", "default", "思考", "thinking"],
        ["发散", "發散", "extended"]
      );
    }

    if (!target) {
      modelLog("target thinking strength option not found:", targetStrength);
      return false;
    }

    target.click();
    await toolkitDelay(180);
    return getThinkingStrengthMode() === targetStrength;
  }

  async function maybeApplyChatGPTModelPreference() {
    if (!modelPreferenceRequired || modelPreferenceDone || modelPreferenceInProgress) return;
    if (modelPreferenceAttempts >= MAX_MODEL_PREFERENCE_ATTEMPTS) {
      modelPreferenceDone = true;
      modelLog("fallback: max attempts reached, keep autosubmit only");
      return;
    }

    modelPreferenceInProgress = true;
    modelPreferenceAttempts += 1;

    try {
      modelLog(`attempt ${modelPreferenceAttempts}/${MAX_MODEL_PREFERENCE_ATTEMPTS}`, "intent:", modelIntent);

      const targetMode = modelIntent === "instant" ? "instant" : "thinking";
      let currentMode = getCurrentChatGPTModelMode();
      modelLog("current mode:", currentMode, "target mode:", targetMode);

      if (currentMode !== targetMode) {
        const modeChanged = await selectChatGPTModelMode(targetMode);
        if (!modeChanged) {
          modelLog("model mode switch failed");
          return;
        }
        currentMode = getCurrentChatGPTModelMode();
        modelLog("model mode after switch:", currentMode);
      }

      if (targetMode === "thinking") {
        const targetStrength = modelIntent === "thinking_extended" ? "extended" : "default";
        const currentStrength = getThinkingStrengthMode();
        modelLog("current thinking strength:", currentStrength, "target strength:", targetStrength);

        if (currentStrength !== targetStrength) {
          const strengthChanged = await selectThinkingStrengthMode(targetStrength);
          if (!strengthChanged) {
            modelLog("thinking strength switch failed");
            return;
          }
        }
      }

      modelPreferenceDone = true;
      modelLog("model preference applied successfully");
    } catch (error) {
      modelLog("model preference apply error:", error);
    } finally {
      if (!modelPreferenceDone && modelPreferenceAttempts >= MAX_MODEL_PREFERENCE_ATTEMPTS) {
        modelPreferenceDone = true;
        modelLog("fallback: switch failed repeatedly, keep autosubmit only");
      }
      modelPreferenceInProgress = false;
    }
  }

  function maybeAutoSubmitChatGPT() {
    if (!toolkitAutoSubmit) return;
    if (modelPreferenceRequired && !modelPreferenceDone) {
      const now = Date.now();
      if (now - modelPreferenceWaitLogTs > 1000) {
        modelLog("waiting model preference before autoSubmit");
        modelPreferenceWaitLogTs = now;
      }
      return;
    }

    const sendButton = getSubmitButton();
    if (sendButton && !sendButton.disabled) {
      if (toolkitDebug) console.log("auto submit clicked");
      sendButton.click();
      toolkitAutoSubmit = false;
    }
  }

  async function maybeAutoFillChatGPT() {
    const hasHashTask = parseHashParams();
    if (!hasHashTask) return;

    const checkForEditor = setInterval(() => {
      const editor = document.getElementById("prompt-textarea");
      if (!editor) return;

      if (toolkitPrompt) {
        setChatGPTPromptEditor(editor, toolkitPrompt);
      }

      clearHash();
      clearInterval(checkForEditor);
    }, 60);
  }

  // --- End ChatGPT Toolkit Logic ---

  // Wait for DOM to be ready and ChatGPTNavigator class to be available
  function init() {
    // Check if we're on a ChatGPT chat page
    const url = window.location.href;
    const isChatGPTPage = url.includes('chat.openai.com') || url.includes('chatgpt.com');

    // Exclude project pages, index/home pages, and other non-chat paths
    const isProjectPage = url.includes('/project/');
    const isSearchPage = url.includes('/search');
    const isGptsPage = url.includes('/gpts');

    // The index page is just chatgpt.com/ or chatgpt.com/?oai-dm=1 etc.
    // Chat pages usually have a UUID: chatgpt.com/c/uuid
    const isChatConversation = url.includes('/c/') || url.includes('/chat/');

    if (!isChatGPTPage || isProjectPage || isSearchPage || isGptsPage || !isChatConversation) {
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

      // Toolkit: check for new hash-based tasks on navigation
      maybeAutoFillChatGPT();

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
    // Alt + V (Option + V on Mac)
    if (e.altKey && (e.key === 'v' || e.key === 'V')) {
      const btn = getVoiceDictateButton();
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        btn.click();
      }
    }
  }

  // --- Cmd + Enter: submit prompt ---
  function getSubmitButton() {
    // Look for the send/submit button
    const submitSelectors = [
      '[data-testid="send-button"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="submit"]',
      'button:has(svg [d*="M15.1,12.1L12.9,14.3"])', // Example path for send icon
      'form button[type="submit"]',
      'button.absolute.bottom-1.5.right-2' // Common ChatGPT positioning
    ];

    for (const selector of submitSelectors) {
      try {
        const btn = document.querySelector(selector);
        if (btn && btn.offsetParent !== null && !btn.disabled) return btn;
      } catch (e) { }
    }

    // Fallback: search all buttons for "Send" or "Submit" labels or icons
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      const label = (btn.getAttribute('aria-label') || btn.getAttribute('title') || '').toLowerCase();
      if (label.includes('send') || label.includes('submit')) {
        if (btn.offsetParent !== null && !btn.disabled) return btn;
      }
    }

    return null;
  }

  function onSubmitShortcut(e) {
    // Cmd + Enter (Mac) or Ctrl + Enter (Windows/Linux)
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      const btn = getSubmitButton();
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        btn.click();
      }
    }
  }

  document.addEventListener('keydown', onVoiceShortcut, true);
  document.addEventListener('keydown', onSubmitShortcut, true);

  // Initialize Toolkit
  maybeAutoFillChatGPT();

  setInterval(async () => {
    await maybeApplyChatGPTModelPreference();
    maybeAutoSubmitChatGPT();
  }, 60);

})();
