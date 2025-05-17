// Inline the type and utility functions directly instead of importing
type TreeNode = {
  element: string;
  portalClasses: string[];
  children: TreeNode[];
};

console.log('Portal Design Customizer content script loaded');

// Types for element styling
interface ElementStyles {
  outline: string;
  outlineOffset: string;
  zIndex: string;
  position: string;
}

interface HTMLElementWithStyles extends HTMLElement {
  _originalStyles?: ElementStyles;
}

// Current status
let activeHighlights: HTMLElementWithStyles[] = [];
const styleId = 'portal-design-customizer-css';

// Utility functions inlined to avoid imports
/**
 * Check if the current URL is a restricted URL that cannot be accessed by extensions
 * @returns {boolean} True if the URL is restricted
 */
function isRestrictedUrl(url: string): boolean {
  // Check if URL starts with any of these restricted protocols
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('chrome-search://') ||
    url.startsWith('chrome-devtools://') ||
    url.startsWith('devtools://') ||
    url.startsWith('view-source:') ||
    url.startsWith('about:') ||
    url.startsWith('edge:') || // For Edge
    url.startsWith('data:')
  );
}

/**
 * Check if the current DOM contains elements with class names starting with 'portal-'
 * @returns {boolean} True if portal classes are found, false otherwise
 */
function hasPortalClasses(): boolean {
  try {
    // First check if we're on a restricted page
    if (isRestrictedUrl(window.location.href)) {
      console.warn(
        'Cannot check for portal classes on restricted URL:',
        window.location.href,
      );
      return false;
    }

    // Use querySelector with a CSS attribute selector to find elements with classes starting with 'portal-'
    const portalElements = document.querySelectorAll('[class*="portal-"]');

    // Check if we found any elements
    return portalElements.length > 0;
  } catch (error) {
    console.error('Error checking for portal classes:', error);
    return false;
  }
}

// Check compatibility when content script loads
checkPageCompatibility();

/**
 * Check if the current page is compatible with the extension
 */
function checkPageCompatibility() {
  // Skip if we're on a restricted URL
  if (isRestrictedUrl(window.location.href)) {
    chrome.runtime
      .sendMessage({
        action: 'checkCompatibility',
        data: { compatible: false, restricted: true },
      })
      .catch((error) => {
        console.error('Error sending compatibility status:', error);
      });
    return;
  }

  // Check if the page has portal-* classes
  const compatible = hasPortalClasses();

  // Notify the background script of compatibility status
  chrome.runtime
    .sendMessage({
      action: 'checkCompatibility',
      data: { compatible, restricted: false },
    })
    .catch((error) => {
      console.error('Error sending compatibility status:', error);
    });

  // If not compatible, we'll let the background script handle it
  // This keeps the notification logic in one place
}

/**
 * Get all elements with portal-* classes
 * @returns Object with element data
 */
function getPortalTreeData(): TreeNode {
  // Root node
  const rootNode: TreeNode = {
    element: 'body',
    portalClasses: [],
    children: [],
  };

  // Get all elements with classes starting with "portal-"
  const portalElements = document.querySelectorAll('[class*="portal-"]');

  // Build a tree of portal-class elements
  buildTreeFromElements(rootNode, portalElements);

  return rootNode;
}

/**
 * Build a tree from the found elements
 * @param root The root node
 * @param elements All elements with portal-* classes
 */
function buildTreeFromElements(
  root: TreeNode,
  elements: NodeListOf<Element>,
): void {
  // Convert NodeList to array for easier manipulation
  const elementsArray = Array.from(elements);

  // Find direct children of the root node
  const childElements = elementsArray.filter((el) => {
    if (!el.parentElement) return false;

    // If the element's parent is the body, it's a direct child of root
    if (root.element === 'body' && el.parentElement === document.body) {
      return true;
    }

    // For other nodes, check if parent has the same class as root node
    if (root.portalClasses.length > 0) {
      const parentClasses = Array.from(el.parentElement.classList);
      return root.portalClasses.some((cls) => parentClasses.includes(cls));
    }

    return false;
  });

  // Create nodes for direct children
  childElements.forEach((el) => {
    // Extract portal-* classes
    const allClasses = Array.from(el.classList);
    const portalClasses = allClasses.filter((cls) => cls.startsWith('portal-'));

    // Create child node
    const childNode: TreeNode = {
      element: el.tagName.toLowerCase(),
      portalClasses,
      children: [],
    };

    // Add to root's children
    root.children.push(childNode);

    // Remove this element from the array to avoid duplicate processing
    const index = elementsArray.indexOf(el);
    if (index > -1) {
      elementsArray.splice(index, 1);
    }

    // Recursively build tree for this child
    buildTreeFromElements(
      childNode,
      elementsArray as unknown as NodeListOf<Element>,
    );
  });
}

