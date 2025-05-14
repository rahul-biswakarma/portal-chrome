// Add safe messaging helper at the top of the file
function safeSendMessage(message, callback) {
  try {
    // Check if Chrome runtime is available
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      console.warn('Chrome runtime not available');
      if (callback) callback({ success: false, error: 'Chrome runtime not available' });
      return;
    }

    // Direct attempt to check extension context validity
    if (chrome.runtime.id === undefined) {
      console.warn('Extension context already invalidated');
      if (callback) callback({ success: false, error: 'Extension context invalidated' });
      return;
    }

    // Add timestamp to messages for tracking
    const messageWithId = {
      ...message,
      _timestamp: Date.now()
    };

    // Send the actual message directly with proper error handling
    chrome.runtime.sendMessage(messageWithId, function(response) {
      // Check for runtime errors after sending
      if (chrome.runtime.lastError) {
        const errorMsg = chrome.runtime.lastError.message;
        console.warn('Extension message error:', errorMsg);
        if (callback) callback({ success: false, error: errorMsg });
        return;
      }

      // If response is undefined, create a default success response to prevent port closed errors
      if (response === undefined) {
        response = { success: true, data: null, silent: true };
      }

      // If we got here, everything worked
      if (callback) callback(response);
    });
  } catch (error) {
    console.error('Exception in safeSendMessage:', error);
    if (callback) callback({ success: false, error: error.message });
  }
}

// Variable to track if we're on a valid portal page
let isPortalPage = false;

// Function to check if page has portal classes
function checkForPortalClasses() {
  const portalElements = document.querySelectorAll('[class*="portal-"]');
  isPortalPage = portalElements.length > 0;

  // Notify extension about portal page status
  safeSendMessage({
    action: 'portalPageStatus',
    isPortalPage: isPortalPage
  }, () => {});

  return isPortalPage;
}

// Function to traverse DOM and build portal class hierarchy
function buildPortalClassTree(element) {
  // Check if portal classes exist at all
  if (!checkForPortalClasses()) {
    return {
      element: 'body',
      portalClasses: [],
      children: [],
      isPortalPage: false
    };
  }

  let node = {
    element: element.tagName.toLowerCase(),
    portalClasses: [],
    children: [],
    isPortalPage: true
  };

  // Get all classes that match pattern portal-*
  if (element.classList) {
    node.portalClasses = Array.from(element.classList)
      .filter(className => /^portal-.*$/.test(className));
  }

  // Recursively process child elements
  Array.from(element.children).forEach(child => {
    const childTree = buildPortalClassTree(child);
    if (childTree.portalClasses?.length > 0 || childTree.children?.length > 0) {
      node.children.push(childTree);
    }
  });

  return node;
}

// Function to get all portal classes with their computed styles
function getPortalClassesWithStyles() {
  // Check if portal classes exist
  if (!checkForPortalClasses()) {
    return { isPortalPage: false };
  }

  const portalElements = document.querySelectorAll('[class*="portal-"]');
  const portalClassStyles = { isPortalPage: true };

  portalElements.forEach(element => {
    const classes = Array.from(element.classList)
      .filter(className => /^portal-.*$/.test(className));

    classes.forEach(className => {
      if (!portalClassStyles[className]) {
        const computedStyle = window.getComputedStyle(element);
        const styles = {};

        // Get all computed styles for this element
        for (let i = 0; i < computedStyle.length; i++) {
          const prop = computedStyle[i];
          styles[prop] = computedStyle.getPropertyValue(prop);
        }

        portalClassStyles[className] = styles;
      }
    });
  });

  return portalClassStyles;
}

// Function to collect tailwind classes from elements with portal classes
function getTailwindClasses() {
  // Check if portal classes exist
  if (!checkForPortalClasses()) {
    return { isPortalPage: false };
  }

  const portalElements = document.querySelectorAll('[class*="portal-"]');
  const tailwindData = { isPortalPage: true };

  portalElements.forEach(element => {
    const portalClasses = Array.from(element.classList)
      .filter(className => /^portal-.*$/.test(className));

    const nonPortalClasses = Array.from(element.classList)
      .filter(className => !/^portal-.*$/.test(className));

    portalClasses.forEach(portalClass => {
      if (!tailwindData[portalClass]) {
        tailwindData[portalClass] = [];
      }
      tailwindData[portalClass].push(...nonPortalClasses);
    });
  });

  // Remove duplicates
  Object.keys(tailwindData).forEach(key => {
    if (key !== 'isPortalPage') {
      tailwindData[key] = [...new Set(tailwindData[key])];
    }
  });

  return tailwindData;
}

