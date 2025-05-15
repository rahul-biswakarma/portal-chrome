// UI-related functionality
import { showStatus as statusBarShowStatus } from '../components/status-bar.js';

/**
 * Shows a status message - this is a wrapper for the status bar implementation
 * @param {string} message - The message to display
 * @param {string} type - The type of message (success, error, info)
 */
export function showStatus(message, type) {
  // Delegate to the new status bar component
  statusBarShowStatus(message, type);
}

/**
 * Clean text of problematic characters
 * @param {string} text - The text to clean
 * @returns {string} Cleaned text
 */
export function cleanText(text) {
  if (!text) return '';
  return text;
}

/**
 * Function to disable/enable UI elements during processing
 * @param {boolean} isProcessing - Whether processing is happening
 * @param {string} processType - Type of processing ('image-analysis', 'css-generation', 'file-upload')
 */
export function setUIProcessingState(isProcessing, processType) {
  // Get all UI elements that should be disabled during processing
  const uiElements = document.querySelectorAll('button, input, textarea, select');

  // Key buttons that need special handling
  const uploadButton = document.getElementById('upload-image-btn');
  const generateButton = document.getElementById('generate-btn');
  const promptField = document.getElementById('user-prompt');

  // Processing types
  // - 'image-analysis': disable upload and generate buttons plus prompt field
  // - 'css-generation': disable all elements
  // - 'file-upload': disable only upload elements

  if (processType === 'image-analysis') {
    // During image analysis, explicitly disable these elements
    if (uploadButton) uploadButton.disabled = isProcessing;
    if (generateButton) generateButton.disabled = isProcessing;
    if (promptField) promptField.disabled = isProcessing;

    // Show a special cursor on the prompt field to indicate it's being auto-filled
    if (promptField) {
      promptField.style.cursor = isProcessing ? 'wait' : '';
    }

    // Add a visual indicator to show the image is being analyzed
    const imagePreviewContainer = document.getElementById('image-preview-container');
    if (imagePreviewContainer && isProcessing) {
      imagePreviewContainer.style.opacity = '0.7';
    } else if (imagePreviewContainer) {
      imagePreviewContainer.style.opacity = '1';
    }
  } else {
    // For other process types, apply general disabling logic
    uiElements.forEach(el => {
      const isImageElement = el.id.includes('image') || el.id.includes('upload');
      const isGenerateElement = el.id.includes('generate') || el.id === 'user-prompt';

      // Set disabled state based on processing type
      if (processType === 'css-generation') {
        el.disabled = isProcessing;
      } else if (processType === 'file-upload' && isImageElement) {
        el.disabled = isProcessing;
      } else if (!processType) {
        // If no specific type, disable/enable all elements
        el.disabled = isProcessing;
      }
    });
  }

  // Show/hide the progress spinner if it exists
  const spinner = document.getElementById('progress-spinner') || document.getElementById('loading-spinner');
  if (spinner) {
    spinner.style.display = isProcessing ? 'inline-block' : 'none';
  }

  // If processing is complete, scroll to the editor for CSS generation
  if (!isProcessing && processType === 'css-generation') {
    const editorContainer = document.getElementById('monaco-editor-container');
    if (editorContainer) {
      editorContainer.scrollIntoView({ behavior: 'smooth' });
    }
  }
}
