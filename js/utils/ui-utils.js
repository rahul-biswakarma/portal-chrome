// UI utility functions

/**
 * Show a status message as a status badge instead of toast
 * @param {string} message - The message to display
 * @param {string} type - The type of message (success, error, info)
 */
export function showStatus(message, type) {
  // Find or create status badge container
  let statusBadge = document.getElementById('status-badge');
  if (!statusBadge) {
    statusBadge = document.createElement('div');
    statusBadge.id = 'status-badge';
    statusBadge.style.position = 'fixed';
    statusBadge.style.top = '0';
    statusBadge.style.left = '0';
    statusBadge.style.right = '0';
    statusBadge.style.zIndex = '9999';
    statusBadge.style.textAlign = 'center';
    statusBadge.style.padding = '8px';
    statusBadge.style.fontSize = '12px';
    statusBadge.style.fontWeight = '500';
    statusBadge.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
    statusBadge.style.transform = 'translateY(-100%)';
    statusBadge.style.opacity = '0';
    document.body.appendChild(statusBadge);
  }

  // Set message and style based on type
  statusBadge.textContent = message;

  // Add type-specific styles
  if (type === 'success') {
    statusBadge.style.backgroundColor = '#E3FCEF';
    statusBadge.style.color = '#0E6245';
    statusBadge.style.borderBottom = '1px solid #A6E9D5';
  } else if (type === 'error') {
    statusBadge.style.backgroundColor = '#FFE9ED';
    statusBadge.style.color = '#CD2B31';
    statusBadge.style.borderBottom = '1px solid #FFC1CA';
  } else if (type === 'info') {
    statusBadge.style.backgroundColor = '#EFF8FF';
    statusBadge.style.color = '#0A558C';
    statusBadge.style.borderBottom = '1px solid #B9DDFF';
  }

  // Show the badge
  statusBadge.style.transform = 'translateY(0)';
  statusBadge.style.opacity = '1';

  // Hide after 3 seconds
  setTimeout(() => {
    statusBadge.style.transform = 'translateY(-100%)';
    statusBadge.style.opacity = '0';
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
