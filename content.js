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
