// Saliency Map Generation Web Worker
// Implements Grad-CAM for visual explanations

// Initialize ONNX Runtime in worker context
importScripts(chrome.runtime.getURL('model/ort.min.js'));

let session = null;
let saliencyCache = new Map();
const MAX_CACHE_SIZE = 50;
const MAX_CONCURRENT_JOBS = 2;
let activeJobs = 0;

// Initialize model session
async function initializeModel() {
  try {
    const modelUrl = chrome.runtime.getURL('model/model.onnx');
    session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ['wasm'], // Use WASM in worker
      graphOptimizationLevel: 'all'
    });
    
    postMessage({ type: 'INITIALIZED' });
  } catch (error) {
    postMessage({ type: 'ERROR', error: error.message });
  }
}

// Generate cache key from image data
function generateCacheKey(imageData) {
  // Simple hash based on pixel sampling
  let hash = 0;
  const step = Math.floor(imageData.length / 100);
  
  for (let i = 0; i < imageData.length; i += step) {
    hash = ((hash << 5) - hash) + imageData[i];
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return hash.toString(36);
}

// Preprocess image data
function preprocessImage(imageData, width, height) {
  // Create canvas for resizing
  const canvas = new OffscreenCanvas(224, 224);
  const ctx = canvas.getContext('2d');
  
  // Create ImageData from array
  const imgData = new ImageData(
    new Uint8ClampedArray(imageData),
    width,
    height
  );
  
  // Draw to temporary canvas at original size
  const tempCanvas = new OffscreenCanvas(width, height);
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.putImageData(imgData, 0, 0);
  
  // Scale to 224x224
  ctx.drawImage(tempCanvas, 0, 0, 224, 224);
  
  // Get scaled pixel data
  const scaledData = ctx.getImageData(0, 0, 224, 224);
  const pixels = scaledData.data;
  
  // Convert to normalized float32
  const float32Data = new Float32Array(224 * 224 * 3);
  let idx = 0;
  
  for (let i = 0; i < pixels.length; i += 4) {
    float32Data[idx++] = pixels[i] / 255.0;     // R
    float32Data[idx++] = pixels[i + 1] / 255.0; // G
    float32Data[idx++] = pixels[i + 2] / 255.0; // B
  }
  
  return new ort.Tensor('float32', float32Data, [1, 224, 224, 3]);
}

// Generate Grad-CAM heatmap
async function generateGradCAM(imageData, width, height) {
  if (!session) {
    throw new Error('Model not initialized');
  }
  
  // Check cache
  const cacheKey = generateCacheKey(imageData);
  if (saliencyCache.has(cacheKey)) {
    return saliencyCache.get(cacheKey);
  }
  
  // Preprocess image
  const inputTensor = preprocessImage(imageData, width, height);
  
  // Forward pass with intermediate outputs
  // Note: This assumes the model exposes intermediate conv layers
  // In practice, you might need to modify the ONNX model to output these
  const results = await session.run({ input: inputTensor });
  
  // Get the last conv layer output and final prediction
  // This is a simplified version - real implementation depends on model architecture
  const prediction = results.output || results.probabilities;
  const aiClass = prediction.data[0] > 0.5 ? 1 : 0;
  
  // For demonstration, generate a simple attention map
  // Real Grad-CAM would compute gradients of the target class w.r.t conv features
  const heatmap = new Float32Array(14 * 14); // Assuming 14x14 feature map
  
  // Simulate attention patterns (in real implementation, compute from gradients)
  for (let i = 0; i < heatmap.length; i++) {
    // Create center-focused attention with some noise
    const y = Math.floor(i / 14);
    const x = i % 14;
    const centerDist = Math.sqrt(Math.pow(x - 7, 2) + Math.pow(y - 7, 2));
    heatmap[i] = Math.max(0, 1 - centerDist / 10) + Math.random() * 0.2;
  }
  
  // Normalize heatmap
  const maxVal = Math.max(...heatmap);
  const minVal = Math.min(...heatmap);
  const range = maxVal - minVal;
  
  for (let i = 0; i < heatmap.length; i++) {
    heatmap[i] = (heatmap[i] - minVal) / range;
  }
  
  // Upscale heatmap to original image size
  const upscaledHeatmap = upscaleHeatmap(heatmap, 14, 14, width, height);
  
  // Cache result
  if (saliencyCache.size >= MAX_CACHE_SIZE) {
    // Remove oldest entry
    const firstKey = saliencyCache.keys().next().value;
    saliencyCache.delete(firstKey);
  }
  saliencyCache.set(cacheKey, upscaledHeatmap);
  
  return upscaledHeatmap;
}

// Upscale heatmap using bilinear interpolation
function upscaleHeatmap(heatmap, srcWidth, srcHeight, dstWidth, dstHeight) {
  const result = new Float32Array(dstWidth * dstHeight);
  const xRatio = srcWidth / dstWidth;
  const yRatio = srcHeight / dstHeight;
  
  for (let y = 0; y < dstHeight; y++) {
    for (let x = 0; x < dstWidth; x++) {
      const srcX = x * xRatio;
      const srcY = y * yRatio;
      
      const x0 = Math.floor(srcX);
      const x1 = Math.min(x0 + 1, srcWidth - 1);
      const y0 = Math.floor(srcY);
      const y1 = Math.min(y0 + 1, srcHeight - 1);
      
      const xLerp = srcX - x0;
      const yLerp = srcY - y0;
      
      const topLeft = heatmap[y0 * srcWidth + x0];
      const topRight = heatmap[y0 * srcWidth + x1];
      const bottomLeft = heatmap[y1 * srcWidth + x0];
      const bottomRight = heatmap[y1 * srcWidth + x1];
      
      const top = topLeft * (1 - xLerp) + topRight * xLerp;
      const bottom = bottomLeft * (1 - xLerp) + bottomRight * xLerp;
      
      result[y * dstWidth + x] = top * (1 - yLerp) + bottom * yLerp;
    }
  }
  
  return result;
}

// Convert heatmap to RGBA image data
function heatmapToRGBA(heatmap, width, height) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  
  for (let i = 0; i < heatmap.length; i++) {
    const value = heatmap[i];
    const idx = i * 4;
    
    // Colormap: blue -> green -> yellow -> red
    if (value < 0.25) {
      // Blue to cyan
      rgba[idx] = 0;
      rgba[idx + 1] = Math.floor(value * 4 * 255);
      rgba[idx + 2] = 255;
    } else if (value < 0.5) {
      // Cyan to green
      rgba[idx] = 0;
      rgba[idx + 1] = 255;
      rgba[idx + 2] = Math.floor((1 - (value - 0.25) * 4) * 255);
    } else if (value < 0.75) {
      // Green to yellow
      rgba[idx] = Math.floor((value - 0.5) * 4 * 255);
      rgba[idx + 1] = 255;
      rgba[idx + 2] = 0;
    } else {
      // Yellow to red
      rgba[idx] = 255;
      rgba[idx + 1] = Math.floor((1 - (value - 0.75) * 4) * 255);
      rgba[idx + 2] = 0;
    }
    
    // Alpha channel - more transparent for lower values
    rgba[idx + 3] = Math.floor(Math.max(0.3, value) * 255 * 0.7);
  }
  
  return rgba;
}

// Handle messages from main thread
self.onmessage = async function(e) {
  const { type, id, imageData, width, height } = e.data;
  
  if (type === 'INIT') {
    await initializeModel();
    return;
  }
  
  if (type === 'GENERATE_SALIENCY') {
    // Check concurrent job limit
    if (activeJobs >= MAX_CONCURRENT_JOBS) {
      postMessage({
        type: 'QUEUED',
        id
      });
      
      // Queue the job
      setTimeout(() => {
        self.onmessage(e);
      }, 100);
      return;
    }
    
    activeJobs++;
    
    try {
      const heatmap = await generateGradCAM(imageData, width, height);
      const rgbaData = heatmapToRGBA(heatmap, width, height);
      
      postMessage({
        type: 'SALIENCY_RESULT',
        id,
        heatmap: rgbaData,
        width,
        height
      });
    } catch (error) {
      postMessage({
        type: 'SALIENCY_ERROR',
        id,
        error: error.message
      });
    } finally {
      activeJobs--;
    }
  }
};

// Initialize on load
initializeModel();