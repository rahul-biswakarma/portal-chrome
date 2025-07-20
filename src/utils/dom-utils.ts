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
export const extractTailwindClasses = async (tabId: number): Promise<Record<string, string[]>> => {
  try {
    // Use the content script's getTailwindClasses function
    const response = await chrome.tabs
      .sendMessage(tabId, {
        action: 'getTailwindClasses',
      })
      .catch(err => {
        console.error('Error getting Tailwind classes:', err);
        return { success: false, error: 'Failed to get Tailwind classes' };
      });

    if (response?.success) {
      return response.data;
    }

    console.warn(
      'Failed to get Tailwind classes from content script, falling back to direct extraction'
    );

    // Fall back to direct extraction if content script is not available
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const tailwindByPortalClass: Record<string, string[]> = {};

        // Find all elements with portal classes
        const elementsWithPortalClass = document.querySelectorAll('[class*="portal-"]');

        // Extract classes from each element
        elementsWithPortalClass.forEach(el => {
          if (el.classList && el.classList.length > 0) {
            // Find portal classes on this element
            const portalClasses = Array.from(el.classList).filter(cls => cls.startsWith('portal-'));

            // Find non-portal classes (potential Tailwind classes)
            const nonPortalClasses = Array.from(el.classList).filter(
              cls => !cls.startsWith('portal-')
            );

            // Associate Tailwind classes with each portal class
            portalClasses.forEach(portalClass => {
              if (!tailwindByPortalClass[portalClass]) {
                tailwindByPortalClass[portalClass] = [];
              }

              // Add non-duplicate classes
              nonPortalClasses.forEach(cls => {
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

/**
 * Extract computed styles for elements with portal-* classes
 * @param tabId The tab ID
 * @returns Promise resolving to portal class to computed styles mapping
 */
export const extractComputedStyles = async (
  tabId: number
): Promise<Record<string, Record<string, string>>> => {
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const portalElements = document.querySelectorAll('[class*="portal-"]');
        const result: Record<string, Record<string, string>> = {};

        // Important CSS properties to capture
        const importantProperties = [
          // Typography
          'color',
          'font-family',
          'font-size',
          'font-weight',
          'line-height',
          'letter-spacing',
          'text-align',
          'text-decoration',
          'text-transform',

          // Box model
          'width',
          'height',
          'padding',
          'padding-top',
          'padding-right',
          'padding-bottom',
          'padding-left',
          'margin',
          'margin-top',
          'margin-right',
          'margin-bottom',
          'margin-left',

          // Layout
          'display',
          'position',
          'top',
          'right',
          'bottom',
          'left',
          'flex-direction',
          'flex-wrap',
          'justify-content',
          'align-items',
          'grid-template-columns',
          'grid-template-rows',
          'grid-gap',

          // Visual styles
          'background-color',
          'background-image',
          'border',
          'border-radius',
          'box-shadow',
          'opacity',
          'transform',
          'transition',

          // Other
          'z-index',
          'overflow',
          'cursor',
        ];

        // Pseudo-elements to capture
        const pseudoElements = [
          ':hover',
          ':focus',
          ':active',
          '::before',
          '::after',
          ':first-child',
          ':last-child',
        ];

        portalElements.forEach(element => {
          const classes = element.className.split(' ');
          const portalClasses = classes.filter(cls => cls.startsWith('portal-'));
          const computedStyle = window.getComputedStyle(element);

          portalClasses.forEach(portalClass => {
            const styles: Record<string, string> = {};

            // Extract base element styles
            importantProperties.forEach(prop => {
              const value = computedStyle.getPropertyValue(prop);
              if (value && value !== '') {
                styles[prop] = value;
              }
            });

            // Add element tag name for context
            styles['element'] = element.tagName.toLowerCase();

            // Add parent-child relationship info if possible
            const parentElement = element.parentElement;
            if (parentElement && parentElement.className) {
              const parentPortalClasses = parentElement.className
                .split(' ')
                .filter(cls => cls.startsWith('portal-'));
              if (parentPortalClasses.length > 0) {
                styles['parent-classes'] = parentPortalClasses.join(' ');
              }
            }

            // Add child context if it has children
            if (element.children.length > 0) {
              const childPortalElements = Array.from(element.children).filter(
                child =>
                  child.className &&
                  child.className.split(' ').some(cls => cls.startsWith('portal-'))
              );

              if (childPortalElements.length > 0) {
                styles['has-portal-children'] = 'true';
                styles['child-elements'] = childPortalElements.length.toString();
              }
            }

            // Extract CSS Rules matching the element
            try {
              // This part gets the actual CSS rules from stylesheets including pseudo-elements
              const cssRules: Record<string, Record<string, string>> = {};

              // Collect all stylesheets' rules
              for (let i = 0; i < document.styleSheets.length; i++) {
                try {
                  const sheet = document.styleSheets[i];
                  // Skip if the stylesheet is inaccessible (e.g., cross-origin)
                  if (!sheet.cssRules) continue;

                  for (let j = 0; j < sheet.cssRules.length; j++) {
                    const rule = sheet.cssRules[j];
                    if (rule instanceof CSSStyleRule) {
                      // Check if the rule applies to our element class
                      if (
                        rule.selectorText.includes(`.${portalClass}`) ||
                        rule.selectorText.includes(`.${portalClass}:`) ||
                        rule.selectorText.includes(`.${portalClass}::`)
                      ) {
                        // Parse the selector to identify if it's a pseudo-element/class
                        let pseudoType = 'base';
                        for (const pseudo of pseudoElements) {
                          if (rule.selectorText.includes(pseudo)) {
                            pseudoType = pseudo;
                            break;
                          }
                        }

                        if (!cssRules[pseudoType]) {
                          cssRules[pseudoType] = {};
                        }

                        // Extract the style properties
                        for (let k = 0; k < rule.style.length; k++) {
                          const property = rule.style[k];
                          const value = rule.style.getPropertyValue(property);
                          if (value) {
                            cssRules[pseudoType][property] = value;
                          }
                        }
                      }
                    }
                  }
                } catch {
                  // Silent fail for cross-origin stylesheets
                  continue;
                }
              }

              // Add the CSS rules to styles
              for (const [pseudo, properties] of Object.entries(cssRules)) {
                if (pseudo === 'base') {
                  // Merge base rules with the computed styles
                  Object.assign(styles, properties);
                } else {
                  // Add pseudo-element styles with prefix
                  for (const [prop, value] of Object.entries(properties)) {
                    styles[`${pseudo}-${prop}`] = value;
                  }
                }
              }
            } catch (e) {
              // Silent fail for stylesheet access issues
              console.error('Error accessing stylesheets:', e);
            }

            result[portalClass] = styles;
          });
        });

        return result;
      },
    });

    if (result && result[0] && result[0].result) {
      return result[0].result;
    }

    return {};
  } catch (error) {
    console.error('Error extracting computed styles:', error);
    return {};
  }
};
