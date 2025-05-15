// Background script for Portal Chrome Extension

// Configure side panel when extension is installed
chrome.runtime.onInstalled.addListener(() => {
  // Set the default side panel path
  chrome.sidePanel.setOptions({
    path: 'index.html',
    enabled: true,
  })
})

// Enable side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    // Open the side panel
    chrome.sidePanel.open({ tabId: tab.id })
  }
})

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  // Handle ping request (used for checking connection health)
  if (request.action === 'ping') {
    sendResponse({ success: true, message: 'background connected' })
    return true
  }

  // Handle capture visible tab
  if (request.action === 'captureVisibleTab') {
    try {
      captureCurrentTab()
        .then((dataUrl) => {
          sendResponse({ success: true, data: dataUrl })
        })
        .catch((error) => {
          console.error('Tab capture error:', error)
          sendResponse({ success: false, error: error.message })
        })
    } catch (error) {
      console.error('Error starting visible capture:', error)
      sendResponse({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error in background script',
      })
    }
    return true // Keep message channel open for async response
  }
})

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
    })
    if (!activeTab || !activeTab.id) {
      throw new Error('No active tab found for screenshot')
    }

    // Try with a slight delay first to ensure the page is rendered completely
    await new Promise((resolve) => setTimeout(resolve, 200))

    // Simple direct capture with highest quality
    const dataUrl = await chrome.tabs.captureVisibleTab(activeTab.windowId, {
      format: 'png',
      quality: 100,
    })

    if (!dataUrl || !dataUrl.startsWith('data:image')) {
      throw new Error('Invalid data URL format')
    }

    return dataUrl
  } catch (error) {
    console.error('Error capturing screenshot:', error)
    throw error
  }
}
