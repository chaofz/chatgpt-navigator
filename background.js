/**
 * ChatGPT Navigator Background Service Worker
 * Handles on-demand dynamic script injection when the extension action is clicked.
 */

chrome.action.onClicked.addListener((tab) => {
  if (tab.url && (tab.url.includes("chatgpt.com") || tab.url.includes("chat.openai.com"))) {
    // Inject CSS styles
    chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["content/sidebar.css"]
    }).catch((err) => {
      console.error("[ChatGPT Navigator] Error injecting CSS:", err);
    });

    // Inject JS files in order of dependency
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: [
        "content/content-utils.js",
        "content/sidebar.js",
        "content/content.js"
      ]
    }).catch((err) => {
      console.error("[ChatGPT Navigator] Error executing script:", err);
    });
  }
});
