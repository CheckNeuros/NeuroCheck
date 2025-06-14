// AI Image Detection Content Script
// Handles ONNX model loading and inference

(async function() {
  // Check if we should skip detection on this page
  let skipDetection = false;
  
  // Check with background script
  try {
    const response = await chrome.runtime.sendMessage({ type: 'CHECK_SKIP_STATUS' });
    skipDetection = response.skip;
  } catch (e) {
    console.log('NeuroCheck: Could not check skip status');
  }
  
  // Also check storage directly
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
        // Disable detection
        stopDetection();
      } else {
        // Re-enable detection
        startDetection();
      }
    }
  });
  
  // Import ONNX Runtime using dynamic import (works better with CSP)
  let ort;
  try {
    // Use importScripts for worker context or dynamic import for main context
    if (typeof importScripts === 'function') {
      importScripts(chrome.runtime.getURL('model/ort.min.js'));
      ort = self.ort;
    } else {
      // For content scripts, we'll use a different approach
      // Load ONNX Runtime in an isolated context
      const ortUrl = chrome.runtime.getURL('model/ort.min.js');
      const response = await fetch(ortUrl);
      const scriptText = await response.text();
      
      // Create a blob URL to bypass CSP
      const blob = new Blob([scriptText], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      
      // Import as module
      const module = await import(blobUrl);
      ort = module.default || window.ort;
      
      // Clean up
      URL.revokeObjectURL(blobUrl);
    }
  } catch (error) {
    console.error('NeuroCheck: Failed to load ONNX Runtime', error);
    return;
  }
  
  // Model and session management
  let session = null;
  let isProcessing = false;
  let processingQueue = [];
  let observer = null;
  let batchTimer = null;
  
  // Image size constraints
  const MIN_SIZE = 150;
  const MAX_SIZE = 1024;
  
  // Performance settings
  const MAX_BATCH_SIZE = 8;
  const BATCH_INTERVAL = 500;
  
  // Initialize model session
  async function initializeModel() {
    try {
      // Try WebGPU first, fallback to WASM
      const providers = ['webgpu', 'wasm'];
      const modelUrl = chrome.runtime.getURL('model/model.onnx');
      
      session = await ort.InferenceSession.create(modelUrl, {
        executionProviders: providers,
        graphOptimizationLevel: 'all'
      });
      
      // Warm up the model with dummy input (HWC format: 256x256x3)
      const dummyInput = new ort.Tensor('float32', new Float32Array(256 * 256 * 3), [1, 256, 256, 3]);
      await session.run({ input: dummyInput });
      
      console.log('NeuroCheck: Model initialized successfully');
    } catch (error) {
      console.error('NeuroCheck: Failed to initialize model', error);
    }
  }
  
  // Check if image meets size criteria
  function isValidImageSize(img) {
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    
    if (width >= MIN_SIZE && width <= MAX_SIZE && 
        height >= MIN_SIZE && height <= MAX_SIZE) {
      return true;
    }
    
    // Mark image to skip future checks
    if (width < MIN_SIZE || height < MIN_SIZE) {
      img.setAttribute('data-ai-skip', 'small');
    } else {
      img.setAttribute('data-ai-skip', 'large');
    }
    
    return false;
  }
  
  // Softmax helper function
  function softmax(arr) {
    const maxVal = Math.max(...arr);
    const expArr = arr.map(val => Math.exp(val - maxVal));
    const sumExp = expArr.reduce((a, b) => a + b, 0);
    return expArr.map(val => val / sumExp);
  }
  
  // Preprocess image for model input
  async function preprocessImage(img) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    // Draw and scale image to 256x256
    ctx.drawImage(img, 0, 0, 256, 256);
    
    // Get pixel data
    const imageData = ctx.getImageData(0, 0, 256, 256);
    const pixels = imageData.data;
    
    // Convert to float32 array in HWC format: [1, 256, 256, 3]
    const float32Data = new Float32Array(256 * 256 * 3);
    
    // Fill in height- width-channel format (no normalization, just 0-1 range)
    for (let h = 0; h < 256; h++) {
      for (let w = 0; w < 256; w++) {
        for (let c = 0; c < 3; c++) {
          const srcIdx = (h * 256 + w) * 4 + c;
          const dstIdx = h * 256 * 3 + w * 3 + c;
          // Just normalize to 0-1 range
          float32Data[dstIdx] = pixels[srcIdx] / 255.0;
        }
      }
    }
    
    return new ort.Tensor('float32', float32Data, [1, 256, 256, 3]);
  }
  
  // Run inference on image
  async function detectAI(img) {
    if (!session || img.hasAttribute('data-ai-detected')) return;
    
    try {
      const tensor = await preprocessImage(img);
      // DejAIvu model uses 'input' as tensor name
      const results = await session.run({ input: tensor });
      
      // Get output data
      const outputData = results.output.data;
      let aiProbability;
      
      if (outputData.length > 1) {
        // Multiple outputs case: [p_real, p_ai]
        const probabilities = softmax([outputData[0], outputData[1]]);
        aiProbability = probabilities[1]; // p_ai is second element
      } else {
        // Single output case: direct AI probability or logit
        let value = outputData[0];
        
        // Apply sigmoid if it looks like a logit
        if (value < -10 || value > 10) {
          aiProbability = 1 / (1 + Math.exp(-value));
        } else if (value < 0 || value > 1) {
          // Might be a logit in reasonable range
          aiProbability = 1 / (1 + Math.exp(-value));
        } else {
          // Already a probability
          aiProbability = value;
        }
      }
      
      // Store result on image
      img.setAttribute('data-ai-detected', 'true');
      img.setAttribute('data-ai-probability', aiProbability.toFixed(3));
      
      // Trigger UI update
      if (window.updateImageBadge) {
        window.updateImageBadge(img, aiProbability);
      }
      
      // If AI detected with high confidence, prepare for saliency
      if (aiProbability >= 0.7) {
        img.setAttribute('data-ai-saliency-ready', 'true');
      }
      
    } catch (error) {
      console.error('NeuroCheck: Inference error', error);
      img.setAttribute('data-ai-error', 'true');
    }
  }
  
  // Process image queue with batching
  async function processBatch() {
    if (isProcessing || processingQueue.length === 0) return;
    
    isProcessing = true;
    const batch = processingQueue.splice(0, MAX_BATCH_SIZE);
    
    // Use requestIdleCallback for non-blocking processing
    const processNext = async () => {
      if (batch.length === 0) {
        isProcessing = false;
        return;
      }
      
      const img = batch.shift();
      const startTime = performance.now();
      
      await detectAI(img);
      
      const elapsed = performance.now() - startTime;
      
      // If processing took less than 50ms, continue immediately
      if (elapsed < 50) {
        processNext();
      } else {
        // Otherwise, yield to browser
        requestIdleCallback(processNext, { timeout: 100 });
      }
    };
    
    requestIdleCallback(processNext, { timeout: 100 });
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
    
    // Schedule batch processing
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
      // Skip if already processed or marked to skip
      if (img.hasAttribute('data-ai-detected') || 
          img.hasAttribute('data-ai-skip')) {
        return;
      }
      
      // Check if image is loaded
      if (img.complete && img.naturalWidth > 0) {
        if (isValidImageSize(img)) {
          queueImage(img);
        }
      } else {
        // Wait for image to load
        img.addEventListener('load', () => {
          if (isValidImageSize(img)) {
            queueImage(img);
          }
        }, { once: true });
      }
    });
  }
  
  // Set up mutation observer
  function startDetection() {
    if (observer) return;
    
    // Initial scan
    processImages();
    
    // Watch for new images
    observer = new MutationObserver((mutations) => {
      let hasNewImages = false;
      
      mutations.forEach(mutation => {
        // Check added nodes
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
  
  // Stop detection and clean up
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
    
    // Remove all badges
    document.querySelectorAll('.ai-detector-badge').forEach(badge => {
      badge.remove();
    });
    
    // Clear detection attributes
    document.querySelectorAll('[data-ai-detected]').forEach(img => {
      img.removeAttribute('data-ai-detected');
      img.removeAttribute('data-ai-probability');
      img.removeAttribute('data-ai-queued');
      img.removeAttribute('data-ai-saliency-ready');
    });
  }
  
  // Initialize
  await initializeModel();
  if (session && !skipDetection) {
    startDetection();
  }
  
  // Expose functions for other scripts
  window.aiDetector = {
    detectAI,
    queueImage,
    isValidImageSize,
    stopDetection,
    startDetection
  };
})();