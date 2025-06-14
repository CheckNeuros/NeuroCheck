// Minimal background script for ONNX inference
// Uses only basic WASM without SIMD or threads

// Import ONNX Runtime
self.importScripts('./model/ort.min.js');

let session = null;
let modelReady = false;

// Configure ONNX Runtime to use basic WASM only
self.ort.env.wasm.wasmPaths = {
  'ort-wasm.wasm': chrome.runtime.getURL('model/ort-wasm.wasm'),
  'ort-wasm-simd.wasm': chrome.runtime.getURL('model/ort-wasm.wasm'), // fallback to basic
  'ort-wasm-threaded.wasm': chrome.runtime.getURL('model/ort-wasm.wasm'), // fallback to basic
  'ort-wasm-simd-threaded.wasm': chrome.runtime.getURL('model/ort-wasm.wasm') // fallback to basic
};

// Disable features that might cause issues
self.ort.env.wasm.numThreads = 1;
self.ort.env.wasm.simd = false;
self.ort.env.wasm.proxy = false;

console.log('Background script loaded, ONNX Runtime version:', ort.version);

// Initialize model
async function initializeModel() {
  try {
    console.log('Starting model initialization...');
    
    // Load model file
    const modelPath = chrome.runtime.getURL('model/model.onnx');
    console.log('Loading model from:', modelPath);
    
    // Use the most basic configuration
    session = await ort.InferenceSession.create(modelPath, {
      executionProviders: [{
        name: 'wasm',
        wasmPaths: chrome.runtime.getURL('model/')
      }]
    });
    
    console.log('Session created, warming up...');
    
    // Warm up with minimal tensor
    const warmupTensor = new ort.Tensor(
      'float32',
      new Float32Array(256 * 256 * 3).fill(0.5),
      [1, 256, 256, 3]
    );
    
    const warmupResult = await session.run({ input: warmupTensor });
    console.log('Warmup complete, output shape:', warmupResult.output.dims);
    
    modelReady = true;
    console.log('✓ Model initialized successfully!');
    
    // Notify tabs
    notifyTabs();
    
  } catch (error) {
    console.error('Model initialization failed:', error);
    console.error('Error details:', error.stack);
  }
}

// Notify all tabs that model is ready
function notifyTabs() {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { type: 'MODEL_READY' })
        .catch(() => {}); // Ignore errors for tabs without content script
    });
  });
}

// Run inference
async function runInference(imageData) {
  if (!modelReady || !session) {
    throw new Error('Model not ready');
  }
  
  const tensor = new ort.Tensor(
    'float32',
    new Float32Array(imageData),
    [1, 256, 256, 3]
  );
  
  const results = await session.run({ input: tensor });
  return Array.from(results.output.data);
}

// Default blacklist
const DEFAULT_BLACKLIST = [
  'youtube.com',
  'studio.youtube.com',
  'vimeo.com',
  'twitch.tv'
];

// Initialize on install
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Extension installed/updated');
  
  // Set defaults
  const { blacklist } = await chrome.storage.sync.get('blacklist');
  if (!blacklist) {
    await chrome.storage.sync.set({ blacklist: DEFAULT_BLACKLIST });
  }
  
  const { enabled } = await chrome.storage.sync.get('enabled');
  if (enabled === undefined) {
    await chrome.storage.sync.set({ enabled: true });
  }
  
  // Initialize model
  setTimeout(initializeModel, 1000); // Small delay to ensure everything is ready
});

// Also initialize on service worker startup
setTimeout(initializeModel, 1000);

// Handle navigation
chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  
  const { blacklist = DEFAULT_BLACKLIST } = await chrome.storage.sync.get('blacklist');
  const { enabled = true } = await chrome.storage.sync.get('enabled');
  
  const url = details.url;
  let shouldSkip = !enabled;
  
  if (!shouldSkip && blacklist.length > 0) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      
      shouldSkip = blacklist.some(pattern => {
        const p = pattern.toLowerCase();
        return hostname === p || hostname.endsWith('.' + p);
      });
    } catch (e) {
      console.error('Invalid URL:', url);
    }
  }
  
  chrome.storage.session.set({
    [`tab_${details.tabId}_skip`]: shouldSkip
  });
});

// Clean up on tab close
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(`tab_${tabId}_skip`);
});

// Message handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Received message:', request.type);
  
  switch (request.type) {
    case 'CHECK_SKIP_STATUS':
      chrome.storage.session.get(`tab_${sender.tab.id}_skip`)
        .then(result => {
          sendResponse({ skip: result[`tab_${sender.tab.id}_skip`] || false });
        });
      return true;
      
    case 'CHECK_MODEL_READY':
      sendResponse({ modelReady });
      return false;
      
    case 'RUN_INFERENCE':
      if (!modelReady) {
        sendResponse({ error: 'Model not ready yet' });
        return false;
      }
      
      runInference(request.imageData)
        .then(outputData => sendResponse({ outputData }))
        .catch(error => sendResponse({ error: error.message }));
      return true;
      
    default:
      console.warn('Unknown message type:', request.type);
      return false;
  }
});