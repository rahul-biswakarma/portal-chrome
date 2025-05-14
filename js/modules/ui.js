// UI-related functionality

/**
 * Shows a status message as a toast notification
 * @param {string} message - The message to display
 * @param {string} type - The type of message (success, error, info)
 */
export function showStatus(message, type) {
  // Find or create toast container
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.style.position = 'fixed';
    toastContainer.style.bottom = '20px';
    toastContainer.style.right = '20px';
    toastContainer.style.zIndex = '9999';
    document.body.appendChild(toastContainer);
  }

  // Create toast element
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  // Style the toast
  toast.style.padding = '10px 15px';
  toast.style.borderRadius = '4px';
  toast.style.marginTop = '10px';
  toast.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
  toast.style.minWidth = '200px';
  toast.style.animation = 'fadeIn 0.3s, fadeOut 0.3s 2.7s';
  toast.style.opacity = '0';

  // Add type-specific styles
  if (type === 'success') {
    toast.style.backgroundColor = '#d4edda';
    toast.style.color = '#155724';
    toast.style.borderLeft = '4px solid #28a745';
  } else if (type === 'error') {
    toast.style.backgroundColor = '#f8d7da';
    toast.style.color = '#721c24';
    toast.style.borderLeft = '4px solid #dc3545';
  } else if (type === 'info') {
    toast.style.backgroundColor = '#d1ecf1';
    toast.style.color = '#0c5460';
    toast.style.borderLeft = '4px solid #17a2b8';
  }

  // Add to container
  toastContainer.appendChild(toast);

  // Fade in
  setTimeout(() => {
    toast.style.opacity = '1';
  }, 10);

  // Remove after 3 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, 3000);
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

  // Processing types
  // - 'image-analysis': disable only image upload elements
  // - 'css-generation': disable all elements
  // - 'file-upload': disable only upload elements

  uiElements.forEach(el => {
    const isImageElement = el.id.includes('image') || el.id.includes('upload');
    const isGenerateElement = el.id.includes('generate') || el.id === 'user-prompt';

    // Set disabled state based on processing type
    if (processType === 'image-analysis' && isImageElement) {
      el.disabled = isProcessing;
    } else if (processType === 'css-generation') {
      el.disabled = isProcessing;
    } else if (processType === 'file-upload' && isImageElement) {
      el.disabled = isProcessing;
    } else if (!processType) {
      // If no specific type, disable/enable all elements
      el.disabled = isProcessing;
    }
  });

  // Show/hide the progress spinner
  const spinner = document.getElementById('progress-spinner');
  if (spinner) {
    spinner.style.display = isProcessing ? 'block' : 'none';
  }

  // If processing is complete, scroll to the editor
  if (!isProcessing && processType === 'css-generation') {
    const editorContainer = document.getElementById('editor-container');
    if (editorContainer) {
      editorContainer.scrollIntoView({ behavior: 'smooth' });
    }
  }
}
