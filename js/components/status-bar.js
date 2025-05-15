/**
 * VSCode-style status bar component
 * This module provides a persistent status bar at the bottom of the extension
 * that replaces the previous toast notification system.
 */

// Status bar states
const STATUS_TYPES = {
  INFO: 'info',
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  LOADING: 'loading'
};

// Status bar icons (using simple unicode for compatibility)
const STATUS_ICONS = {
  [STATUS_TYPES.INFO]: 'ℹ️',
  [STATUS_TYPES.SUCCESS]: '✓',
  [STATUS_TYPES.ERROR]: '✕',
  [STATUS_TYPES.WARNING]: '⚠️',
  [STATUS_TYPES.LOADING]: '↻'
};

// Process stages for the status bar
const PROCESS_STAGES = {
  IDLE: { text: '', class: '' },
  ANALYZING: { text: 'ANALYZING', class: 'analyzing' },
  GENERATING: { text: 'GENERATING', class: 'generating' },
  APPLYING: { text: 'APPLYING', class: 'applying' },
  CAPTURING: { text: 'CAPTURING', class: 'capturing' },
  VERIFYING: { text: 'VERIFYING', class: 'verifying' },
  REVIEW: { text: 'REVIEW', class: 'review' }
};

// Store for active timers
let statusTimeouts = {
  message: null,
  loading: null,
  highlight: null
};

// Current process stage
let currentStage = PROCESS_STAGES.IDLE;

/**
 * Initialize the status bar
 * Call this when the extension loads
 */
