// Inline the type and utility functions directly instead of importing
type TreeNode = {
  element: string;
  portalClasses: string[];
  children: TreeNode[];
  id?: string;
};

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
let portalClassesFound = false;

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
      return false;
    }

    // First attempt with standard selector
    const portalElements = document.querySelectorAll('[class*="portal-"]');

    if (portalElements.length > 0) {
      portalClassesFound = true;
      return true;
    }

    // Try alternative specific selectors
    const withExactClass = document.querySelectorAll('.portal-public, .portal-home-page');

    if (withExactClass.length > 0) {
      portalClassesFound = true;
      return true;
    }

    // If not found, try with a more thorough approach by checking all elements with classes
    const allElementsWithClass = document.querySelectorAll('[class]');

    // Check for partial string match in class attribute
    for (const element of allElementsWithClass) {
      // Check if the className string contains 'portal-'
      const classStr = element.getAttribute('class');
      if (classStr && classStr.includes('portal-')) {
        portalClassesFound = true;
        return true;
      }

      // Also check through classList to be thorough
      const classList = element.classList;
      for (const className of classList) {
        if (className.startsWith('portal-')) {
          portalClassesFound = true;
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking for portal classes:', error);
    return false;
  }
}

// Check compatibility when content script loads, but with a delay to allow for page to fully render
checkPageCompatibility();

// Short delay for initial page render
setTimeout(() => {
  checkPageCompatibility();
}, 500);

// Longer delay for slower pages
setTimeout(() => {
  checkPageCompatibility();
}, 2000);

// Also observe DOM changes to detect dynamically added portal classes
setupPortalClassObserver();

/**
 * Set up a MutationObserver to detect portal classes added dynamically
 */
function setupPortalClassObserver() {
  // Don't observe if we already found portal classes
  if (portalClassesFound) {
    return;
  }

  // Create a observer to watch for DOM changes
  const observer = new MutationObserver(_mutations => {
    // Skip check if we already found portal classes
    if (portalClassesFound) {
      observer.disconnect();
      return;
    }

    // Check if we need to notify about newly found portal classes
    if (hasPortalClasses()) {
      // Notify the background script
      chrome.runtime
        .sendMessage({
          action: 'checkCompatibility',
          data: { compatible: true, restricted: false },
        })
        .catch(error => {
          console.error('Error sending compatibility status:', error);
        });

      // Disconnect the observer once we've found portal classes
      observer.disconnect();
    }
  });

  // Start observing the document body for DOM changes
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });

  // Set a timeout to disconnect the observer after 20 seconds
  setTimeout(() => {
    observer.disconnect();

    // One final check
    if (!portalClassesFound) {
      checkPageCompatibility();
    }
  }, 20000);
}

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
      .catch(error => {
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
    .catch(error => {
      console.error('Error sending compatibility status:', error);
    });
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
    id: 'body',
  };

  // Use a combination of approaches to find all portal elements
  let portalElements: Element[] = [];

  // First try standard selector
  const directMatches = document.querySelectorAll('[class*="portal-"]');

  if (directMatches.length > 0) {
    portalElements = Array.from(directMatches);
  } else {
    // Try with exact class selectors
    const exactMatches = document.querySelectorAll('.portal-public, .portal-home-page');

    if (exactMatches.length > 0) {
      portalElements = Array.from(exactMatches);
    } else {
      // Try with thorough approach
      const allElementsWithClass = document.querySelectorAll('[class]');
      const elementsWithPortalClass: Element[] = [];

      for (const element of allElementsWithClass) {
        // Check attribute directly
        const classStr = element.getAttribute('class');
        if (classStr && classStr.includes('portal-')) {
          elementsWithPortalClass.push(element);
          continue;
        }

        // Check through classList
        const classList = element.classList;
        for (const className of classList) {
          if (className.startsWith('portal-')) {
            elementsWithPortalClass.push(element);
            break;
          }
        }
      }

      if (elementsWithPortalClass.length > 0) {
        portalElements = elementsWithPortalClass;
      }
    }
  }

  if (portalElements.length === 0) {
    return rootNode;
  }

  // Add unique data attributes to elements to help with tree building
  portalElements.forEach((el, index) => {
    const id = `portal-element-${index}`;
    el.setAttribute('data-portal-id', id);
  });

  // Build a tree of portal-class elements
  buildTreeFromElements(rootNode, portalElements as unknown as NodeListOf<Element>);

  return rootNode;
}

/**
 * Build a tree from the found elements
 * @param root The root node
 * @param elements All elements with portal-* classes
 */
