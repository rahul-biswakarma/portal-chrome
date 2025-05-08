// Function to traverse DOM and build portal class hierarchy
function buildPortalClassTree(element) {
  let node = {
    element: element.tagName.toLowerCase(),
    portalClasses: [],
    children: []
  };

  // Get all classes that start with 'portal'
  if (element.classList) {
    node.portalClasses = Array.from(element.classList)
      .filter(className => className.toLowerCase().startsWith('portal'));
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
  const portalElements = document.querySelectorAll('[class*="portal"]');
  const portalClassStyles = {};

  portalElements.forEach(element => {
    const classes = Array.from(element.classList)
      .filter(className => className.toLowerCase().startsWith('portal'));

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
  }
  return true; // Keep the message channel open for async response
});
