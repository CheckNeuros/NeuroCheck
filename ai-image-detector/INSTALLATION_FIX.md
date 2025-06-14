# NeuroCheck Installation Fix

## What Changed

To fix the Content Security Policy (CSP) issues on sites like Google, the extension architecture has been updated:

1. **Background Script Inference**: ONNX Runtime now runs in the background service worker instead of content scripts
2. **Message Passing**: Content scripts send image data to background for processing
3. **Simplified Saliency**: Temporary placeholder saliency maps to avoid Worker CSP issues

## Quick Setup

1. **Reload the Extension**:
   - Go to `chrome://extensions/`
   - Find "NeuroCheck"
   - Click the refresh button
   - Or remove and re-add the extension

2. **Verify Files**:
   - `background-inference.js` - New background script
   - `content/detect-simple.js` - New content script
   - All model files in `model/` directory

## Files Changed

- `manifest.json` - Updated to use new scripts
- `background-inference.js` - NEW: Handles ONNX inference
- `content/detect-simple.js` - NEW: Simplified detection logic
- `content/ui.js` - Updated: Fixed unload listener, simplified saliency

## Known Limitations

- Saliency maps are currently placeholder gradients (real Grad-CAM requires more work)
- Slightly slower due to message passing between content and background
- Limited to 8 images per batch for performance

## Testing

1. Navigate to Google Images: https://www.google.com/search?q=ai+images&udm=2
2. Check console for "NeuroCheck: Model ready" message
3. Images should show red "AI XX%" or green "REAL XX%" badges
4. No CSP errors should appear

## Troubleshooting

If still seeing errors:
1. Clear browser cache
2. Disable other extensions that might interfere
3. Check that all model files exist in `model/` directory
4. Ensure Chrome is up to date

The extension now works around strict CSP policies by running inference in the extension context!