/**
 * DOM Utility functions for the Portal Chrome Extension
 */

/**
 * Check if the current DOM contains elements with class names starting with 'portal-'
 * @returns {boolean} True if portal classes are found, false otherwise
 */
export function hasPortalClasses(): boolean {
  try {
    // Use querySelector with a CSS attribute selector to find elements with classes starting with 'portal-'
    const portalElements = document.querySelectorAll('[class*="portal-"]');

    // Check if we found any elements
    return portalElements.length > 0;
  } catch (error) {
    console.error('Error checking for portal classes:', error);
    return false;
  }
}

/**
 * Count the number of elements with portal classes in the DOM
 * @returns {number} Number of elements with portal classes
 */
export function countPortalElements(): number {
  try {
    const portalElements = document.querySelectorAll('[class*="portal-"]');
    return portalElements.length;
  } catch (error) {
    console.error('Error counting portal elements:', error);
    return 0;
  }
}
