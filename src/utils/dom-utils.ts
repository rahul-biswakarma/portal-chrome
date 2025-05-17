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
 * Extracts Tailwind classes used with portal classes in the document
 */
export const extractTailwindClasses = async (
  tabId: number,
): Promise<Record<string, string[]>> => {
  try {
    // Use the content script's getTailwindClasses function
    const response = await chrome.tabs
      .sendMessage(tabId, {
        action: 'getTailwindClasses',
      })
      .catch((err) => {
        console.error('Error getting Tailwind classes:', err);
        return { success: false, error: 'Failed to get Tailwind classes' };
      });

    if (response?.success) {
      console.log(
        'DEBUG: Tailwind classes from content script:',
        response.data,
      );
      return response.data;
    }

    console.warn(
      'Failed to get Tailwind classes from content script, falling back to direct extraction',
    );

    // Fall back to direct extraction if content script is not available
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const tailwindByPortalClass: Record<string, string[]> = {};

        // Find all elements with portal classes
        const elementsWithPortalClass =
          document.querySelectorAll('[class*="portal-"]');

        // Extract classes from each element
        elementsWithPortalClass.forEach((el) => {
          if (el.classList && el.classList.length > 0) {
            // Find portal classes on this element
            const portalClasses = Array.from(el.classList).filter((cls) =>
              cls.startsWith('portal-'),
            );

            // Find non-portal classes (potential Tailwind classes)
            const nonPortalClasses = Array.from(el.classList).filter(
              (cls) => !cls.startsWith('portal-'),
            );

            // Associate Tailwind classes with each portal class
            portalClasses.forEach((portalClass) => {
              if (!tailwindByPortalClass[portalClass]) {
                tailwindByPortalClass[portalClass] = [];
              }

              // Add non-duplicate classes
              nonPortalClasses.forEach((cls) => {
                if (!tailwindByPortalClass[portalClass].includes(cls)) {
                  tailwindByPortalClass[portalClass].push(cls);
                }
              });
            });
          }
        });

        return tailwindByPortalClass;
      },
    });

    if (!result || result.length === 0) {
      return {};
    }

    return result[0].result as Record<string, string[]>;
  } catch (error) {
    console.error('Error extracting Tailwind classes:', error);
    return {};
  }
};

/**
 * Get comprehensive DOM and styling information
 */
export const getPageStructure = async (tabId: number): Promise<string> => {
  try {
    // Get class hierarchy
    const hierarchy = await extractClassHierarchy(tabId);

    // Get Tailwind classes associated with portal classes
    const tailwindClasses = await extractTailwindClasses(tabId);

    // Format the Tailwind classes in a hierarchical structure
    const tailwindClassesStr = Object.entries(tailwindClasses)
      .map(([portalClass, classes]) => {
        return `${portalClass}:\n  ${classes.join('\n  ')}`;
      })
      .join('\n\n');

    // Format the output
    return `
DOM STRUCTURE:
${hierarchy}

PORTAL CLASSES WITH ASSOCIATED TAILWIND CLASSES:
${tailwindClassesStr}
`;
  } catch (error) {
    console.error('Error getting page structure:', error);
    return 'Error getting page structure';
  }
};
