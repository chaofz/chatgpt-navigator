/**
 * ChatGPT Navigator Options Page
 */

// Default settings
const defaultSettings = {
  combineQuestionResponse: false,
  displayMode: 'all',
  maxQuestions: 10,
  themeMode: 'auto',
  showPinBackButtons: true,
  scrollLockEnabled: true
};

function normalizeThemeMode(settings) {
  if (settings.themeMode === 'auto' || settings.themeMode === 'light' || settings.themeMode === 'dark') {
    return settings.themeMode;
  }
  return settings.nightMode ? 'dark' : 'light';
}
let autoSaveTimer = null;

// Load and display current settings
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get(defaultSettings);
    
    // Set checkboxes
    document.getElementById('combineQuestionResponse').checked = result.combineQuestionResponse || false;
    document.getElementById('showPinBackButtons').checked = result.showPinBackButtons === true;
    document.getElementById('scrollLockEnabled').checked = result.scrollLockEnabled === true;

    const themeMode = normalizeThemeMode(result);
    document.getElementById('themeAuto').checked = themeMode === 'auto';
    document.getElementById('themeLight').checked = themeMode === 'light';
    document.getElementById('themeDark').checked = themeMode === 'dark';
    
    // Set radio buttons
    const displayMode = result.displayMode || 'all';
    if (displayMode === 'all') {
      document.getElementById('displayAll').checked = true;
    } else {
      document.getElementById('displayLimited').checked = true;
    }
    
    // Set number input
    document.getElementById('maxQuestions').value = result.maxQuestions || 10;
    
    // Show/hide limit control
    updateLimitControlVisibility();
  } catch (error) {
    console.error('Error loading settings:', error);
    showStatus('Error loading settings', 'error');
  }
}

// Update limit control visibility based on selected mode
function updateLimitControlVisibility() {
  const displayLimited = document.getElementById('displayLimited').checked;
  const limitControl = document.getElementById('limitControl');
  limitControl.hidden = !displayLimited;
}

// Save settings
async function saveSettings() {
  try {
    const settings = {
      combineQuestionResponse: document.getElementById('combineQuestionResponse').checked,
      displayMode: document.getElementById('displayAll').checked ? 'all' : 'limited',
      maxQuestions: parseInt(document.getElementById('maxQuestions').value) || 10,
      themeMode: document.querySelector('input[name="themeMode"]:checked')?.value || 'auto',
      showPinBackButtons: document.getElementById('showPinBackButtons').checked,
      scrollLockEnabled: document.getElementById('scrollLockEnabled').checked
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

// Reset to defaults
async function resetSettings() {
  try {
    await chrome.storage.sync.set(defaultSettings);
    await loadSettings();
    showStatus('Settings reset to defaults', 'success');
  } catch (error) {
    console.error('Error resetting settings:', error);
    showStatus('Error resetting settings', 'error');
  }
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

  // Reset button
  document.getElementById('resetButton').addEventListener('click', resetSettings);
  
  // Display mode radio buttons
  document.getElementById('displayAll').addEventListener('change', () => {
    updateLimitControlVisibility();
    scheduleAutoSave();
  });
  document.getElementById('displayLimited').addEventListener('change', () => {
    updateLimitControlVisibility();
    scheduleAutoSave();
  });
  
  // Number input validation
  document.getElementById('maxQuestions').addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    if (value < 1) e.target.value = 1;
    if (value > 50) e.target.value = 50;
    scheduleAutoSave();
  });

  // Auto-save toggles
  document.querySelectorAll('input[name="themeMode"]').forEach((input) => {
    input.addEventListener('change', scheduleAutoSave);
  });
  document.getElementById('combineQuestionResponse').addEventListener('change', scheduleAutoSave);
  document.getElementById('showPinBackButtons').addEventListener('change', scheduleAutoSave);
  document.getElementById('scrollLockEnabled').addEventListener('change', scheduleAutoSave);
});