export function initStatusBar() {
  // Create status bar container if it doesn't exist
  if (!document.getElementById('status-bar')) {
    // Create and style status bar
    const statusBar = document.createElement('div');
    statusBar.id = 'status-bar';

    // Style the status bar container
    statusBar.style.position = 'fixed';
    statusBar.style.left = '0';
    statusBar.style.right = '0';
    statusBar.style.bottom = '0';
    statusBar.style.height = '22px';
    statusBar.style.backgroundColor = '#007ACC'; // VSCode default blue
    statusBar.style.color = '#FFFFFF';
    statusBar.style.fontSize = '12px';
    statusBar.style.fontFamily = '\'Inter\', -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif';
    statusBar.style.display = 'flex';
    statusBar.style.alignItems = 'center';
    statusBar.style.padding = '0 8px';
    statusBar.style.zIndex = '9999';
    statusBar.style.boxShadow = '0 -1px 3px rgba(0,0,0,0.1)';

    // Left section for status messages
    const leftSection = document.createElement('div');
    leftSection.id = 'status-bar-left';
    leftSection.style.display = 'flex';
    leftSection.style.alignItems = 'center';
    leftSection.style.flex = '1';

    // Message container
    const messageContainer = document.createElement('div');
    messageContainer.id = 'status-message';
    messageContainer.style.display = 'flex';
    messageContainer.style.alignItems = 'center';
    messageContainer.style.padding = '0 8px';
    messageContainer.style.height = '100%';

    // Message icon
    const messageIcon = document.createElement('span');
    messageIcon.id = 'status-icon';
    messageIcon.style.marginRight = '6px';
    messageIcon.style.fontSize = '12px';
    messageIcon.textContent = STATUS_ICONS[STATUS_TYPES.INFO];

    // Message text
    const messageText = document.createElement('span');
    messageText.id = 'status-text';
    messageText.textContent = 'Ready';

    // Right section for indicators and actions
    const rightSection = document.createElement('div');
    rightSection.id = 'status-bar-right';
    rightSection.style.display = 'flex';
    rightSection.style.alignItems = 'center';

    // Process stage indicator
    const stageIndicator = document.createElement('div');
    stageIndicator.id = 'status-stage';
    stageIndicator.textContent = '';

    // Loading spinner (hidden by default)
    const loadingSpinner = document.createElement('div');
    loadingSpinner.id = 'status-spinner';
    loadingSpinner.style.width = '10px';
    loadingSpinner.style.height = '10px';
    loadingSpinner.style.border = '2px solid rgba(255,255,255,0.3)';
    loadingSpinner.style.borderRadius = '50%';
    loadingSpinner.style.borderTopColor = '#FFFFFF';
    loadingSpinner.style.animation = 'status-spin 1s linear infinite';
    loadingSpinner.style.marginRight = '8px';
    loadingSpinner.style.display = 'none';

    // Add elements to the DOM
    messageContainer.appendChild(messageIcon);
    messageContainer.appendChild(messageText);
    leftSection.appendChild(messageContainer);
    rightSection.appendChild(stageIndicator);
    rightSection.appendChild(loadingSpinner);
    statusBar.appendChild(leftSection);
    statusBar.appendChild(rightSection);

    // Add animation for spinner
    const style = document.createElement('style');
    style.textContent = `
      @keyframes status-spin {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);

    // Add to body
    document.body.appendChild(statusBar);
  }

  // Set default state
  showStatus('Ready');
}

/**
 * Set the current process stage in the status bar
 * @param {string} stage - The stage key from PROCESS_STAGES
 * @param {boolean} isProcessing - Whether processing is active (changes status bar height)
 */
export function setProcessStage(stage, isProcessing = true) {
  const statusBar = document.getElementById('status-bar');
  const stageIndicator = document.getElementById('status-stage');

  if (!statusBar || !stageIndicator) return;

  // Reset previous stage - filter out empty class values to avoid DOM error
  const classesToRemove = Object.values(PROCESS_STAGES)
    .map(s => s.class)
    .filter(className => className && className.trim() !== '');

  if (classesToRemove.length > 0) {
    stageIndicator.classList.remove(...classesToRemove);
  }

  // Set new stage
  currentStage = PROCESS_STAGES[stage] || PROCESS_STAGES.IDLE;

  if (currentStage.text) {
    stageIndicator.textContent = currentStage.text;
    stageIndicator.classList.add('visible');
    if (currentStage.class && currentStage.class.trim() !== '') {
      stageIndicator.classList.add(currentStage.class);
    }
  } else {
    stageIndicator.textContent = '';
    stageIndicator.classList.remove('visible');
  }

  // Add processing class to status bar for more height during processing
  if (isProcessing) {
    statusBar.classList.add('processing');
  } else {
    statusBar.classList.remove('processing');
  }
}

/**
 * Show a status message in the status bar
 * @param {string} message - The message to display
 * @param {string} type - The type of message (info, success, error, warning)
 * @param {number} duration - How long to show the message in ms (0 for permanent)
 * @param {boolean} highlight - Whether to highlight the message with animation
 */
export function showStatus(message, type = STATUS_TYPES.INFO, duration = 3000, highlight = false) {
  // Get status elements
  const statusBar = document.getElementById('status-bar');
  const statusIcon = document.getElementById('status-icon');
  const statusText = document.getElementById('status-text');

  if (!statusBar || !statusIcon || !statusText) {
    console.error('Status bar not initialized. Call initStatusBar first.');
    return;
  }

  // Automatically detect process stage based on message content
  if (message.toLowerCase().includes('analyzing')) {
    setProcessStage('ANALYZING');
  } else if (message.toLowerCase().includes('generating')) {
    setProcessStage('GENERATING');
  } else if (message.toLowerCase().includes('applying css')) {
    setProcessStage('APPLYING');
  } else if (message.toLowerCase().includes('captur') && message.toLowerCase().includes('screenshot')) {
    setProcessStage('CAPTURING');
  } else if (message.toLowerCase().includes('review') || message.toLowerCase().includes('round')) {
    setProcessStage('REVIEW');
  } else if (message.toLowerCase().includes('visual match') || message.toLowerCase().includes('verifying')) {
    setProcessStage('VERIFYING');
  } else if (message === 'Ready' || type === STATUS_TYPES.SUCCESS) {
    setProcessStage('IDLE', false);
  }

  // Clear any existing timeout
  if (statusTimeouts.message) {
    clearTimeout(statusTimeouts.message);
    statusTimeouts.message = null;
  }

  // Clear highlight timeout
  if (statusTimeouts.highlight) {
    clearTimeout(statusTimeouts.highlight);
    statusTimeouts.highlight = null;
    statusText.classList.remove('highlight');
  }

  // Set the status icon and message
  statusIcon.textContent = STATUS_ICONS[type] || STATUS_ICONS[STATUS_TYPES.INFO];
  statusText.textContent = message;

  // Apply highlight animation if requested
  if (highlight) {
    statusText.classList.add('highlight');
    statusTimeouts.highlight = setTimeout(() => {
      statusText.classList.remove('highlight');
    }, 5000); // Stop animation after 5 seconds
  }

  // Make status bar more prominent during processing
  if (type === STATUS_TYPES.LOADING || type === STATUS_TYPES.INFO &&
      (message.includes('Analyzing') || message.includes('Generating') ||
       message.includes('Applying') || message.includes('Capturing'))) {
    statusBar.classList.add('processing');
  } else if (type === STATUS_TYPES.SUCCESS || type === STATUS_TYPES.ERROR) {
    statusBar.classList.remove('processing');
  }

  // Set type-specific background colors
  if (type === STATUS_TYPES.SUCCESS) {
    statusBar.style.backgroundColor = '#26A69A'; // Material teal
  } else if (type === STATUS_TYPES.ERROR) {
    statusBar.style.backgroundColor = '#D32F2F'; // Brighter red
  } else if (type === STATUS_TYPES.WARNING) {
    statusBar.style.backgroundColor = '#FFA000'; // Material orange
  } else if (type === STATUS_TYPES.LOADING) {
    statusBar.style.backgroundColor = '#2196F3'; // Brighter blue
    // Show the spinner for loading status
    setLoadingSpinner(true);
  } else {
    statusBar.style.backgroundColor = '#1976D2'; // Material blue
  }

  // Reset to default after duration if not permanent
  if (duration > 0) {
    statusTimeouts.message = setTimeout(() => {
      statusBar.style.backgroundColor = '#1976D2'; // Reset to default
      statusIcon.textContent = STATUS_ICONS[STATUS_TYPES.INFO];
      statusText.textContent = 'Ready';
      statusBar.classList.remove('processing');
      setProcessStage('IDLE', false);

      // Hide spinner if shown
      if (type === STATUS_TYPES.LOADING) {
        setLoadingSpinner(false);
      }
    }, duration);
  }
}

/**
 * Show a loading indicator in the status bar
 * @param {string} message - The loading message to display
 * @param {boolean} isLoading - Whether to show or hide the loading indicator
 * @param {string} stage - Optional stage to show (from PROCESS_STAGES keys)
 */
export function showLoading(message = 'Loading...', isLoading = true, stage = '') {
  if (isLoading) {
    // Set process stage if provided
    if (stage && PROCESS_STAGES[stage]) {
      setProcessStage(stage, true);
    }

    showStatus(message, STATUS_TYPES.LOADING, 0); // 0 duration means permanent until changed
  } else {
    // If we're stopping loading, show success briefly then reset
    showStatus('Done', STATUS_TYPES.SUCCESS);
    setLoadingSpinner(false);
    setProcessStage('IDLE', false);
  }
}

/**
 * Set the visibility of the loading spinner
 * @param {boolean} visible - Whether to show the spinner
 */
function setLoadingSpinner(visible) {
  const spinner = document.getElementById('status-spinner');
  if (spinner) {
    spinner.style.display = visible ? 'block' : 'none';
  }
}

/**
 * Clear all status messages
 */
export function clearStatus() {
  const statusBar = document.getElementById('status-bar');
  const statusIcon = document.getElementById('status-icon');
  const statusText = document.getElementById('status-text');

  if (statusBar && statusIcon && statusText) {
    statusBar.style.backgroundColor = '#1976D2'; // Reset to default
    statusIcon.textContent = STATUS_ICONS[STATUS_TYPES.INFO];
    statusText.textContent = 'Ready';
    setLoadingSpinner(false);
    statusBar.classList.remove('processing');
    setProcessStage('IDLE', false);
  }

  // Clear timeouts
  if (statusTimeouts.message) {
    clearTimeout(statusTimeouts.message);
    statusTimeouts.message = null;
  }

  if (statusTimeouts.highlight) {
    clearTimeout(statusTimeouts.highlight);
    statusTimeouts.highlight = null;
  }
}

// Constants export for usage elsewhere
export { STATUS_TYPES, PROCESS_STAGES };
