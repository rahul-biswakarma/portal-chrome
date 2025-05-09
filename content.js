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

// Function to take a screenshot of the page
async function captureScreenshot() {
  try {
    // Create a canvas element
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    // Set canvas dimensions to viewport size
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    // Draw the current viewport to the canvas
    context.drawWindow(window, 0, 0, width, height, 'rgb(255,255,255)');

    // Convert canvas to data URL
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch (error) {
    console.error('Error capturing screenshot:', error);
    return null;
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
        // Send message to popup
        chrome.runtime.sendMessage({
          action: 'hoverPortalElement',
          portalClasses: portalClasses
        });
      }
    });

    // Add mouse leave event
    element.addEventListener('mouseleave', () => {
      chrome.runtime.sendMessage({
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

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getPortalClassTree') {
    try {
      const tree = buildPortalClassTree(document.body);
      sendResponse({
        success: true,
        data: tree
      });
    } catch (error) {
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
      // Use html2canvas as a fallback since drawWindow is Firefox-specific
      if (typeof html2canvas !== 'undefined') {
        html2canvas(document.body).then(canvas => {
          const screenshot = canvas.toDataURL('image/jpeg', 0.7);
          sendResponse({
            success: true,
            data: screenshot
          });
        });
        return true; // Keep the message channel open for async response
      } else {
        // Try using browser-specific screenshot APIs if available
        chrome.tabs.captureVisibleTab(null, {format: 'jpeg', quality: 70}, dataUrl => {
          sendResponse({
            success: true,
            data: dataUrl
          });
        });
        return true; // Keep the message channel open for async response
      }
    } catch (error) {
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
