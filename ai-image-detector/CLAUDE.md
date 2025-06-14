# NeuroCheck Chrome Extension

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NeuroCheck is a Chrome extension that detects AI-generated images on web pages. Currently uses mock detection but designed to integrate real ML models.

## Architecture

### Core Files
- **`manifest.json`**: Chrome MV3 configuration, minimal permissions
- **`background-simple.js`**: Manages settings and blacklist checking
- **`content-simple.js`**: Main detection logic, adds badges to images
- **`popup/`**: Enable/disable toggle interface
- **`options/`**: Blacklist management page

### Key Features
- **Size filtering**: Only processes images 150px-1024px
- **Blacklist**: Skips video sites (YouTube, Vimeo, etc.)
- **Visual badges**: Red "AI XX%" or green "REAL XX%" overlays
- **No CSP issues**: Pure DOM manipulation, no dynamic script loading

## Common Tasks

### Testing the Extension
1. Load unpacked extension in Chrome
2. Visit any image-heavy site
3. Should see badges on medium-sized images
4. Check console for "NeuroCheck: Ready" message

### Adding Real ML Model
Replace the `mockDetection()` function in `content-simple.js` with actual inference:
```javascript
// Replace this:
function mockDetection() {
  const hash = Math.abs([...location.href].reduce((a,c) => a + c.charCodeAt(0), 0));
  return (hash % 100) / 100;
}

// With actual model inference
```

### Modifying Blacklist
Update `DEFAULT_BLACKLIST` in `background-simple.js` or use the options page.

### Changing Size Limits
Modify the size check in `isValidSize()` function in `content-simple.js`.

## Implementation Notes

1. **No Complex Dependencies**: Uses vanilla JS, no build process needed
2. **CSP Safe**: No dynamic script injection or workers
3. **Performance**: Processes images on load and DOM mutations only
4. **Accessibility**: ARIA labels on badges for screen readers
5. **Mock Mode**: Currently shows random but deterministic results

## Known Limitations

- Mock detection only (needs real ML model integration)
- No saliency maps (would require additional implementation)
- Simple badge positioning (may overlap with page content)

## Debugging

- Check console for "NeuroCheck:" messages
- Images get `data-ai-processed="true"` attribute when processed
- Badges have class `ai-badge` with `ai` or `real` subclass