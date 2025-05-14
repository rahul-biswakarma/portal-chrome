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

  // Handle request to capture just the visible tab (simpler than full page)
  if (request.action === 'captureVisibleTab') {
    try {
      captureCurrentTab()
        .then(dataUrl => {
          sendResponse({ success: true, data: dataUrl });
        })
        .catch(error => {
          console.error('Tab capture error:', error);
          sendResponse({ success: false, error: error.message });
        });
    } catch (error) {
      console.error('Error starting visible capture:', error);
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

// Simple function to capture just the visible portion of the tab
async function captureVisibleTabOnly(sendResponse) {
  try {
    console.log('[Background] Starting visible tab capture');

    // Get the current tab
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab || !activeTab.id) {
      console.error('[Background] No active tab found for screenshot');
      sendResponse({ success: false, error: 'No active tab found' });
      return;
    }

    console.log('[Background] Active tab found, id:', activeTab.id);

    // Try with a slight delay first to ensure the page is rendered completely
    await new Promise(resolve => setTimeout(resolve, 200));

    try {
      // Simple direct capture with highest quality
      console.log('[Background] Capturing visible tab with chrome API...');
      const dataUrl = await chrome.tabs.captureVisibleTab(
        activeTab.windowId,
        { format: 'png', quality: 100 }
      );

      if (!dataUrl || !dataUrl.startsWith('data:image')) {
        console.error('[Background] Invalid data URL returned from capture');
        throw new Error('Invalid data URL format');
      }

      console.log('[Background] Screenshot captured successfully');

      // Return the captured image
      sendResponse({ success: true, data: dataUrl });
    } catch (captureError) {
      console.error('[Background] Primary capture method failed:', captureError);

      // Try again with a different approach
      try {
        console.log('[Background] Trying fallback capture method...');

        // Inject a script to ensure the page is ready
        await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          function: () => {
            // Force a small repaint
            document.body.style.minHeight = (document.body.offsetHeight + 1) + 'px';
            setTimeout(() => {
              document.body.style.minHeight = '';
            }, 10);
          }
        });

        // Wait a bit longer after the repaint
        await new Promise(resolve => setTimeout(resolve, 300));

        // Try again
        const dataUrl = await chrome.tabs.captureVisibleTab(
          activeTab.windowId,
          { format: 'png', quality: 100 }
        );

        console.log('[Background] Fallback capture successful');
        sendResponse({ success: true, data: dataUrl });
      } catch (fallbackError) {
        console.error('[Background] Fallback capture failed:', fallbackError);
        sendResponse({
          success: false,
          error: 'Both capture methods failed: ' + fallbackError.message
        });
      }
    }
  } catch (error) {
    console.error('[Background] Error in visible tab capture:', error);
    sendResponse({
      success: false,
      error: error.message || 'Failed to capture visible tab'
    });
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

// Enhanced background script for Portal Design Customizer
// Handles messages from popup.js and content.js

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Always send a response to prevent connection errors
  const respond = (response = { success: true }) => {
    try {
      sendResponse(response);
    } catch (error) {
      console.warn('Error sending response:', error);
    }
  };

  try {
    // Handle different message actions
    switch (message.action) {
      case 'downloadScreenshot':
        // Handle screenshot download requests
        downloadScreenshot(message.dataUrl, message.filename)
          .then(downloadId => {
            respond({ success: true, downloadId });
          })
          .catch(error => {
            console.error('Download error:', error);
            respond({ success: false, error: error.message });
          });
        break;

      case 'openSidePanel':
        // Open the side panel when requested
        chrome.sidePanel.open({ tabId: sender.tab.id });
        respond();
        break;

      case 'captureVisibleTab':
        captureCurrentTab()
          .then(dataUrl => {
            respond({ success: true, data: dataUrl });
          })
          .catch(error => {
            console.error('Tab capture error:', error);
            respond({ success: false, error: error.message });
          });
        break;

      default:
        respond({ success: false, error: 'Unknown action' });
    }
  } catch (error) {
    console.error('Error handling message:', error);
    respond({ success: false, error: error.message });
  }

  // Return true to indicate we'll respond asynchronously
  return true;
});

/**
 * Helper function to download a screenshot using chrome.downloads API
 * @param {string} dataUrl - The data URL of the screenshot
 * @param {string} filename - The filename to save as
 * @returns {Promise<number>} The download ID
 */
async function downloadScreenshot(dataUrl, filename = 'portal-screenshot.png') {
  return new Promise((resolve, reject) => {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) {
      reject(new Error('Invalid screenshot data'));
      return;
    }

    try {
      chrome.downloads.download({
        url: dataUrl,
        filename: filename,
        saveAs: false
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (downloadId === undefined) {
          reject(new Error('Download failed - undefined download ID'));
          return;
        }

        resolve(downloadId);
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Handle extension installation or update
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Portal Design Customizer installed or updated:', details.reason);

  // Initialize extension state if needed
  if (details.reason === 'install') {
    // Set default settings on install
    chrome.storage.local.set({
      cssVersions: [],
      initialized: true
    });
  }
});

// Handle tab updates to detect navigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only proceed if the tab has completed loading
  if (changeInfo.status === 'complete' && tab.url) {
    // Check if the URL is a portal page (this is just a simple example check)
    const isPortalPage = tab.url.includes('devrev.ai') || tab.url.includes('portal');

    if (isPortalPage) {
      // Let the user know this extension is available for this page
      chrome.action.setBadgeText({
        text: 'AI',
        tabId: tabId
      });
      chrome.action.setBadgeBackgroundColor({
        color: '#4285F4',
        tabId: tabId
      });
    } else {
      // Clear badge on non-portal pages
      chrome.action.setBadgeText({
        text: '',
        tabId: tabId
      });
    }
  }
});

/**
 * Helper function to capture the current tab
 * @returns {Promise<string>} Promise that resolves with the screenshot data URL
 */
async function captureCurrentTab() {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.captureVisibleTab(null, { format: 'png', quality: 100 }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) {
          reject(new Error('Invalid screenshot data received from Chrome API'));
          return;
        }

        resolve(dataUrl);
      });
    } catch (error) {
      reject(error);
    }
  });
}
