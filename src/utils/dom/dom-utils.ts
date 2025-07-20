/**
 * DOM Utility functions for the Portal Chrome Extension
 */

/**
 * Check if the current URL is a restricted URL that cannot be accessed by extensions
 * @returns {boolean} True if the URL is restricted
 */
export function isRestrictedUrl(url: string): boolean {
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
export function hasPortalClasses(): boolean {
  try {
    // First check if we're on a restricted page
    if (isRestrictedUrl(window.location.href)) {
      console.warn('Cannot check for portal classes on restricted URL:', window.location.href);
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

/**
 * Count the number of elements with portal classes in the DOM
 * @returns {number} Number of elements with portal classes
 */
export function countPortalElements(): number {
  try {
    // First check if we're on a restricted page
    if (isRestrictedUrl(window.location.href)) {
      console.warn('Cannot count portal elements on restricted URL:', window.location.href);
      return 0;
    }

    const portalElements = document.querySelectorAll('[class*="portal-"]');
    return portalElements.length;
  } catch (error) {
    console.error('Error counting portal elements:', error);
    return 0;
  }
}

/**
 * Safe function to check if a tab can be accessed by the extension
 * For use in background scripts or popup pages
 * @param tab The tab to check
 * @returns {boolean} True if the tab is accessible
 */
export function isTabAccessible(tab: chrome.tabs.Tab): boolean {
  return Boolean(tab && tab.url && !isRestrictedUrl(tab.url));
}
