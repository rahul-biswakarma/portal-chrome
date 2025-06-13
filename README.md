# Portal Chrome Extension

A Chrome extension for customizing portal interfaces with AI-powered theme generation.

## Features

### 🎨 AI Theme Generation with Gemini

- **Smart Theme Suggestions**: Uses Google's Gemini AI to analyze your current page and generate 6 personalized theme suggestions
- **Context-Aware**: Takes into account your current theme settings, page layout, and visual elements
- **Real-time Screenshot Analysis**: Captures your current page to provide relevant theme recommendations
- **Professional Design**: Generated themes are carefully crafted for professional web applications
- **Fallback Support**: Automatically falls back to curated themes if Gemini API is unavailable

### Theme Customization

- **Font Management**: Customize heading and paragraph fonts from a curated selection
- **Color Schemes**: Adjust accent, label, and neutral colors with real-time preview
- **Layout Controls**: Fine-tune spacing, border radius, and border width
- **Live Preview**: See changes applied instantly to your page

### CSS Generation

- **AI-Powered CSS**: Generate CSS using Gemini AI
- **Visual Feedback Loop**: Iterative improvement based on visual comparisons
- **Manual CSS Editor**: Direct CSS editing with syntax highlighting
- **DevRev Integration**: Save and load themes from DevRev portal preferences

## Setup

### Prerequisites

1. **Gemini API Key**: Get your free API key from [Google AI Studio](https://ai.google.dev/)
2. **DevRev Credentials** (optional): For theme persistence

### Installation

1. Clone this repository
2. Run `npm install`
3. Run `npm run build`
4. Load the `dist` folder as an unpacked extension in Chrome

### Configuration

1. Open the extension popup
2. Go to **Settings** tab
3. Enter your API keys:
   - **Gemini API Key**: Required for AI theme generation
   - **DevRev Credentials**: Optional, for theme saving

## Usage

### AI Theme Generation

1. Navigate to any portal or web application
2. Open the extension popup
3. Go to **Theme Editor** tab
4. Click **✨ Generate Themes** button
5. Wait for Gemini to analyze your page and generate suggestions
6. Click **Apply Theme** on any suggestion you like

The AI will:

- Take a screenshot of your current page
- Analyze the visual elements and layout
- Consider your current theme settings
- Generate 6 unique, professional theme suggestions
- Provide creative names and cohesive color schemes

### Manual Theme Editing

- Use the **Font Settings** to change typography
- Adjust **Color Settings** for accent, label, and neutral colors
- Modify **Layout Settings** for spacing and borders
- All changes are applied in real-time

### CSS Generation

1. Go to **Customize** tab
2. Upload a reference image
3. The AI will generate CSS to match the design
4. Refine through multiple iterations

## API Integration

### Gemini AI Integration

The extension uses Google's Gemini 2.0 Flash model for theme generation:

```typescript
// Example usage
const themes = await generateThemesWithGemini({
  headingFont: 'Inter',
  paragraphFont: 'Inter',
  accentColor: '#8B5CF6',
  // ... other current theme properties
});
```

The AI receives:

- Current page screenshot
- Current theme context
- Professional design requirements
- Response format specifications

### Error Handling

- Graceful fallback to curated themes if API fails
- Clear error messages for missing API keys
- Automatic retry logic for network issues

## Development

### Building

```bash
npm run build
```

### Development Mode

```bash
npm run dev
```

### Project Structure

```
src/
├── components/
│   └── views/
│       └── theme-editor/
│           └── components/
│               ├── theme-suggestions.tsx    # Gemini AI integration
│               ├── theme-editor-controls.tsx
│               └── ...
├── utils/
│   ├── gemini-client.ts                     # Gemini API client
│   ├── screenshot.ts                        # Screenshot utilities
│   └── ...
└── ...
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues related to:

- **Gemini API**: Check your API key and quota at [Google AI Studio](https://ai.google.dev/)
- **Theme Generation**: Ensure you have a stable internet connection
- **Extension Issues**: Check the browser console for error messages

---

**Note**: This extension requires appropriate API keys for full functionality. The Gemini integration provides the most advanced theme generation capabilities.
