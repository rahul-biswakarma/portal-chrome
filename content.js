// Add safe messaging helper at the top of the file
function safeSendMessage(message, callback) {
  try {
    // Check if Chrome runtime is available
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      console.warn('Chrome runtime not available');
      if (callback) callback({ success: false, error: 'Chrome runtime not available' });
      return;
    }

    // First check if we can send a message by pinging the extension
    chrome.runtime.sendMessage({ action: 'ping' }, function(response) {
      // If there's an error (like context invalidated), catch it
      if (chrome.runtime.lastError) {
        console.warn('Extension context error:', chrome.runtime.lastError.message);
        if (callback) callback({ success: false, error: chrome.runtime.lastError.message });
        return;
      }

      // If we got here, runtime is working, send the actual message
      chrome.runtime.sendMessage(message, function(actualResponse) {
        if (chrome.runtime.lastError) {
          console.warn('Error sending message:', chrome.runtime.lastError.message);
          if (callback) callback({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        if (callback) callback(actualResponse);
      });
    });
  } catch (error) {
    console.error('Exception in safeSendMessage:', error);
    if (callback) callback({ success: false, error: error.message });
  }
}

// Function to traverse DOM and build portal class hierarchy
function buildPortalClassTree(element) {
  let node = {
    element: element.tagName.toLowerCase(),
    portalClasses: [],
    children: []
  };

  // Get all classes that match pattern portal-*
  if (element.classList) {
    node.portalClasses = Array.from(element.classList)
      .filter(className => /^portal-.*$/.test(className));
  }

  // Recursively process child elements
  Array.from(element.children).forEach(child => {
    const childTree = buildPortalClassTree(child);
    if (childTree.portalClasses.length > 0 || childTree.children.length > 0) {
      node.children.push(childTree);
    }
  });

  return node;
}

// Function to get all portal classes with their computed styles
function getPortalClassesWithStyles() {
  const portalElements = document.querySelectorAll('[class*="portal-"]');
  const portalClassStyles = {};

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
  const portalElements = document.querySelectorAll('[class*="portal-"]');
  const tailwindData = {};

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
    tailwindData[key] = [...new Set(tailwindData[key])];
  });

  return tailwindData;
}

// Function to get current CSS from portal-customizer-styles element
function getCurrentCSS() {
  const styleElement = document.getElementById('portal-customizer-styles');
  return styleElement ? styleElement.textContent : '';
}

// Function to take a full page screenshot (not just the viewport)
async function captureFullPageScreenshot() {
  try {
    // First try to use the background script method for best results
    return new Promise((resolve, reject) => {
      safeSendMessage({ action: 'captureFullPage' }, (response) => {
        if (response && response.success && response.data) {
          resolve(response.data);
        } else {
          // If background method fails, try html2canvas as fallback
          performHtml2CanvasCapture().then(resolve).catch(reject);
        }
      });
    });
  } catch (error) {
    console.error('Error in captureFullPageScreenshot:', error);
    return performHtml2CanvasCapture();
  }
}

// Extract html2canvas capture logic to separate function for better organization
async function performHtml2CanvasCapture() {
  try {
    // Get the full dimensions of the page
    let fullHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.offsetHeight,
      document.body.clientHeight,
      document.documentElement.clientHeight
    );

    let fullWidth = Math.max(
      document.body.scrollWidth,
      document.documentElement.scrollWidth,
      document.body.offsetWidth,
      document.documentElement.offsetWidth,
      document.body.clientWidth,
      document.documentElement.clientWidth
    );

    // Create a canvas element in memory
    const canvas = document.createElement('canvas');
    canvas.width = fullWidth;
    canvas.height = fullHeight;
    const ctx = canvas.getContext('2d');

    // Save current scroll position
    const originalScrollTop = window.scrollY;
    const originalScrollLeft = window.scrollX;

    // Configure html2canvas - use simpler settings for better reliability
    const result = await html2canvas(document.documentElement, {
      allowTaint: true,
      useCORS: true,
      logging: false,
      width: fullWidth,
      height: fullHeight,
      x: 0,
      y: 0,
      scrollX: -window.scrollX,
      scrollY: -window.scrollY,
      scale: 1
    });

    // Restore original scroll position
    window.scrollTo(originalScrollLeft, originalScrollTop);

    // Convert canvas to data URL
    return result.toDataURL('image/jpeg', 0.85);
  } catch (error) {
    console.error('HTML2Canvas capture error:', error);
    throw error;
  }
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
  // Remove any existing highlights first
  removeHighlight();

  // Find all elements with the specified class
  const elements = document.querySelectorAll('.' + className);

  // Add highlight to each element
  elements.forEach(element => {
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
  });

  return elements.length;
}