function buildTreeFromElements(root: TreeNode, elements: NodeListOf<Element> | Element[]): void {
  // Special handling for body element - add portal classes directly
  if (root.element === 'body') {
    // Check if body has portal classes
    const bodyClasses = Array.from(document.body.classList);
    const bodyPortalClasses = bodyClasses.filter(cls => cls.startsWith('portal-'));
    if (bodyPortalClasses.length > 0) {
      root.portalClasses = bodyPortalClasses;
    }
  }

  // Convert NodeList to array for easier manipulation
  const elementsArray = Array.from(elements);

  // If no elements to process, return early
  if (elementsArray.length === 0) {
    return;
  }

  // For body node, use DOM structure to build actual tree
  if (root.element === 'body') {
    // Create a map of elements to help with lookup
    const elementMap = new Map<Element, TreeNode>();

    // First, create nodes for all elements but don't set up the hierarchy yet
    elementsArray.forEach(el => {
      const allClasses = Array.from(el.classList);
      const portalClasses = allClasses.filter(cls => cls.startsWith('portal-'));

      if (portalClasses.length > 0) {
        const portalId =
          el.getAttribute('data-portal-id') || `el-${Math.random().toString(36).substr(2, 9)}`;
        const node: TreeNode = {
          element: el.tagName.toLowerCase(),
          portalClasses,
          children: [],
          id: portalId,
        };
        elementMap.set(el, node);
      }
    });

    // Now, establish parent-child relationships based on DOM structure
    elementsArray.forEach(el => {
      if (!elementMap.has(el)) return;

      // Get current element's node
      const currentNode = elementMap.get(el)!;

      // Find the closest parent that is in our element map
      let parentEl: Element | null = el.parentElement;
      let closestPortalParent: Element | null = null;

      while (parentEl && parentEl !== document.body) {
        if (elementMap.has(parentEl)) {
          closestPortalParent = parentEl;
          break;
        }
        parentEl = parentEl.parentElement;
      }

      // If we found a parent in our map, add this node as its child
      if (closestPortalParent) {
        const parentNode = elementMap.get(closestPortalParent)!;
        parentNode.children.push(currentNode);
      } else {
        // No portal parent found, so this is a direct child of body
        root.children.push(currentNode);
      }
    });

    return;
  }

  // For non-body nodes, use the existing approach
  // Find direct children of the current node
  const childElements = elementsArray.filter(el => {
    if (!el.parentElement) return false;

    // For non-body elements, we need a different approach since we don't have a direct reference to the element
    // related to the root node. Instead check parent-child relationship using DOM hierarchy.
    const parentId = el.parentElement.getAttribute('data-portal-id');
    if (parentId && root.id === parentId) {
      return true;
    }

    // For other nodes, check if parent has the same class as root node
    if (root.portalClasses && root.portalClasses.length > 0) {
      const parentClasses = Array.from(el.parentElement.classList);
      const isChild = root.portalClasses.some(cls => parentClasses.includes(cls));
      return isChild;
    }

    return false;
  });

  // Create nodes for direct children
  childElements.forEach(el => {
    // Extract portal-* classes
    const allClasses = Array.from(el.classList);
    const portalClasses = allClasses.filter(cls => cls.startsWith('portal-'));
    const portalId =
      el.getAttribute('data-portal-id') || `el-${Math.random().toString(36).substr(2, 9)}`;

    // Create child node
    const childNode: TreeNode = {
      element: el.tagName.toLowerCase(),
      portalClasses,
      children: [],
      id: portalId,
    };

    // Add to root's children
    root.children.push(childNode);

    // Remove this element from the array to avoid duplicate processing
    const index = elementsArray.indexOf(el);
    if (index > -1) {
      elementsArray.splice(index, 1);
    }

    // Recursively build tree for this child
    buildTreeFromElements(childNode, elementsArray as unknown as NodeListOf<Element>);
  });
}

/**
 * Get Tailwind classes from portal elements
 * @returns Object with class mappings
 */
function getTailwindClasses() {
  const result: Record<string, string[]> = {};

  // Get all elements with classes
  const allElements = document.querySelectorAll('[class]');

  // Process each element to find portal classes and associated non-portal classes
  allElements.forEach(el => {
    const classList = Array.from(el.classList);

    const portalClasses = classList.filter(cls => cls.startsWith('portal-'));
    const nonPortalClasses = classList.filter(cls => !cls.startsWith('portal-'));

    // Skip if no portal classes found on this element
    if (portalClasses.length === 0) {
      return;
    }

    // Add each portal class with its associated non-portal classes
    portalClasses.forEach(portalClass => {
      if (!result[portalClass]) {
        result[portalClass] = [];
      }

      // Add all non-portal classes to the result
      nonPortalClasses.forEach(cls => {
        if (!result[portalClass].includes(cls)) {
          result[portalClass].push(cls);
        }
      });
    });
  });

  // Add a test value if everything is empty
  if (Object.keys(result).length > 0) {
    let hasAnyClasses = false;
    Object.values(result).forEach(classes => {
      if (classes.length > 0) hasAnyClasses = true;
    });

    if (!hasAnyClasses) {
      // Add test data to diagnose rendering issue
      Object.keys(result).forEach(portalClass => {
        result[portalClass] = ['test-class-1', 'test-class-2'];
      });
    }
  }

  // Ensure response is properly structured for JSON serialization
  const serializedResult = JSON.parse(JSON.stringify(result));

  return serializedResult;
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

    // Handle empty CSS - don't create style element
    if (css.trim() === '') {
      return true;
    }

    // Create new style element
    const styleElement = document.createElement('style');
    styleElement.id = styleId;
    styleElement.textContent = css;

    // Insert at the top of head for lower specificity (like main portal)
    if (document.head.firstChild) {
      document.head.insertBefore(styleElement, document.head.firstChild);
    } else {
      document.head.appendChild(styleElement);
    }

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
  classes.forEach(className => {
    const elements = document.querySelectorAll('.' + className);

    elements.forEach(el => {
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
  activeHighlights.forEach(element => {
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
