// Background script that handles ONNX inference
// Properly configured for service worker environment

// Import ONNX Runtime
importScripts('model/ort.min.js');

let session = null;
let modelReady = false;

// Configure ONNX Runtime for service worker
self.ort.env.wasm.wasmPaths = chrome.runtime.getURL('model/');

// Initialize ONNX model
async function initializeModel() {
  try {
    console.log('Initializing ONNX Runtime in background...');
    console.log('WASM path:', self.ort.env.wasm.wasmPaths);
    
    // Create session with proper configuration
    const modelUrl = chrome.runtime.getURL('model/model.onnx');
    console.log('Model URL:', modelUrl);
    
    // Fetch model as ArrayBuffer
    const response = await fetch(modelUrl);
    const modelBuffer = await response.arrayBuffer();
    
    session = await ort.InferenceSession.create(modelBuffer, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
      // Disable SIMD and threads for better compatibility
      wasmOptions: {
        simd: false,
        threads: false
      }
    });
    
    // Warm up
    const dummyInput = new ort.Tensor('float32', new Float32Array(256 * 256 * 3), [1, 256, 256, 3]);
    await session.run({ input: dummyInput });
    
    modelReady = true;
    console.log('ONNX model initialized successfully');
    
    // Notify all tabs that model is ready
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { type: 'MODEL_READY' }).catch(() => {});
      });
    });
    
  } catch (error) {
    console.error('Failed to initialize ONNX model:', error);
    // Try fallback configuration
    console.log('Trying fallback configuration...');
    await initializeModelFallback();
  }
}

// Fallback initialization with minimal configuration
async function initializeModelFallback() {
  try {
    // Set minimal WASM configuration
    self.ort.env.wasm.numThreads = 1;
    self.ort.env.wasm.simd = false;
    
    const modelUrl = chrome.runtime.getURL('model/model.onnx');
    const response = await fetch(modelUrl);
    const modelBuffer = await response.arrayBuffer();
    
    session = await ort.InferenceSession.create(modelBuffer, {
      executionProviders: ['wasm']
    });
    
    modelReady = true;
    console.log('ONNX model initialized with fallback configuration');
    
  } catch (error) {
    console.error('Fallback initialization also failed:', error);
  }
}

// Run inference
async function runInference(imageData) {
  if (!session) {
    throw new Error('Model not initialized');
  }
  
  try {
    // Create tensor from flat array
    const float32Data = new Float32Array(imageData);
    const tensor = new ort.Tensor('float32', float32Data, [1, 256, 256, 3]);
    
    // Run inference
    const results = await session.run({ input: tensor });
    const outputData = results.output.data;
    
    return Array.from(outputData);
  } catch (error) {
    console.error('Inference error:', error);
    throw error;
  }
}

// Default blacklist
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
  
  // Initialize model
  initializeModel();
});

// Initialize model on startup
initializeModel();

// Check if URL matches blacklist
function isBlacklisted(url, blacklist) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    
    return blacklist.some(pattern => {
      const patternLower = pattern.toLowerCase();
      return hostname === patternLower || 
             hostname.endsWith('.' + patternLower);
    });
  } catch (e) {
    console.error('Invalid URL:', url);
    return false;
  }
}

// Listen for navigation events
chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  
  const { blacklist = DEFAULT_BLACKLIST } = await chrome.storage.sync.get('blacklist');
  const { enabled = true } = await chrome.storage.sync.get('enabled');
  
  const shouldSkip = !enabled || isBlacklisted(details.url, blacklist);
  
  chrome.storage.session.set({
    [`tab_${details.tabId}_skip`]: shouldSkip
  });
});

// Clean up session storage
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(`tab_${tabId}_skip`);
});

// Handle messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'CHECK_SKIP_STATUS') {
    chrome.storage.session.get(`tab_${sender.tab.id}_skip`).then(result => {
      const skip = result[`tab_${sender.tab.id}_skip`] || false;
      sendResponse({ skip });
    });
    return true;
  }
  
  if (request.type === 'CHECK_MODEL_READY') {
    sendResponse({ modelReady });
    return true;
  }
  
  if (request.type === 'RUN_INFERENCE') {
    if (!modelReady) {
      sendResponse({ error: 'Model not ready' });
      return true;
    }
    
    runInference(request.imageData)
      .then(outputData => {
        sendResponse({ outputData });
      })
      .catch(error => {
        sendResponse({ error: error.message });
      });
    return true; // Keep channel open for async response
  }
});