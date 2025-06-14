# NeuroCheck Chrome Extension

A privacy-preserving Chrome extension that detects AI-generated images on any webpage using on-device machine learning inference.

## Features

- **Real-time Detection**: Automatically analyzes images as you browse
- **Visual Explanations**: Saliency maps show why an image was flagged as AI-generated
- **Privacy-First**: All processing happens locally - no images are sent to servers
- **Performance Optimized**: Smart batching and size filtering prevent slowdowns
- **Customizable**: Blacklist sites and toggle detection on/off
- **Accessible**: Color-blind safe colors and screen reader support

## Installation

### From Source

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/neurocheck.git
   cd neurocheck
   ```

2. Add required files:
   - Place your ONNX model file as `model/model.onnx`
   - Download ONNX Runtime Web and place as `model/ort.min.js`
   - Add an icon file as `icons/icon128.png`

3. Load in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `neurocheck` directory

## Build Instructions

### Prerequisites

- Node.js (for optional build tools)
- ONNX model trained for AI image detection
- ONNX Runtime Web library

### Manual Setup

1. **ONNX Runtime Web**:
   ```bash
   # Download from CDN
   curl -o model/ort.min.js https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js
   ```

2. **Model Requirements**:
   - Input: `float32[1, 224, 224, 3]` (batch, height, width, channels)
   - Output: `float32[1]` (probability of being AI-generated)
   - The model should output values between 0 and 1

3. **Icon**:
   - Create a 128x128 PNG icon and save as `icons/icon128.png`

### Optional: ESLint & Prettier

```bash
# Install dev dependencies
npm init -y
npm install --save-dev eslint prettier eslint-config-prettier

# Create .eslintrc.json
echo '{"extends": ["eslint:recommended"], "env": {"browser": true, "es2021": true}}' > .eslintrc.json

# Run linting
npx eslint .
npx prettier --write .
```

## Usage

1. **Enable/Disable**: Click the extension icon to toggle detection on/off
2. **View Results**: Look for badges on images:
   - Red "AI XX%" - Likely AI-generated
   - Green "REAL XX%" - Likely authentic
3. **See Why**: Click "Show why" on AI-detected images to see the attention heatmap
4. **Customize**: Right-click the extension icon and select "Options" to manage blacklisted sites

## Architecture

### Components

- **Service Worker** (`background.js`): Manages blacklist and extension state
- **Content Scripts**:
  - `detect.js`: Loads ONNX model and performs inference
  - `ui.js`: Creates visual overlays and badges
  - `saliency.js`: Web Worker for generating explanation heatmaps
- **Popup**: Simple toggle interface
- **Options**: Blacklist management page

### Performance Optimizations

1. **Size Filtering**: Only processes images 150px-1024px
2. **Batch Processing**: Groups up to 8 images per 500ms
3. **Async Operations**: Uses `requestIdleCallback` to prevent blocking
4. **Worker Threads**: Saliency computation in dedicated worker
5. **Caching**: Heatmaps cached by image hash

### Privacy & Security

- All inference runs locally using ONNX Runtime Web
- No network requests to external servers
- No tracking or analytics
- Images never leave the device
- Minimal permissions required

## Development

### Project Structure

```
neurocheck/
├── manifest.json          # Extension manifest (MV3)
├── background.js          # Service worker
├── content/
│   ├── detect.js         # Main detection logic
│   ├── saliency.js       # Grad-CAM worker
│   └── ui.js             # UI overlay helpers
├── model/
│   ├── model.onnx        # AI detection model
│   └── ort.min.js        # ONNX Runtime
├── popup/                # Extension popup
├── options/              # Settings page
└── icons/                # Extension icons
```

### Adding New Features

1. **New Detection Models**: Update input preprocessing in `detect.js`
2. **UI Customization**: Modify styles in `ui.js`
3. **Performance Tuning**: Adjust `MAX_BATCH_SIZE` and `BATCH_INTERVAL`

## Troubleshooting

### Common Issues

1. **"Model not found"**: Ensure `model.onnx` exists in the `model/` directory
2. **Slow performance**: Try reducing `MAX_BATCH_SIZE` or increasing `MIN_SIZE`
3. **Not detecting on some sites**: Check if the site is blacklisted in options

### Debug Mode

Open the Chrome DevTools console and look for messages prefixed with "NeuroCheck:"

## License

This extension is released under the MIT License. See LICENSE file for details.

The ONNX model and ONNX Runtime have their own licenses - please check their respective repositories.

## Credits

- Built with [ONNX Runtime Web](https://github.com/microsoft/onnxruntime)
- Grad-CAM implementation inspired by academic research
- Icons from [Your Icon Source]

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Add tests if applicable
4. Submit a pull request

For major changes, please open an issue first to discuss the proposed changes.