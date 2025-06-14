// Simplified NeuroCheck that avoids CSP issues
// Uses message passing to background script for inference

(async function() {
  // Check if we should skip detection
  let skipDetection = false;
  
  try {
    const response = await chrome.runtime.sendMessage({ type: 'CHECK_SKIP_STATUS' });
    skipDetection = response.skip;
  } catch (e) {
    console.log('NeuroCheck: Could not check skip status');
  }
  
  const { enabled = true } = await chrome.storage.sync.get('enabled');
  if (!enabled) skipDetection = true;
  
  if (skipDetection) {
    console.log('NeuroCheck: Skipping detection on this page');
    return;
  }
  
  // Listen for enable/disable changes
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.enabled) {
      if (!changes.enabled.newValue) {
        stopDetection();
      } else {
        startDetection();
      }
    }
  });
  
  // Image processing queue
  let processingQueue = [];
  let isProcessing = false;
  let observer = null;
  let batchTimer = null;
  
  // Image size constraints
  const MIN_SIZE = 150;
  const MAX_SIZE = 1024;
  
  // Performance settings
  const MAX_BATCH_SIZE = 8;
  const BATCH_INTERVAL = 500;
  
  // Check if image meets size criteria
  function isValidImageSize(img) {
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    
    if (width >= MIN_SIZE && width <= MAX_SIZE && 
        height >= MIN_SIZE && height <= MAX_SIZE) {
      return true;
    }
    
    if (width < MIN_SIZE || height < MIN_SIZE) {
      img.setAttribute('data-ai-skip', 'small');
    } else {
      img.setAttribute('data-ai-skip', 'large');
    }
    
    return false;
  }
  
  // Extract image data for processing
  async function getImageData(img) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    // Draw and scale image
    ctx.drawImage(img, 0, 0, 256, 256);
    
    // Get pixel data
    const imageData = ctx.getImageData(0, 0, 256, 256);
    const pixels = imageData.data;
    
    // Convert to normalized array
    const float32Data = new Float32Array(256 * 256 * 3);
    
    // Fill in HWC format
    for (let h = 0; h < 256; h++) {
      for (let w = 0; w < 256; w++) {
        for (let c = 0; c < 3; c++) {
          const srcIdx = (h * 256 + w) * 4 + c;
          const dstIdx = h * 256 * 3 + w * 3 + c;
          float32Data[dstIdx] = pixels[srcIdx] / 255.0;
        }
      }
    }
    
    return Array.from(float32Data);
  }
  
  // Process image using background script
  async function detectAI(img) {
    if (img.hasAttribute('data-ai-detected')) return;
    
    try {
      const imageData = await getImageData(img);
      
      // Send to background for processing
      const response = await chrome.runtime.sendMessage({
        type: 'RUN_INFERENCE',
        imageData: imageData
      });
      
      if (response.error) {
        throw new Error(response.error);
      }
      
      // Process result
      const outputData = response.outputData;
      let aiProbability;
      
      if (outputData.length > 1) {
        // Multiple outputs case
        const exp0 = Math.exp(outputData[0]);
        const exp1 = Math.exp(outputData[1]);
        const sum = exp0 + exp1;
        aiProbability = exp1 / sum;
      } else {
        // Single output case
        let value = outputData[0];
        if (value < -10 || value > 10) {
          aiProbability = 1 / (1 + Math.exp(-value));
        } else if (value < 0 || value > 1) {
          aiProbability = 1 / (1 + Math.exp(-value));
        } else {
          aiProbability = value;
        }
      }
      
      // Store result
      img.setAttribute('data-ai-detected', 'true');
      img.setAttribute('data-ai-probability', aiProbability.toFixed(3));
      
      // Update UI
      if (window.updateImageBadge) {
        window.updateImageBadge(img, aiProbability);
      }
      
      if (aiProbability >= 0.7) {
        img.setAttribute('data-ai-saliency-ready', 'true');
      }
      
    } catch (error) {
      console.error('NeuroCheck: Inference error', error);
      img.setAttribute('data-ai-error', 'true');
    }
  }
  
  // Process batch
  async function processBatch() {
    if (isProcessing || processingQueue.length === 0) return;
    
    isProcessing = true;
    const batch = processingQueue.splice(0, MAX_BATCH_SIZE);
    
    for (const img of batch) {
      await detectAI(img);
      // Small delay between images
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    isProcessing = false;
    
    // Process next batch if any
    if (processingQueue.length > 0) {
      setTimeout(processBatch, 100);
    }
  }
  
  // Queue image for processing
  function queueImage(img) {
    if (img.hasAttribute('data-ai-detected') || 
        img.hasAttribute('data-ai-skip') ||
        img.hasAttribute('data-ai-queued')) {
      return;
    }
    
    img.setAttribute('data-ai-queued', 'true');
    processingQueue.push(img);
    
    if (!batchTimer) {
      batchTimer = setTimeout(() => {
        batchTimer = null;
        processBatch();
      }, BATCH_INTERVAL);
    }
  }
  
  // Process all visible images
  function processImages() {
    const images = document.querySelectorAll('img');
    
    images.forEach(img => {
      if (img.hasAttribute('data-ai-detected') || 
          img.hasAttribute('data-ai-skip')) {
        return;
      }
      
      if (img.complete && img.naturalWidth > 0) {
        if (isValidImageSize(img)) {
          queueImage(img);
        }
      } else {
        img.addEventListener('load', () => {
          if (isValidImageSize(img)) {
            queueImage(img);
          }
        }, { once: true });
      }
    });
  }
  
  // Start detection
  function startDetection() {
    if (observer) return;
    
    processImages();
    
    observer = new MutationObserver((mutations) => {
      let hasNewImages = false;
      
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeName === 'IMG') {
            hasNewImages = true;
          } else if (node.querySelectorAll) {
            const imgs = node.querySelectorAll('img');
            if (imgs.length > 0) hasNewImages = true;
          }
        });
      });
      
      if (hasNewImages) {
        processImages();
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  
  // Stop detection
  function stopDetection() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    
    if (batchTimer) {
      clearTimeout(batchTimer);
      batchTimer = null;
    }
    
    processingQueue = [];
    isProcessing = false;
    
    document.querySelectorAll('.ai-detector-badge').forEach(badge => {
      badge.remove();
    });
    
    document.querySelectorAll('[data-ai-detected]').forEach(img => {
      img.removeAttribute('data-ai-detected');
      img.removeAttribute('data-ai-probability');
      img.removeAttribute('data-ai-queued');
      img.removeAttribute('data-ai-saliency-ready');
    });
  }
  
  // Initialize
  console.log('NeuroCheck: Initializing simplified detector');
  
  // Check if background script can handle inference
  try {
    const response = await chrome.runtime.sendMessage({ type: 'CHECK_INFERENCE_READY' });
    if (response.ready) {
      console.log('NeuroCheck: Model ready, starting detection');
      startDetection();
    } else {
      console.log('NeuroCheck: Waiting for model initialization');
      // Listen for ready signal
      chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'MODEL_READY') {
          console.log('NeuroCheck: Model now ready, starting detection');
          startDetection();
        }
      });
    }
  } catch (error) {
    console.error('NeuroCheck: Failed to check inference readiness', error);
  }
  
  // Expose functions
  window.aiDetector = {
    detectAI,
    queueImage,
    isValidImageSize,
    stopDetection,
    startDetection
  };
})();