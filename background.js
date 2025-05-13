// Background script for Portal Chrome Extension

// Enable side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  // Open the side panel
  chrome.sidePanel.open({ tabId: tab.id });
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle ping request (used for checking connection health)
  if (request.action === 'ping') {
    sendResponse({ success: true, message: 'background connected' });
    return true;
  }

  // Handle capture full page request
  if (request.action === 'captureFullPage') {
    try {
      captureFullPage(sendResponse);
    } catch (error) {
      console.error('Error starting capture:', error);
      sendResponse({
        success: false,
        error: error.message || 'Unknown error in background script'
      });
    }
    return true; // Keep message channel open for async response
  }
});

// Function to capture a full page screenshot
async function captureFullPage(sendResponse) {
  try {
    // Get the current tab
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab || !activeTab.id) {
      sendResponse({ success: false, error: 'No active tab found' });
      return;
    }

    // Check if we have permission to access this tab's URL
    const url = new URL(activeTab.url);
    const origin = url.origin;

    // Check if the URL is one we can access (safety check)
    const hasPermission = await chrome.permissions.contains({
      origins: [origin + '/*']
    }).catch(() => false);

    if (!hasPermission) {
      console.warn(`Permission needed for ${origin}. Using simplified capture.`);

      // Try a basic visible tab capture as fallback
      try {
        const dataUrl = await chrome.tabs.captureVisibleTab(
          activeTab.windowId,
          { format: 'png', quality: 100 }
        );

        sendResponse({ success: true, data: dataUrl });
        return;
      } catch (visibleError) {
        console.error('Error with visible tab capture:', visibleError);
        sendResponse({
          success: false,
          error: 'Permission needed for this website. Try using a simpler capture method.'
        });
        return;
      }
    }

    // First inject a script to prepare the page for screenshot
    await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      function: preparePageForScreenshot
    }).catch(error => {
      console.warn('Error preparing page for screenshot:', error);
      // Continue despite error
    });

    // Wait to ensure styles are fully applied and rendered
    await new Promise(resolve => setTimeout(resolve, 500));

    // Try a simple capture first
    try {
      const simpleCapture = await chrome.tabs.captureVisibleTab(
        activeTab.windowId,
        { format: 'png', quality: 100 }
      );

      // Success - return this capture
      sendResponse({ success: true, data: simpleCapture });

      // Also clean up the page
      chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        function: restorePageAfterScreenshot
      }).catch(e => console.warn('Error restoring page:', e));

      return;
    } catch (captureError) {
      console.warn('Error with simple capture, trying alternative approach:', captureError);
      // Continue to more complex capture if simple one fails
    }

    // Get page dimensions - this is a more complex approach if the simple one fails
    try {
      const dimensions = await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        function: getPageDimensions
      });

      if (!dimensions || !dimensions[0] || !dimensions[0].result) {
        sendResponse({ success: false, error: 'Failed to get page dimensions' });
        return;
      }

      const { width, height } = dimensions[0].result;

      // Capture the visible viewport
      const dataUrl = await chrome.tabs.captureVisibleTab(
        activeTab.windowId,
        { format: 'png', quality: 100 }
      );

      // Return the viewport capture as fallback
      sendResponse({ success: true, data: dataUrl });

      // Clean up
      chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        function: restorePageAfterScreenshot
      }).catch(e => console.warn('Error restoring page:', e));

    } catch (error) {
      console.error('Error with complex capture:', error);
      sendResponse({ success: false, error: 'Failed to capture screenshot: ' + (error.message || 'Unknown error') });
    }

  } catch (error) {
    console.error('Error capturing full page screenshot:', error);
    sendResponse({ success: false, error: error.message || 'Unknown error' });
  }
}

// Helper function to load an image from a data URL
function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// Function to get page dimensions
function getPageDimensions() {
  const body = document.body;
  const html = document.documentElement;

  // Get accurate page dimensions
  const width = Math.max(
    body.scrollWidth,
    body.offsetWidth,
    html.clientWidth,
    html.scrollWidth,
    html.offsetWidth
  );

  const height = Math.max(
    body.scrollHeight,
    body.offsetHeight,
    html.clientHeight,
    html.scrollHeight,
    html.offsetHeight
  );

  return {
    width,
    height,
    devicePixelRatio: window.devicePixelRatio || 1
  };
}

// Save original scroll position and prepare page for screenshot
function preparePageForScreenshot() {
  // Store original scroll position and other page state
  window.__originalScrollX = window.scrollX;
  window.__originalScrollY = window.scrollY;

  // Force all images and external resources to load
  const images = document.querySelectorAll('img');
  images.forEach(img => {
    if (img.loading === 'lazy') {
      img.loading = 'eager';
    }
  });

  // Force any CSS transitions to complete
  document.body.classList.add('portal-screenshot-in-progress');

  // Force a repaint to ensure styles are applied
  document.body.getBoundingClientRect();

  return true;
}

// Restore original page state after screenshot
function restorePageAfterScreenshot() {
  // Restore original scroll position
  if (window.__originalScrollX !== undefined && window.__originalScrollY !== undefined) {
    window.scrollTo(window.__originalScrollX, window.__originalScrollY);

    // Clean up our temporary properties
    delete window.__originalScrollX;
    delete window.__originalScrollY;
  }

  document.body.classList.remove('portal-screenshot-in-progress');

  return true;
}