// Function to get current CSS from portal-customizer-styles element
function getCurrentCSS() {
  const styleElement = document.getElementById('portal-customizer-styles');
  return styleElement ? styleElement.textContent : '';
}

// Function to take a screenshot using Chrome's native captureVisibleTab API
async function captureFullPageScreenshot() {
  try {
    console.log('[Screenshot] Starting screenshot capture process...');

    // First attempt: Use chrome.tabs.captureVisibleTab via background script
    try {
      console.log('[Screenshot] Attempting captureVisibleTab via background script');

      const capturedData = await new Promise((resolve, reject) => {
        // Set a timeout to prevent hanging
        const timeoutId = setTimeout(() => {
          reject(new Error('Screenshot capture timed out after 5 seconds'));
        }, 5000);

        // Request screenshot from background script
        safeSendMessage({ action: 'captureVisibleTab' }, (response) => {
          clearTimeout(timeoutId);

          if (!response || !response.success) {
            reject(new Error('Background capture failed: ' + (response?.error || 'Unknown error')));
            return;
          }

          resolve(response.data);
        });
      });

      if (capturedData && capturedData.startsWith('data:image')) {
        console.log('[Screenshot] Successfully captured screenshot via background script');
        return capturedData;
      } else {
        throw new Error('Invalid screenshot data received');
      }
    } catch (backgroundError) {
      console.warn('[Screenshot] Background script capture failed:', backgroundError);
    }

    // Second attempt: Use direct captureVisibleTab
    try {
      console.log('[Screenshot] Attempting direct captureVisibleTab');

      // Just capture the visible viewport - this is the most reliable method
      return await captureVisibleViewport();
    } catch (directError) {
      console.warn('[Screenshot] Direct viewport capture failed:', directError);
    }

    // Last resort: Just return null and let caller handle it
    console.error('[Screenshot] All screenshot methods failed');
    return null;
  } catch (error) {
    console.error('[Screenshot] Screenshot capture failed completely:', error);
    throw error;
  }
}

// Simplified capture of just the visible viewport
async function captureVisibleViewport() {
  return new Promise((resolve, reject) => {
    console.log('[Screenshot] Sending direct captureVisibleTab request to background');

    // Send a direct message to the background
    chrome.runtime.sendMessage(
      { action: 'captureVisibleTab' },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error('Chrome runtime error: ' + chrome.runtime.lastError.message));
          return;
        }

        if (!response || !response.success) {
          reject(new Error('Failed to capture: ' + (response?.error || 'Unknown error')));
          return;
        }

        if (!response.data || !response.data.startsWith('data:image')) {
          reject(new Error('Invalid screenshot data received'));
          return;
        }

        console.log('[Screenshot] Successfully captured visible viewport');
        resolve(response.data);
      }
    );
  });
}

// Function to apply CSS to the page
function applyCSS(css) {
  // Check if our style element already exists
  let styleElement = document.getElementById('portal-customizer-styles');

  // If not, create it
  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.id = 'portal-customizer-styles';
    document.head.appendChild(styleElement);
  }

  // Update the CSS
  styleElement.textContent = css;

  return true;
}

// Function to highlight elements with a specific class
function highlightElementsWithClass(className) {
  // First check if we're on a portal page
  if (!checkForPortalClasses()) {
    return 0;
  }

  // Remove any existing highlights first
  removeHighlight();

  try {
    // Find all elements with the specified class
    const elements = document.querySelectorAll('.' + className);

    // Add highlight to each element
    elements.forEach(element => {
      try {
        // Save original styles
        element.dataset.originalOutline = element.style.outline;
        element.dataset.originalOutlineOffset = element.style.outlineOffset;
        element.dataset.originalZIndex = element.style.zIndex;
        element.dataset.originalPosition = element.style.position;

        // Apply highlight styles
        element.style.outline = '2px solid #ff5722';
        element.style.outlineOffset = '2px';
        element.style.zIndex = '9999';

        // Only change position to relative if it's static
        if (window.getComputedStyle(element).position === 'static') {
          element.style.position = 'relative';
        }

        // Add to highlighted elements
        element.classList.add('portal-customizer-highlighted');
      } catch (err) {
        console.warn('Error highlighting element:', err);
      }
    });

    return elements.length;
  } catch (error) {
    console.error('Error in highlightElementsWithClass:', error);
    return 0;
  }
}

