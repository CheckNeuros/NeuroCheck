// Options Page Script
// Handles blacklist management

const DEFAULT_BLACKLIST = [
  'youtube.com',
  'studio.youtube.com',
  'vimeo.com',
  'twitch.tv'
];

let currentBlacklist = [];

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
  await loadBlacklist();
  setupEventListeners();
});

// Load blacklist from storage
async function loadBlacklist() {
  const { blacklist = DEFAULT_BLACKLIST } = await chrome.storage.sync.get('blacklist');
  currentBlacklist = [...blacklist];
  renderBlacklist();
}

// Save blacklist to storage
async function saveBlacklist() {
  await chrome.storage.sync.set({ blacklist: currentBlacklist });
  showStatus('Blacklist saved', 'success');
}

// Render blacklist items
function renderBlacklist() {
  const container = document.getElementById('blacklist-items');
  
  if (currentBlacklist.length === 0) {
    container.innerHTML = '<div class="empty-state">No domains in blacklist</div>';
    return;
  }
  
  container.innerHTML = currentBlacklist
    .sort()
    .map(domain => `
      <div class="blacklist-item">
        <span>${escapeHtml(domain)}</span>
        <button class="remove-button" data-domain="${escapeHtml(domain)}">Remove</button>
      </div>
    `)
    .join('');
  
  // Add remove button listeners
  container.querySelectorAll('.remove-button').forEach(button => {
    button.addEventListener('click', (e) => {
      const domain = e.target.getAttribute('data-domain');
      removeDomain(domain);
    });
  });
}

// Add domain to blacklist
function addDomain() {
  const input = document.getElementById('domain-input');
  const domain = input.value.trim().toLowerCase();
  
  if (!domain) {
    showStatus('Please enter a domain', 'error');
    return;
  }
  
  // Basic domain validation
  const domainRegex = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/;
  if (!domainRegex.test(domain) && !domain.includes('.')) {
    showStatus('Please enter a valid domain', 'error');
    return;
  }
  
  // Check if already exists
  if (currentBlacklist.includes(domain)) {
    showStatus('Domain already in blacklist', 'error');
    return;
  }
  
  currentBlacklist.push(domain);
  renderBlacklist();
  saveBlacklist();
  
  // Clear input
  input.value = '';
  input.focus();
}

// Remove domain from blacklist
function removeDomain(domain) {
  currentBlacklist = currentBlacklist.filter(d => d !== domain);
  renderBlacklist();
  saveBlacklist();
}

// Reset to defaults
async function resetToDefaults() {
  if (confirm('Reset blacklist to default domains? This cannot be undone.')) {
    currentBlacklist = [...DEFAULT_BLACKLIST];
    renderBlacklist();
    await saveBlacklist();
    showStatus('Reset to defaults', 'success');
  }
}

// Show status message
function showStatus(message, type) {
  const statusEl = document.getElementById('status-message');
  statusEl.textContent = message;
  statusEl.className = `status-message ${type} show`;
  
  setTimeout(() => {
    statusEl.classList.remove('show');
  }, 3000);
}

// Setup event listeners
function setupEventListeners() {
  // Add domain button
  document.getElementById('add-button').addEventListener('click', addDomain);
  
  // Enter key in input
  document.getElementById('domain-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addDomain();
    }
  });
  
  // Reset button
  document.getElementById('reset-button').addEventListener('click', resetToDefaults);
}

// Escape HTML to prevent XSS
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}