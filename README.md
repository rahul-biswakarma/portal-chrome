# Portal Design Customizer Chrome Extension

A Chrome extension that allows you to customize portal designs with AI-generated CSS based on natural language prompts.

## Features

- Side panel interface for easy access
- Customize portal designs with natural language prompts
- View and modify the HTML hierarchy
- Save and load different versions of your designs
- Configure your OpenAI API key

## Development

### Prerequisites

- Node.js (version 18 or higher)
- npm (version 9 or higher)

### Setup

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```

### Development Build

To build the extension in development mode with file watching:

```
npm run watch
```

### Production Build

To build the extension for production:

```
npm run build:extension
```

## Loading the Extension in Chrome

1. Build the extension using one of the commands above
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" using the toggle in the top-right corner
4. Click "Load unpacked" and select the `dist` directory
5. The extension should now be loaded and visible in your extensions list

## Using the Extension

1. Click the extension icon in your toolbar to open the side panel
2. Use the tabs to navigate between different features:
   - **Customize**: Create custom CSS using AI
   - **Hierarchy**: View and modify the HTML structure
   - **Versions**: Save and load different design versions
   - **Settings**: Configure your API key and other settings

## Project Structure

- `src/`: Source code
  - `components/`: React components
  - `services/`: API and service functions
  - `utils/`: Utility functions
  - `types/`: TypeScript type definitions
  - `background.ts`: Extension background script
  - `content.ts`: Content script injected into web pages
  - `manifest.json`: Chrome extension manifest file
  - `App.tsx`: Main React application
- `dist/`: Built extension (created after build)

## License

[MIT License](LICENSE)