// Function to remove highlights
function removeHighlight() {
  try {
    // Find all highlighted elements
    const elements = document.querySelectorAll('.portal-customizer-highlighted');

    // Restore original styles
    elements.forEach(element => {
      try {
        element.style.outline = element.dataset.originalOutline || '';
        element.style.outlineOffset = element.dataset.originalOutlineOffset || '';
        element.style.zIndex = element.dataset.originalZIndex || '';
        element.style.position = element.dataset.originalPosition || '';

        // Remove highlight class
        element.classList.remove('portal-customizer-highlighted');

        // Clean up data attributes
        delete element.dataset.originalOutline;
        delete element.dataset.originalOutlineOffset;
        delete element.dataset.originalZIndex;
        delete element.dataset.originalPosition;
      } catch (err) {
        console.warn('Error removing highlight from element:', err);
      }
    });

    return true;
  } catch (error) {
    console.error('Error in removeHighlight:', error);
    return false;
  }
}

// Function to scroll element with class into view
function scrollElementIntoView(className) {
  // First check if we're on a portal page
  if (!checkForPortalClasses()) {
    return false;
  }

  try {
    // Find the first element with the specified class
    const element = document.querySelector('.' + className);

    if (element) {
      // Scroll the element into view with smooth behavior
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });

      // Highlight the element temporarily
      highlightElementsWithClass(className);

      // Remove highlight after 2 seconds
      setTimeout(() => {
        removeHighlight();
      }, 2000);

      return true;
    }

    return false;
  } catch (error) {
    console.error('Error in scrollElementIntoView:', error);
    return false;
  }
}

// Function to set up hover detection on all portal elements
function setupHoverDetection() {
  // First check if we're on a portal page
  if (!checkForPortalClasses()) {
    return;
  }

  try {
    const portalElements = document.querySelectorAll('[class*="portal-"]');

    portalElements.forEach(element => {
      // Skip elements that already have listeners
      if (element.dataset.portalListenersAdded === 'true') {
        return;
      }

      // Mark element as having listeners
      element.dataset.portalListenersAdded = 'true';

      // Add mouse enter event using addEventListener (not inline handler)
      element.addEventListener('mouseenter', function() {
        const portalClasses = Array.from(this.classList)
          .filter(className => /^portal-.*$/.test(className));

        if (portalClasses.length > 0) {
          // Send message to popup using safe method
          safeSendMessage({
            action: 'hoverPortalElement',
            portalClasses: portalClasses
          }, () => {
            // Empty callback to handle response and prevent warnings
          });
        }
      });

      // Add mouse leave event using addEventListener (not inline handler)
      element.addEventListener('mouseleave', function() {
        safeSendMessage({
          action: 'leavePortalElement'
        }, () => {
          // Empty callback to handle response and prevent warnings
        });
      });
    });
  } catch (error) {
    console.error('Error in setupHoverDetection:', error);
  }
}

// Function to update all portal data
function updatePortalData() {
  // Check if we have portal classes first
  if (!checkForPortalClasses()) {
    // If no portal classes, notify extension
    safeSendMessage({
      action: 'noPortalClasses',
      message: 'This is not a DevRev portal page.'
    }, () => {});
    return;
  }

  // Send message to update tree, styles, tailwind classes in the extension
  safeSendMessage({
    action: 'updatePortalData',
    isPortalPage: true
  }, () => {});
}

// Function to handle page visibility changes
function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    // When page becomes visible again, update data in case anything changed
    updatePortalData();
    setupHoverDetection();
  }
}

// Call setup when page loads and when DOM changes
document.addEventListener('DOMContentLoaded', function() {
  checkForPortalClasses();
  setupHoverDetection();
  updatePortalData();
});

