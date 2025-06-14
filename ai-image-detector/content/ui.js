// UI Overlay Helpers
// Handles badge creation and saliency map overlay

(function() {
  // Color scheme for accessibility
  const COLORS = {
    AI: '#d9534f',      // Red for AI-generated
    TEXT: '#ffffff',    // White text
    SHADOW: 'rgba(0, 0, 0, 0.8)'
  };
  
  // Badge styles
  const BADGE_STYLES = `
    .ai-detector-badge {
      position: absolute;
      top: 10px;
      right: 10px;
      padding: 4px 8px;
      border-radius: 4px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      font-weight: 600;
      color: ${COLORS.TEXT};
      z-index: 10000;
      pointer-events: none;
      box-shadow: 0 2px 4px ${COLORS.SHADOW};
      transition: opacity 0.2s ease;
    }
    
    .ai-detector-badge.ai-detected {
      background-color: ${COLORS.AI};
    }
    
    .ai-detector-wrapper {
      position: relative;
      display: inline-block;
    }
    
    .ai-detector-saliency {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.3s ease;
      mix-blend-mode: multiply;
      z-index: 9999;
    }
    
    .ai-detector-saliency.active {
      opacity: 1;
    }
    
    .ai-detector-show-why {
      position: absolute;
      bottom: 10px;
      right: 10px;
      padding: 4px 8px;
      background-color: rgba(0, 0, 0, 0.7);
      color: white;
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
      z-index: 10001;
      transition: all 0.2s ease;
    }
    
    .ai-detector-show-why:hover {
      background-color: rgba(0, 0, 0, 0.9);
      border-color: rgba(255, 255, 255, 0.5);
    }
    
    .ai-detector-loading {
      display: inline-block;
      width: 10px;
      height: 10px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: ai-detector-spin 0.8s linear infinite;
      margin-left: 5px;
      vertical-align: middle;
    }
    
    @keyframes ai-detector-spin {
      to { transform: rotate(360deg); }
    }
  `;
  
  // Inject styles
  if (!document.getElementById('ai-detector-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'ai-detector-styles';
    styleEl.textContent = BADGE_STYLES;
    document.head.appendChild(styleEl);
  }
  
  // Saliency worker
  let saliencyWorker = null;
  const saliencyRequests = new Map();
  
  // Initialize saliency worker (disabled for now due to CSP issues)
  function initSaliencyWorker() {
    // Saliency maps temporarily disabled due to CSP restrictions
    // TODO: Implement saliency via background script
    console.log('NeuroCheck: Saliency maps temporarily disabled');
  }
  
  // Create or update badge for image
  function updateImageBadge(img, probability) {
    // Only show badge if AI is detected with high confidence (0.7+)
    const isAI = probability >= 0.7;
    if (!isAI) return;

    // Ensure image has a wrapper
    let wrapper = img.closest('.ai-detector-wrapper');
    if (!wrapper) {
      // Check if image parent can be used as wrapper
      const parent = img.parentElement;
      if (parent && parent.childElementCount === 1 && 
          getComputedStyle(parent).display === 'inline-block') {
        parent.classList.add('ai-detector-wrapper');
        wrapper = parent;
      } else {
        // Create new wrapper
        wrapper = document.createElement('div');
        wrapper.className = 'ai-detector-wrapper';
        img.parentNode.insertBefore(wrapper, img);
        wrapper.appendChild(img);
      }
    }
    
    // Remove existing badge
    const existingBadge = wrapper.querySelector('.ai-detector-badge');
    if (existingBadge) {
      existingBadge.remove();
    }
    
    // Create new badge for AI images only
    const badge = document.createElement('div');
    badge.className = 'ai-detector-badge ai-detected';
    
    const percentage = Math.round(probability * 100);
    badge.textContent = `AI ${percentage}%`;
    badge.setAttribute('aria-label', `AI generated image with ${percentage}% confidence`);
    
    // Add "Show why" button for AI images
    addShowWhyButton(wrapper, img);
    
    // Position badge
    wrapper.appendChild(badge);
    
    // Ensure badge is visible
    const wrapperPos = getComputedStyle(wrapper).position;
    if (wrapperPos === 'static') {
      wrapper.style.position = 'relative';
    }
  }
  
  // Add "Show why" button
  function addShowWhyButton(wrapper, img) {
    if (wrapper.querySelector('.ai-detector-show-why')) return;
    
    const button = document.createElement('button');
    button.className = 'ai-detector-show-why';
    button.textContent = 'Show why';
    button.setAttribute('aria-label', 'Show AI detection explanation');
    
    button.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      const existingSaliency = wrapper.querySelector('.ai-detector-saliency');
      
      if (existingSaliency) {
        // Toggle visibility
        existingSaliency.classList.toggle('active');
        button.textContent = existingSaliency.classList.contains('active') ? 'Hide' : 'Show why';
      } else {
        // Generate saliency map
        button.innerHTML = 'Loading<span class="ai-detector-loading"></span>';
        button.disabled = true;
        
        try {
          const saliencyOverlay = await generateSaliencyMap(img);
          wrapper.appendChild(saliencyOverlay);
          
          // Activate after a brief delay for smooth transition
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              saliencyOverlay.classList.add('active');
            });
          });
          
          button.textContent = 'Hide';
          button.disabled = false;
        } catch (error) {
          console.error('Failed to generate saliency map:', error);
          button.textContent = 'Error';
          button.disabled = false;
        }
      }
    });
    
    wrapper.appendChild(button);
  }
  
  // Generate saliency map for image (simplified version)
  async function generateSaliencyMap(img) {
    // Create a simple gradient overlay as placeholder
    // Real saliency maps would require background script implementation
    
    const canvas = document.createElement('canvas');
    canvas.className = 'ai-detector-saliency';
    canvas.width = 256;
    canvas.height = 256;
    
    const ctx = canvas.getContext('2d');
    
    // Create radial gradient centered on image
    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, 'rgba(255, 0, 0, 0.7)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 0, 0.5)');
    gradient.addColorStop(1, 'rgba(0, 0, 255, 0.2)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
    
    // Apply computed dimensions to match image display size
    const imgRect = img.getBoundingClientRect();
    canvas.style.width = `${imgRect.width}px`;
    canvas.style.height = `${imgRect.height}px`;
    
    return canvas;
  }
  
  // Clean up function
  function cleanup() {
    if (saliencyWorker) {
      saliencyWorker.terminate();
      saliencyWorker = null;
    }
    saliencyRequests.clear();
  }
  
  // Listen for page visibility change instead of unload (better for CSP)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      cleanup();
    }
  });
  
  // Expose API
  window.updateImageBadge = updateImageBadge;
  window.aiDetectorCleanup = cleanup;
})();