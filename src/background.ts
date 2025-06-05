// Background script for Portal Chrome Extension
// Inline utility functions instead of importing
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

// Configure side panel when extension is installed - only if sidePanel API exists
chrome.runtime.onInstalled.addListener(() => {
  // Check if sidePanel API is available (Chrome 114+)
  if (chrome.sidePanel) {
    // Set the default side panel path
    chrome.sidePanel.setOptions({
      path: 'index.html',
      enabled: true,
    });
  }
});

// Listen for tab activation changes
chrome.tabs.onActivated.addListener((activeInfo) => {
  checkTabCompatibility(activeInfo.tabId);
});

// Listen for tab updates (when page loads or URL changes)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only run when the page has completed loading
  if (changeInfo.status === 'complete' && tab.active) {
    checkTabCompatibility(tabId);
  }
});

/**
 * Check if the active tab is compatible with the extension
 * @param tabId The ID of the tab to check
 */
async function checkTabCompatibility(tabId: number) {
  try {
    // Get the tab information first
    const tab = await chrome.tabs.get(tabId);

    // Check if it's a restricted URL (chrome://, etc.)
    if (tab.url && isRestrictedUrl(tab.url)) {
      chrome.action.setBadgeText({ text: '!', tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#E53E3E', tabId });
      chrome.action.setTitle({
        title: 'Portal Extension: Cannot access this page (restricted URL)',
        tabId,
      });
      return;
    }

    // For non-restricted URLs, try to inject content script
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: checkForPortalClasses,
      });

      const hasPortalClasses = results[0]?.result || false;

      // Update the extension icon and popup based on compatibility
      if (!hasPortalClasses) {
        // Set badge to indicate extension won't work
        chrome.action.setBadgeText({ text: '✗', tabId });
        chrome.action.setBadgeBackgroundColor({ color: '#E53E3E', tabId });
        chrome.action.setTitle({
          title:
            'Portal Extension: Not compatible with this page. No portal-* classes found.',
          tabId,
        });
      } else {
        // Clear badge when portal classes are found
        chrome.action.setBadgeText({ text: '', tabId });
        chrome.action.setTitle({
          title: 'Portal Design Customizer',
          tabId,
        });
      }
    } catch (scriptError) {
      console.warn('Could not execute script in tab:', scriptError);
      chrome.action.setBadgeText({ text: '!', tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#E53E3E', tabId });
      chrome.action.setTitle({
        title: 'Portal Extension: Cannot access page content',
        tabId,
      });
    }
  } catch (error) {
    // Handle errors (often due to restricted pages like chrome:// URLs)
    console.error('Error checking tab compatibility:', error);
    chrome.action.setBadgeText({ text: '!', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#E53E3E', tabId });
    chrome.action.setTitle({
      title: 'Portal Extension: Cannot access this page',
      tabId,
    });
  }
}

/**
 * Function that executes in tab context to check for portal-* classes
 * @returns True if portal classes are found, false otherwise
 */
function checkForPortalClasses(): boolean {
  try {
    // First check if we're on a restricted URL
    if (
      window.location.href.startsWith('chrome://') ||
      window.location.href.startsWith('chrome-extension://') ||
      window.location.href.startsWith('chrome-search://') ||
      window.location.href.startsWith('about:')
    ) {
      console.warn(
        'Cannot check for portal classes on restricted URL:',
        window.location.href,
      );
      return false;
    }

    // Use querySelector with attribute selector that matches class names containing 'portal-'
    const portalElements = document.querySelectorAll('[class*="portal-"]');
    return portalElements.length > 0;
  } catch (error) {
    console.error('Error checking for portal classes:', error);
    return false;
  }
}

// Enable side panel when extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) {
    // Use tab.url directly to check if it's a restricted URL
    if (tab.url && isRestrictedUrl(tab.url)) {
      // Check if notifications API is available
      if (chrome.notifications) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon-48.png',
          title: 'Portal Extension',
          message: 'This extension cannot access restricted Chrome pages.',
          priority: 1,
        });
      }
      return;
    }

    // Open side panel directly in response to click if sidePanel API exists
    try {
      // Check if sidePanel API is available
      if (chrome.sidePanel) {
        // Get the window ID directly from the tab
        const windowId = tab.windowId;
        if (windowId !== undefined) {
          // Open side panel in the specified window
          chrome.sidePanel.open({ windowId });
        } else {
          console.error('Unable to determine window ID from tab');
        }
      }
    } catch (error) {
      console.error('Failed to open side panel:', error);
    }
  }
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  // Handle compatibility status update from content script
  if (request.action === 'checkCompatibility') {
    if (_sender.tab?.id) {
      // If content script reports this is a restricted URL, update badge accordingly
      if (request.data?.restricted) {
        chrome.action.setBadgeText({ text: '!', tabId: _sender.tab.id });
        chrome.action.setBadgeBackgroundColor({
          color: '#E53E3E',
          tabId: _sender.tab.id,
        });
        chrome.action.setTitle({
          title: 'Portal Extension: Cannot access this page (restricted URL)',
          tabId: _sender.tab.id,
        });
        sendResponse({ success: true });
        return true;
      }

      // Otherwise proceed with normal compatibility check
      checkTabCompatibility(_sender.tab.id);
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'No tab ID found' });
    }
    return true;
  }

  // Handle ping request (used for checking connection health)
  if (request.action === 'ping') {
    sendResponse({ success: true, message: 'background connected' });
    return true;
  }

  // Handle capture visible tab
  if (request.action === 'captureVisibleTab') {
    captureVisibleTab()
      .then((dataUrl) => {
        sendResponse({ success: true, data: dataUrl });
      })
      .catch((error) => {
        console.error('Error capturing tab:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Required to use sendResponse asynchronously
  }

  // Add other message handlers here as needed
  return false;
});

/**
 * Capture the visible tab as a screenshot
 */
async function captureVisibleTab(): Promise<string> {
  const startTime = Date.now();
  console.log('[BACKGROUND] Starting screenshot capture...');

  return new Promise((resolve, reject) => {
    try {
      // Check if the tabs API and captureVisibleTab are available
      if (!chrome.tabs || !chrome.tabs.captureVisibleTab) {
        console.error(
          '[BACKGROUND] Screenshot API not available in this browser context',
        );
        reject(
          new Error('Screenshot API not available in this browser context'),
        );
        return;
      }

      console.log(
        '[BACKGROUND] Using chrome.tabs.captureVisibleTab with quality: 100',
      );
      chrome.tabs.captureVisibleTab(
        { format: 'png', quality: 100 },
        (dataUrl) => {
          const totalTime = Date.now() - startTime;

          if (chrome.runtime.lastError) {
            console.error(
              `[BACKGROUND] Screenshot capture failed after ${totalTime}ms:`,
              chrome.runtime.lastError.message,
            );
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!dataUrl) {
            console.error(
              `[BACKGROUND] Screenshot capture failed after ${totalTime}ms: No data returned`,
            );
            reject(new Error('Failed to capture screenshot'));
          } else {
            const imageSizeKB = Math.round(dataUrl.length / 1024);
            console.log(
              `[BACKGROUND] Screenshot capture completed in ${totalTime}ms, size: ${imageSizeKB}KB`,
            );
            resolve(dataUrl);
          }
        },
      );
    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error(
        `[BACKGROUND] Screenshot capture exception after ${totalTime}ms:`,
        error,
      );
      reject(error);
    }
  });
}

// Add iteration tracking to communicate with the UI
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'css-iteration-update') {
    // Forward the iteration update to the popup
    chrome.runtime.sendMessage({
      action: 'iteration-update',
      iteration: message.iteration,
    });
    sendResponse({ success: true });
    return true;
  }
  return false;
});