// Handle visibility changes (when user switches tabs)
document.addEventListener('visibilitychange', handleVisibilityChange);

// Set up a mutation observer to detect new portal elements or DOM changes
const observer = new MutationObserver((mutations) => {
  let shouldRefresh = false;

  mutations.forEach(mutation => {
    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
      // Check if any added node has portal classes or might contain elements with portal classes
      Array.from(mutation.addedNodes).forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const hasPortalClass = Array.from(node.classList || [])
            .some(className => /^portal-.*$/.test(className));

          const hasPortalDescendants = node.querySelector &&
            node.querySelector('[class*="portal-"]') !== null;

          if (hasPortalClass || hasPortalDescendants) {
            shouldRefresh = true;
          }
        }
      });
    }
    else if (mutation.type === 'attributes' &&
             mutation.attributeName === 'class' &&
             mutation.target.nodeType === Node.ELEMENT_NODE) {
      // Check if the class change involves portal classes
      const newClasses = Array.from(mutation.target.classList || []);
      if (newClasses.some(className => /^portal-.*$/.test(className))) {
        shouldRefresh = true;
      }
    }
  });

  if (shouldRefresh) {
    checkForPortalClasses(); // Update portal page status
    setupHoverDetection();  // Set up event listeners for new elements
    updatePortalData();    // Update data in the extension
  }
});

// Start observing the document with appropriate options
observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['class']
});

// Listen for navigation events using the history API
const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

// Override pushState to detect navigation
history.pushState = function() {
  originalPushState.apply(history, arguments);
  // After navigation completes, refresh our data
  setTimeout(() => {
    checkForPortalClasses();
    updatePortalData();
    setupHoverDetection();
  }, 500);
};

// Override replaceState to detect navigation
history.replaceState = function() {
  originalReplaceState.apply(history, arguments);
  // After navigation completes, refresh our data
  setTimeout(() => {
    checkForPortalClasses();
    updatePortalData();
    setupHoverDetection();
  }, 500);
};

// Listen for popstate (back/forward navigation)
window.addEventListener('popstate', function() {
  // After navigation completes, refresh our data
  setTimeout(() => {
    checkForPortalClasses();
    updatePortalData();
    setupHoverDetection();
  }, 500);
});

// Reconnect handler for runtime
function setupRuntimeReconnect() {
  // Check connection status periodically
  setInterval(() => {
    try {
      if (chrome.runtime && chrome.runtime.id) {
        // Connection is good, do nothing
      } else {
        // Runtime disconnected, reload page to reconnect
        console.log('Extension runtime disconnected, reloading content script');
        window.location.reload();
      }
    } catch (e) {
      console.warn('Error checking runtime connection:', e);
    }
  }, 10000); // Check every 10 seconds
}

// Set up runtime reconnection
setupRuntimeReconnect();

