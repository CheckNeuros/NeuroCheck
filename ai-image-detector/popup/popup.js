// Popup Script
// Handles enable/disable toggle

document.addEventListener('DOMContentLoaded', async () => {
  const toggle = document.getElementById('enable-toggle');
  const toggleLabel = document.getElementById('toggle-label');
  const statusIndicator = document.getElementById('status-indicator');
  const optionsLink = document.getElementById('options-link');
  
  // Load current state
  const { enabled = true } = await chrome.storage.sync.get('enabled');
  
  // Update UI
  toggle.checked = enabled;
  updateUI(enabled);
  
  // Remove loading state
  toggle.parentElement.classList.remove('loading');
  
  // Handle toggle change
  toggle.addEventListener('change', async (e) => {
    const newState = e.target.checked;
    
    // Disable interaction during save
    toggle.parentElement.classList.add('loading');
    
    // Save state
    await chrome.storage.sync.set({ enabled: newState });
    
    // Update UI
    updateUI(newState);
    
    // Re-enable interaction
    toggle.parentElement.classList.remove('loading');
    
    // Notify all tabs
    const tabs = await chrome.tabs.query({});
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, {
        type: 'TOGGLE_DETECTION',
        enabled: newState
      }).catch(() => {
        // Tab might not have content script
      });
    });
  });
  
  // Handle options link
  optionsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
  
  // Update UI based on state
  function updateUI(enabled) {
    toggleLabel.textContent = enabled ? 'Enabled' : 'Disabled';
    
    if (enabled) {
      statusIndicator.classList.add('active');
      statusIndicator.classList.remove('inactive');
    } else {
      statusIndicator.classList.add('inactive');
      statusIndicator.classList.remove('active');
    }
  }
});