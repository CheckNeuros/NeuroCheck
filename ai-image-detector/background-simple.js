// Simple background script - just manages settings
const DEFAULT_BLACKLIST = [
  'youtube.com',
  'studio.youtube.com', 
  'vimeo.com',
  'twitch.tv'
];

// Initialize defaults
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

// Check if URL should be skipped
function shouldSkip(url, blacklist) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return blacklist.some(pattern => 
      hostname === pattern.toLowerCase() || 
      hostname.endsWith('.' + pattern.toLowerCase())
    );
  } catch {
    return false;
  }
}

// Handle content script requests
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  try {
    switch (request.type) {
      case 'CHECK_ENABLED':
        const { enabled = true } = await chrome.storage.sync.get('enabled');
        sendResponse({ enabled });
        break;
        
      case 'CHECK_SKIP_STATUS':
        const { enabled: isEnabled = true } = await chrome.storage.sync.get('enabled');
        const { blacklist = DEFAULT_BLACKLIST } = await chrome.storage.sync.get('blacklist');
        
        let skip = !isEnabled;
        if (sender.tab && sender.tab.url) {
          skip = skip || shouldSkip(sender.tab.url, blacklist);
        }
        
        sendResponse({ skip });
        break;
        
      default:
        sendResponse({ error: 'Unknown message type' });
    }
  } catch (error) {
    console.error('Background script error:', error);
    sendResponse({ error: error.message });
  }
  
  return true; // Keep message channel open for async response
});