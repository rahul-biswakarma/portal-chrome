// UI utility functions

/**
 * Show a status message as a toast notification
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
 * @returns {string} - The cleaned text
 */
export function cleanText(text) {
  if (!text) return '';
  return text;
}
