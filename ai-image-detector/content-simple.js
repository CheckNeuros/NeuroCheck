// Simple content script - works everywhere without CSP issues
(async function() {
  'use strict';

  // Check if we should run - with proper error handling
  let shouldRun = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: 'CHECK_ENABLED' });
    shouldRun = response && response.enabled;
  } catch (e) {
    console.log('NeuroCheck: Background not reachable, continuing anyway');
  }

  const { enabled = true } = await chrome.storage.sync.get('enabled');
  if (!enabled) {
    console.log('NeuroCheck: Disabled on this site');
    return;
  }

  console.log('NeuroCheck: Starting...');

  // Simple badge styles
  const style = document.createElement('style');
  style.textContent = `
    .ai-badge {
      position: absolute;
      top: 5px;
      right: 5px;
      padding: 3px 8px;
      border-radius: 12px;
      font: bold 11px Arial;
      color: white;
      z-index: 10000;
      pointer-events: none;
      box-shadow: 0 2px 4px rgba(0,0,0,0.5);
      background: #d9534f;
    }
    .ai-wrapper { position: relative; display: inline-block; }
  `;
  document.head.appendChild(style);

  // Mock AI detection (replace with real model later)
  function mockDetection(img) {
    // Deterministic but random-looking based on image src
    const src = img.src || img.currentSrc || Math.random().toString();
    let hash = 0;
    for (let i = 0; i < src.length; i++) {
      hash = ((hash << 5) - hash) + src.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit
    }
    return Math.abs(hash % 100) / 100;
  }

  // Add badge to image
  function addBadge(img, probability) {
    // Don't process twice
    if (img.dataset.aiProcessed) return;
    img.dataset.aiProcessed = 'true';

    // Only show badge if AI is detected with high confidence (0.7+)
    const isAI = probability >= 0.7;
    if (!isAI) return;

    // Wrap image if needed
    let wrapper = img.parentElement;
    if (!wrapper || !wrapper.classList.contains('ai-wrapper')) {
      wrapper = document.createElement('div');
      wrapper.className = 'ai-wrapper';
      img.parentNode.insertBefore(wrapper, img);
      wrapper.appendChild(img);
    }

    // Create badge for AI images only
    const badge = document.createElement('div');
    badge.className = 'ai-badge ai';
    
    const confidence = Math.round(probability * 100);
    badge.textContent = `AI ${confidence}%`;
    badge.setAttribute('aria-label', `AI generated image, ${confidence}% confidence`);

    wrapper.appendChild(badge);
  }

  // Check if image is valid size
  function isValidSize(img) {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    return w >= 150 && w <= 1024 && h >= 150 && h <= 1024;
  }

  // Process a single image
  function processImage(img) {
    // Skip if already processed or invalid
    if (img.dataset.aiProcessed || !isValidSize(img)) return;

    // Skip videos, gifs, svg
    const src = img.src || img.currentSrc || '';
    if (src.includes('.gif') || src.includes('.svg') || 
        img.tagName === 'VIDEO' || img.closest('video')) return;

    // Mock detection
    const probability = mockDetection(img);
    addBadge(img, probability);
  }

  // Process all images on page
  function processAllImages() {
    const images = document.querySelectorAll('img');
    images.forEach(img => {
      if (img.complete && img.naturalWidth > 0) {
        processImage(img);
      } else {
        img.addEventListener('load', () => processImage(img), { once: true });
      }
    });
  }

  // Watch for new images
  let observer;
  try {
    observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) { // Element node
            if (node.tagName === 'IMG') {
              processImage(node);
            } else if (node.querySelectorAll) {
              node.querySelectorAll('img').forEach(processImage);
            }
          }
        });
      });
    });

    // Start observing
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
      processAllImages();
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        if (document.body) {
          observer.observe(document.body, { childList: true, subtree: true });
          processAllImages();
        }
      });
    }
  } catch (e) {
    console.error('NeuroCheck: Observer error:', e);
    // Fallback - just process current images
    processAllImages();
  }

  console.log('NeuroCheck: Ready (mock mode)');
})();