/**
 * Get Tailwind classes from portal elements
 * @returns Object with class mappings
 */
function getTailwindClasses() {
  const result: Record<string, string[]> = {};

  // Get all elements with classes starting with "portal-"
  const portalElements = document.querySelectorAll('[class*="portal-"]');

  portalElements.forEach((el) => {
    const classList = Array.from(el.classList);
    const portalClasses = classList.filter((cls) => cls.startsWith('portal-'));
    const tailwindClasses = classList.filter(
      (cls) => !cls.startsWith('portal-'),
    );

    // Add each portal class with its associated tailwind classes
    portalClasses.forEach((portalClass) => {
      if (!result[portalClass]) {
        result[portalClass] = [];
      }

      // Add any non-duplicate tailwind classes
      tailwindClasses.forEach((twClass) => {
        if (!result[portalClass].includes(twClass)) {
          result[portalClass].push(twClass);
        }
      });
    });
  });

  return result;
}

/**
 * Get current CSS from the page
 * @returns Current CSS string
 */
function getCurrentCSS(): string {
  const styleElement = document.getElementById(styleId);
  return styleElement ? styleElement.textContent || '' : '';
}

/**
 * Apply CSS to the page
 * @param css CSS string to apply
 * @returns Success status
 */
function applyCSS(css: string): boolean {
  try {
    // Remove existing style element if it exists
    const existingStyle = document.getElementById(styleId);
    if (existingStyle) {
      existingStyle.remove();
    }

    // Create new style element
    const styleElement = document.createElement('style');
    styleElement.id = styleId;
    styleElement.textContent = css;
    document.head.appendChild(styleElement);

    return true;
  } catch (error) {
    console.error('Error applying CSS:', error);
    return false;
  }
}

/**
 * Highlight elements with specified portal classes
 * @param classes Array of classes to highlight
 */
function highlightElements(classes: string[]): void {
  // Remove existing highlights first
  removeHighlight();

  // Find all elements with the specified classes
  classes.forEach((className) => {
    const elements = document.querySelectorAll('.' + className);

    elements.forEach((el) => {
      const element = el as HTMLElementWithStyles;

      // Store original styles
      const originalOutline = element.style.outline;
      const originalOutlineOffset = element.style.outlineOffset;
      const originalZIndex = element.style.zIndex;
      const originalPosition = element.style.position;

      // Apply highlight styles
      element.style.outline = '2px solid rgba(66, 133, 244, 0.8)';
      element.style.outlineOffset = '2px';
      element.style.position = 'relative';
      element.style.zIndex = '9999';

      // Store element and its original styles for later restoration
      activeHighlights.push(element);
      element._originalStyles = {
        outline: originalOutline,
        outlineOffset: originalOutlineOffset,
        zIndex: originalZIndex,
        position: originalPosition,
      };
    });
  });
}

/**
 * Remove highlights from elements
 */
function removeHighlight(): void {
  // Restore original styles
  activeHighlights.forEach((element) => {
    const originalStyles = element._originalStyles;
    if (originalStyles) {
      element.style.outline = originalStyles.outline;
      element.style.outlineOffset = originalStyles.outlineOffset;
      element.style.zIndex = originalStyles.zIndex;
      element.style.position = originalStyles.position;
    }
  });

  // Clear active highlights array
  activeHighlights = [];
}

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  console.log('Content script received message:', request.action);

  try {
    // Handle getting portal class tree
    if (request.action === 'getPortalClassTree') {
      const treeData = getPortalTreeData();
      sendResponse({ success: true, data: treeData });
      return true;
    }

    // Handle getting tailwind classes
    if (request.action === 'getTailwindClasses') {
      const tailwindData = getTailwindClasses();
      sendResponse({ success: true, data: tailwindData });
      return true;
    }

    // Handle getting current CSS
    if (request.action === 'getCurrentCSS') {
      const css = getCurrentCSS();
      sendResponse({ success: true, data: css });
      return true;
    }

    // Handle applying CSS
    if (request.action === 'applyCSS') {
      const success = applyCSS(request.data.css);
      sendResponse({ success });
      return true;
    }

    // Handle highlighting elements
    if (request.action === 'highlightElements') {
      highlightElements(request.data.classes);
      sendResponse({ success: true });
      return true;
    }

    // Handle removing highlight
    if (request.action === 'removeHighlight') {
      removeHighlight();
      sendResponse({ success: true });
      return true;
    }

    // Handle ping
    if (request.action === 'ping') {
      sendResponse({ success: true, message: 'content script connected' });
      return true;
    }

    // Handle unknown action
    sendResponse({ success: false, error: 'Unknown action' });
    return true;
  } catch (error) {
    console.error('Error handling message:', error);
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return true;
  }
});
