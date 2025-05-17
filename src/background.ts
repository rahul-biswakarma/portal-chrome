// Background script for Portal Chrome Extension

// Configure side panel when extension is installed
chrome.runtime.onInstalled.addListener(() => {
  // Set the default side panel path
  chrome.sidePanel.setOptions({
    path: 'index.html',
    enabled: true,
  });
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
    // Inject a content script to check for portal classes
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
    // Use querySelector with attribute selector that matches class names containing 'portal-'
    const portalElements = document.querySelectorAll('[class*="portal-"]');
    return portalElements.length > 0;
  } catch (error) {
    console.error('Error checking for portal classes:', error);
    return false;
  }
}

// Enable side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    // Check if the page is compatible first
    chrome.scripting
      .executeScript({
        target: { tabId: tab.id },
        func: checkForPortalClasses,
      })
      .then((results) => {
        const hasPortalClasses = results[0]?.result || false;

        if (hasPortalClasses) {
          // Get current window ID then open side panel
          chrome.windows.getCurrent().then((window) => {
            if (window && window.id !== undefined) {
              chrome.sidePanel.open({
                tabId: tab.id,
                windowId: window.id,
              });
            }
          });
        } else {
          // Show a notification if portal classes don't exist
          chrome.notifications.create({
            type: 'basic',
            iconUrl: '/icon-48.png',
            title: 'Portal Extension',
            message:
              'This extension only works on pages with portal-* classes.',
            priority: 1,
          });
        }
      })
      .catch((error) => {
        console.error('Error checking for portal classes:', error);
      });
  }
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  // Handle ping request (used for checking connection health)
  if (request.action === 'ping') {
    sendResponse({ success: true, message: 'background connected' });
    return true;
  }

  // Handle capture visible tab
  if (request.action === 'captureVisibleTab') {
    try {
      captureCurrentTab()
        .then((dataUrl) => {
          sendResponse({ success: true, data: dataUrl });
        })
        .catch((error) => {
          console.error('Tab capture error:', error);
          sendResponse({ success: false, error: error.message });
        });
    } catch (error) {
      console.error('Error starting visible capture:', error);
      sendResponse({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error in background script',
      });
    }
    return true; // Keep message channel open for async response
  }

  // Handle check compatibility request from content scripts
  if (request.action === 'checkCompatibility') {
    if (_sender.tab?.id) {
      checkTabCompatibility(_sender.tab.id);
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'No tab ID found' });
    }
    return true;
  }
});

/**
 * Capture the current tab as a screenshot
 * @returns Promise resolving to the screenshot data URL
 */
async function captureCurrentTab(): Promise<string> {
  try {
    // Get the current tab
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!activeTab || !activeTab.id) {
      throw new Error('No active tab found for screenshot');
    }

    // Try with a slight delay first to ensure the page is rendered completely
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Simple direct capture with highest quality
    const dataUrl = await chrome.tabs.captureVisibleTab(activeTab.windowId, {
      format: 'png',
      quality: 100,
    });

    if (!dataUrl || !dataUrl.startsWith('data:image')) {
      throw new Error('Invalid data URL format');
    }

    return dataUrl;
  } catch (error) {
    console.error('Error capturing screenshot:', error);
    throw error;
  }
}