// Function to remove highlights
function removeHighlight() {
  // Find all highlighted elements
  const elements = document.querySelectorAll('.portal-customizer-highlighted');

  // Restore original styles
  elements.forEach(element => {
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
  });
}

// Function to scroll element with class into view
function scrollElementIntoView(className) {
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
}

// Function to set up hover detection on all portal elements
function setupHoverDetection() {
  const portalElements = document.querySelectorAll('[class*="portal-"]');

  portalElements.forEach(element => {
    // Add mouse enter event
    element.addEventListener('mouseenter', () => {
      const portalClasses = Array.from(element.classList)
        .filter(className => /^portal-.*$/.test(className));

      if (portalClasses.length > 0) {
        // Send message to popup using safe method
        safeSendMessage({
          action: 'hoverPortalElement',
          portalClasses: portalClasses
        });
      }
    });

    // Add mouse leave event
    element.addEventListener('mouseleave', () => {
      safeSendMessage({
        action: 'leavePortalElement'
      });
    });
  });
}

// Call setup when page loads and when DOM changes
setupHoverDetection();

// Set up a mutation observer to detect new portal elements
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
    setupHoverDetection();
  }
});

// Start observing the document
observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['class']
});

// Message listener - update with better error handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Add support for ping message (for connection checking)
  if (request.action === 'ping') {
    sendResponse({ success: true, message: 'content script connected' });
    return;
  }

  if (request.action === 'getPortalClassTree') {
    try {
      const tree = buildPortalClassTree(document.body);
      sendResponse({
        success: true,
        data: tree
      });
    } catch (error) {
      console.error('Error getting portal class tree:', error);
      sendResponse({
        success: false,
        error: error.message
      });
    }
  } else if (request.action === 'getPortalClassesWithStyles') {
    try {
      const styles = getPortalClassesWithStyles();
      sendResponse({
        success: true,
        data: styles
      });
    } catch (error) {
      sendResponse({
        success: false,
        error: error.message
      });
    }
  } else if (request.action === 'getTailwindClasses') {
    try {
      const tailwindClasses = getTailwindClasses();
      sendResponse({
        success: true,
        data: tailwindClasses
      });
    } catch (error) {
      sendResponse({
        success: false,
        error: error.message
      });
    }
  } else if (request.action === 'getCurrentCSS') {
    try {
      const css = getCurrentCSS();
      sendResponse({
        success: true,
        data: css
      });
    } catch (error) {
      sendResponse({
        success: false,
        error: error.message
      });
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
      }).catch(error => {
        console.error('Screenshot error:', error);
        sendResponse({
          success: false,
          error: error.message
        });
      });

      return true; // Keep the message channel open for async response
    } catch (error) {
      console.error('Error in screenshot handler:', error);
      sendResponse({
        success: false,
        error: error.message
      });
    }
  } else if (request.action === 'applyCSS') {
    try {
      const result = applyCSS(request.css);
      sendResponse({
        success: result
      });
    } catch (error) {
      sendResponse({
        success: false,
        error: error.message
      });
    }
  } else if (request.action === 'highlightElements') {
    try {
      const count = highlightElementsWithClass(request.className);
      sendResponse({
        success: true,
        count: count
      });
    } catch (error) {
      sendResponse({
        success: false,
        error: error.message
      });
    }
  } else if (request.action === 'removeHighlight') {
    try {
      removeHighlight();
      sendResponse({
        success: true
      });
    } catch (error) {
      sendResponse({
        success: false,
        error: error.message
      });
    }
  } else if (request.action === 'scrollElementIntoView') {
    try {
      const result = scrollElementIntoView(request.className);
      sendResponse({
        success: result
      });
    } catch (error) {
      sendResponse({
        success: false,
        error: error.message
      });
    }
  }

  return true; // Keep the message channel open for async response
});