// Message listener - update with better error handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Always ensure a response, even if just an acknowledgement
  const ensureResponse = () => {
    // Send a default response if one hasn't been sent yet
    try {
      sendResponse({ success: true, message: 'Acknowledged' });
    } catch (e) {
      // Already responded or port closed, ignore
    }
  };

  // Set a timeout to ensure we always send a response
  const responseTimeout = setTimeout(ensureResponse, 500);

  // Add support for ping message (for connection checking)
  if (request.action === 'ping') {
    sendResponse({ success: true, message: 'content script connected' });
    clearTimeout(responseTimeout);
    return true;
  }

  // For hover/leave events, just acknowledge receipt
  if (request.action === 'hoverPortalElement' || request.action === 'leavePortalElement') {
    sendResponse({ success: true, silent: true });
    clearTimeout(responseTimeout);
    return true;
  }

  // Check portal page status
  if (request.action === 'checkPortalPage') {
    const isPortal = checkForPortalClasses();
    sendResponse({
      success: true,
      isPortalPage: isPortal
    });
    clearTimeout(responseTimeout);
    return true;
  }

  // Update all portal data
  if (request.action === 'updateAllData') {
    updatePortalData();
    sendResponse({ success: true });
    clearTimeout(responseTimeout);
    return true;
  }

  // Request to build portal class tree
  if (request.action === 'getPortalClassTree') {
    try {
      const tree = buildPortalClassTree(document.body);
      sendResponse({
        success: true,
        data: tree,
        isPortalPage: isPortalPage
      });
      clearTimeout(responseTimeout);
    } catch (error) {
      console.error('Error getting portal class tree:', error);
      sendResponse({
        success: false,
        error: error.message,
        isPortalPage: isPortalPage
      });
      clearTimeout(responseTimeout);
    }
  } else if (request.action === 'getPortalClassesWithStyles') {
    try {
      const styles = getPortalClassesWithStyles();
      sendResponse({
        success: true,
        data: styles,
        isPortalPage: isPortalPage
      });
      clearTimeout(responseTimeout);
    } catch (error) {
      sendResponse({
        success: false,
        error: error.message,
        isPortalPage: isPortalPage
      });
      clearTimeout(responseTimeout);
    }
  } else if (request.action === 'getTailwindClasses') {
    try {
      const tailwindClasses = getTailwindClasses();
      sendResponse({
        success: true,
        data: tailwindClasses,
        isPortalPage: isPortalPage
      });
      clearTimeout(responseTimeout);
    } catch (error) {
      sendResponse({
        success: false,
        error: error.message,
        isPortalPage: isPortalPage
      });
      clearTimeout(responseTimeout);
    }
  } else if (request.action === 'getCurrentCSS') {
    try {
      const css = getCurrentCSS();
      sendResponse({
        success: true,
        data: css
      });
      clearTimeout(responseTimeout);
    } catch (error) {
      sendResponse({
        success: false,
        error: error.message
      });
      clearTimeout(responseTimeout);
    }
  } else if (request.action === 'captureScreenshot') {
    try {
      // Best-effort screenshot approach
      captureFullPageScreenshot().then(screenshot => {
        if (screenshot) {
          sendResponse({
            success: true,
            data: screenshot
          });
        } else {
          // If we don't get a screenshot, return an error
          sendResponse({
            success: false,
            error: 'Failed to capture screenshot with all methods'
          });
        }
        clearTimeout(responseTimeout);
      }).catch(error => {
        console.error('Screenshot error:', error);
        sendResponse({
          success: false,
          error: error.message
        });
        clearTimeout(responseTimeout);
      });

      return true; // Keep the message channel open for async response
    } catch (error) {
      console.error('Error in screenshot handler:', error);
      sendResponse({
        success: false,
        error: error.message
      });
      clearTimeout(responseTimeout);
    }
  } else if (request.action === 'applyCSS') {
    try {
      const result = applyCSS(request.css);
      sendResponse({
        success: result
      });
      clearTimeout(responseTimeout);
    } catch (error) {
      sendResponse({
        success: false,
        error: error.message
      });
      clearTimeout(responseTimeout);
    }
  } else if (request.action === 'highlightElements') {
    try {
      const count = highlightElementsWithClass(request.className);
      sendResponse({
        success: true,
        count: count,
        isPortalPage: isPortalPage
      });
      clearTimeout(responseTimeout);
    } catch (error) {
      sendResponse({
        success: false,
        error: error.message,
        isPortalPage: isPortalPage
      });
      clearTimeout(responseTimeout);
    }
  } else if (request.action === 'removeHighlight') {
    try {
      const result = removeHighlight();
      sendResponse({
        success: result,
        isPortalPage: isPortalPage
      });
      clearTimeout(responseTimeout);
    } catch (error) {
      sendResponse({
        success: false,
        error: error.message,
        isPortalPage: isPortalPage
      });
      clearTimeout(responseTimeout);
    }
  } else if (request.action === 'scrollElementIntoView') {
    try {
      const result = scrollElementIntoView(request.className);
      sendResponse({
        success: result,
        isPortalPage: isPortalPage
      });
      clearTimeout(responseTimeout);
    } catch (error) {
      sendResponse({
        success: false,
        error: error.message,
        isPortalPage: isPortalPage
      });
      clearTimeout(responseTimeout);
    }
  } else {
    // Handle unknown actions
    sendResponse({
      success: false,
      error: 'Unknown action: ' + request.action
    });
    clearTimeout(responseTimeout);
  }

  return true; // Keep the message channel open for async response
});
