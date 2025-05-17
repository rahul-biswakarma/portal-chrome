/**
 * Utility functions for DOM operations
 */

/**
 * Extract the class hierarchy from the current page
 * @returns Promise resolving to the class hierarchy as a string
 */
export const extractClassHierarchy = async (tabId: number): Promise<string> => {
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // Function to recursively extract class info from DOM
        const extractNodeInfo = (node: Element, depth = 0): string => {
          const indent = ' '.repeat(depth * 2);
          const tagName = node.tagName.toLowerCase();
          const classes = Array.from(node.classList).join(' ');
          const classInfo = classes ? `(${classes})` : '';

          // Get computed styles for this element
          const styles = window.getComputedStyle(node);
          const relevantStyles = [
            `color: ${styles.color}`,
            `background: ${styles.backgroundColor}`,
            `font-size: ${styles.fontSize}`,
            `padding: ${styles.padding}`,
            `margin: ${styles.margin}`,
            `display: ${styles.display}`,
          ].join(', ');

          let result = `${indent}${tagName}${classInfo} [${relevantStyles}]\n`;

          // Process children
          const children = Array.from(node.children);
          if (children.length > 0) {
            for (const child of children) {
              result += extractNodeInfo(child, depth + 1);
            }
          }

          return result;
        };

        // Start from the body element
        return extractNodeInfo(document.body);
      },
    });

    if (!result || result.length === 0) {
      throw new Error('Failed to extract class hierarchy');
    }

    return result[0].result as string;
  } catch (error) {
    console.error('Error extracting class hierarchy:', error);
    return 'Error extracting class hierarchy';
  }
};

/**
 * Extracts Tailwind classes used in the document
 */
export const extractTailwindClasses = async (
  tabId: number,
): Promise<string[]> => {
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const allClasses: Set<string> = new Set();

        // Find all elements
        const allElements = document.querySelectorAll('*');

        // Extract classes from each element
        allElements.forEach((el) => {
          if (el.classList && el.classList.length > 0) {
            el.classList.forEach((cls) => {
              // Only collect classes that look like Tailwind classes
              if (
                /^(bg|text|font|p|m|flex|grid|justify|items|rounded|shadow|border|w|h)-/.test(
                  cls,
                )
              ) {
                allClasses.add(cls);
              }
            });
          }
        });

        return Array.from(allClasses);
      },
    });

    if (!result || result.length === 0) {
      return [];
    }

    return result[0].result as string[];
  } catch (error) {
    console.error('Error extracting Tailwind classes:', error);
    return [];
  }
};

/**
 * Get comprehensive DOM and styling information
 */
export const getPageStructure = async (tabId: number): Promise<string> => {
  try {
    // Get class hierarchy
    const hierarchy = await extractClassHierarchy(tabId);

    // Get Tailwind classes
    const tailwindClasses = await extractTailwindClasses(tabId);

    // Format the output
    return `
DOM STRUCTURE:
${hierarchy}

AVAILABLE TAILWIND CLASSES:
${tailwindClasses.join(', ')}
`;
  } catch (error) {
    console.error('Error getting page structure:', error);
    return 'Error getting page structure';
  }
};
