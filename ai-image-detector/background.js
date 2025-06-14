// Service Worker for NeuroCheck Extension
// Handles blacklist logic and extension state management

// Default blacklist of video streaming sites
const DEFAULT_BLACKLIST = [
  'youtube.com',
  'studio.youtube.com',
  'vimeo.com',
  'twitch.tv'
];

// Initialize storage with defaults
chrome.runtime.onInstalled.addListener(async () => {
  const { blacklist } = await chrome.storage.sync.get('blacklist');
  if (!blacklist) {
    await chrome.storage.sync.set({ blacklist: DEFAULT_BLACKLIST });
  }
  
  const { enabled } = await chrome.storage.sync.get('enabled');
  if (enabled === undefined) {
    await chrome.storage.sync.set({ enabled: true });
  }
});

// Check if URL matches blacklist patterns
function isBlacklisted(url, blacklist) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    return blacklist.some(pattern => {
      // Support both exact matches and subdomain matches
      const patternLower = pattern.toLowerCase();
      return hostname === patternLower || 
             hostname.endsWith('.' + patternLower);
    });
  } catch (e) {
    console.error('Invalid URL:', url);
    return false;
  }
}

// Listen for navigation events to determine if we should inject scripts
chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId !== 0) return; // Only check main frame
  
  const { blacklist = DEFAULT_BLACKLIST } = await chrome.storage.sync.get('blacklist');
  const { enabled = true } = await chrome.storage.sync.get('enabled');
  
  const shouldSkip = !enabled || isBlacklisted(details.url, blacklist);
  
  // Store skip state for content script to check
  try {
    await chrome.tabs.sendMessage(details.tabId, {
      type: 'SKIP_DETECTION',
      skip: shouldSkip
    });
  } catch (e) {
    // Tab might not be ready yet, content script will check storage
  }
  
  // Also store in session storage for the tab
  chrome.storage.session.set({
    [`tab_${details.tabId}_skip`]: shouldSkip
  });
});

// Clean up session storage when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(`tab_${tabId}_skip`);
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'CHECK_SKIP_STATUS') {
    chrome.storage.session.get(`tab_${sender.tab.id}_skip`).then(result => {
      const skip = result[`tab_${sender.tab.id}_skip`] || false;
      sendResponse({ skip });
    });
    return true; // Keep channel open for async response
  }
});