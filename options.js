/**
 * ChatGPT Navigator Options Page
 */

// Default settings
const defaultSettings = {
  combineQuestionResponse: false,
  themeMode: 'auto',
  showPinButton: true,
  showOutline: true,
  showScrollLockButton: true,
  scrollLockEnabled: true
};

function normalizeThemeMode(settings) {
  const mode = settings.themeMode === 'auto' || settings.themeMode === 'light' || settings.themeMode === 'dark' 
    ? settings.themeMode 
    : 'auto';
  
  // Apply theme to options page body
  document.body.classList.remove('theme-light', 'theme-dark');
  if (mode === 'light') {
    document.body.classList.add('theme-light');
  } else if (mode === 'dark') {
    document.body.classList.add('theme-dark');
  }
  
  return mode;
}
let autoSaveTimer = null;

// Load and display current settings
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get(defaultSettings);
    
    // Set checkboxes
    document.getElementById('combineQuestionResponse').checked = result.combineQuestionResponse || false;
    document.getElementById('showPinButton').checked = result.showPinButton === true;
    document.getElementById('showOutline').checked = result.showOutline === true;
    document.getElementById('showScrollLockButton').checked = result.showScrollLockButton === true;

    const themeMode = normalizeThemeMode(result);
    document.getElementById('themeAuto').checked = themeMode === 'auto';
    document.getElementById('themeLight').checked = themeMode === 'light';
    document.getElementById('themeDark').checked = themeMode === 'dark';
  } catch (error) {
    console.error('Error loading settings:', error);
    showStatus('Error loading settings', 'error');
  }
}

// Save settings
async function saveSettings() {
  try {
    const settings = {
      combineQuestionResponse: document.getElementById('combineQuestionResponse').checked,
      themeMode: document.querySelector('input[name="themeMode"]:checked')?.value || 'auto',
      showPinButton: document.getElementById('showPinButton').checked,
      showOutline: document.getElementById('showOutline').checked,
      showScrollLockButton: document.getElementById('showScrollLockButton').checked
    };
    
    await chrome.storage.sync.set(settings);
    showStatus('Settings saved successfully!', 'success');
    
    // Notify content scripts to reload settings
    chrome.tabs.query({ url: ['https://chatgpt.com/*'] }, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { action: 'reloadSettings' }).catch(() => {
          // Tab might not have content script loaded yet, ignore
        });
      });
    });
  } catch (error) {
    console.error('Error saving settings:', error);
    showStatus('Error saving settings', 'error');
  }
}

function scheduleAutoSave() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    saveSettings();
  }, 250);
}

// Show status message
function showStatus(message, type) {
  const statusMessage = document.getElementById('statusMessage');
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type} show`;
  
  setTimeout(() => {
    statusMessage.classList.remove('show');
  }, 3000);
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();

  // Auto-save toggles
  document.querySelectorAll('input[name="themeMode"]').forEach((input) => {
    input.addEventListener('change', scheduleAutoSave);
  });
  document.getElementById('combineQuestionResponse').addEventListener('change', scheduleAutoSave);
  document.getElementById('showPinButton').addEventListener('change', scheduleAutoSave);
  document.getElementById('showOutline').addEventListener('change', scheduleAutoSave);
  document.getElementById('showScrollLockButton').addEventListener('change', scheduleAutoSave);
});
