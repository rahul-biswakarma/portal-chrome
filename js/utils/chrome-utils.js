// Chrome API utility functions

/**
 * Safe message sending function to handle extension context errors
 * @param {number} tabId - The ID of the tab to send the message to
 * @param {Object} message - The message to send
 * @param {Function} callback - Optional callback to execute when a response is received
 * @param {number} timeout - The timeout in milliseconds after which to consider the request failed
 * @returns {Promise} A promise that resolves with the response
 */
export function safeSendMessage(tabId, message, callback, timeout = 30000) {
  return new Promise((resolve) => {
    let timeoutId = null;
    let hasResponded = false;

    // Create a wrapper for the callback that ensures we only call it once
    const safeCallback = (response) => {
      if (hasResponded) return;
      hasResponded = true;

      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (callback) callback(response);
      resolve(response);
    };

    try {
      // Verify Chrome APIs are available
      if (!chrome || !chrome.tabs || !chrome.runtime) {
        console.error('Chrome APIs not available');
        safeCallback({ success: false, error: 'Chrome APIs not available' });
        return;
      }

      // Set timeout to handle cases where a response might never come
      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          console.warn('Message timed out after', timeout, 'ms');
          safeCallback({ success: false, error: 'Message sending timed out' });
        }, timeout);
      }

      // Try to send the message, with error handling
      chrome.tabs.sendMessage(tabId, message, (response) => {
        // Check for runtime errors (like extension context invalidated)
        if (chrome.runtime.lastError) {
          console.warn('Chrome runtime error:', chrome.runtime.lastError.message);

          // Special handling for common errors
          if (chrome.runtime.lastError.message.includes('Extension context invalidated')) {
            console.warn('Extension context was invalidated. Attempting recovery...');

            // Attempt to recover basic functionality
            safeCallback({
              success: false,
              error: 'Extension context invalidated',
              recoverable: false
            });
            return;
          }

          // Handle other errors
          safeCallback({
            success: false,
            error: chrome.runtime.lastError.message,
            recoverable: true
          });
          return;
        }

        // Handle empty or undefined response
        if (!response) {
          console.warn('Empty response from content script');
          safeCallback({ success: false, error: 'No response from page' });
          return;
        }

        // Success - return the response
        safeCallback(response);
      });
    } catch (error) {
      console.error('Error sending message:', error);
      safeCallback({ success: false, error: error.message });
    }
  });
}
