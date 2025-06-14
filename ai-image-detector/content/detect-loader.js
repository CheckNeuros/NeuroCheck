// Loader script that properly handles ONNX Runtime loading
// This approach works better with strict CSP policies

(async function() {
  // First check if we should skip
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
  
  // Create an iframe to load ONNX Runtime in an isolated context
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.sandbox = 'allow-scripts';
  document.documentElement.appendChild(iframe);
  
  // Create a simple HTML page that loads ONNX Runtime
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <script src="${chrome.runtime.getURL('model/ort.min.js')}"></script>
    </head>
    <body>
      <script>
        // Wait for ONNX Runtime to load
        window.addEventListener('message', async (event) => {
          if (event.data.type === 'INIT_ORT') {
            try {
              // Create session
              const session = await ort.InferenceSession.create(
                event.data.modelUrl,
                {
                  executionProviders: ['wasm'],
                  graphOptimizationLevel: 'all'
                }
              );
              
              // Warm up
              const dummyInput = new ort.Tensor('float32', new Float32Array(256 * 256 * 3), [1, 256, 256, 3]);
              await session.run({ input: dummyInput });
              
              parent.postMessage({ type: 'ORT_READY' }, '*');
            } catch (error) {
              parent.postMessage({ type: 'ORT_ERROR', error: error.message }, '*');
            }
          } else if (event.data.type === 'RUN_INFERENCE') {
            try {
              const { imageData, width, height, id } = event.data;
              
              // Create tensor from image data
              const float32Data = new Float32Array(imageData);
              const tensor = new ort.Tensor('float32', float32Data, [1, width, height, 3]);
              
              // Run inference
              const results = await session.run({ input: tensor });
              const outputData = results.output.data;
              
              parent.postMessage({
                type: 'INFERENCE_RESULT',
                id,
                outputData: Array.from(outputData)
              }, '*');
            } catch (error) {
              parent.postMessage({
                type: 'INFERENCE_ERROR',
                id,
                error: error.message
              }, '*');
            }
          }
        });
      </script>
    </body>
    </html>
  `;
  
  iframe.srcdoc = html;
  
  // Wait for iframe to load
  await new Promise(resolve => {
    iframe.onload = resolve;
  });
  
  // Initialize ONNX Runtime in iframe
  const modelUrl = chrome.runtime.getURL('model/model.onnx');
  iframe.contentWindow.postMessage({ type: 'INIT_ORT', modelUrl }, '*');
  
  // Wait for initialization
  const ortReady = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('ORT initialization timeout')), 30000);
    
    window.addEventListener('message', function handler(event) {
      if (event.data.type === 'ORT_READY') {
        clearTimeout(timeout);
        window.removeEventListener('message', handler);
        resolve(true);
      } else if (event.data.type === 'ORT_ERROR') {
        clearTimeout(timeout);
        window.removeEventListener('message', handler);
        reject(new Error(event.data.error));
      }
    });
  });
  
  if (!ortReady) {
    console.error('NeuroCheck: Failed to initialize ONNX Runtime');
    return;
  }
  
  console.log('NeuroCheck: Initialized successfully via iframe');
  
  // Now load the main detection script with the iframe context
  window.aiDetectorIframe = iframe;
  
  // Load the rest of the detection logic
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('content/detect-main.js');
  script.onload = () => console.log('NeuroCheck: Main detection script loaded');
  script.onerror = (e) => console.error('NeuroCheck: Failed to load main script', e);
  document.documentElement.appendChild(script);
})();