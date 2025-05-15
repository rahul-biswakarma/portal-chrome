import { safeSendMessage } from '../utils/messaging.js';
import { showStatus, showLoading } from '../components/status-bar.js';

/**
 * Capture a screenshot of the current page
 * @returns {Promise<string>} Promise that resolves with the screenshot data URL
 */
export async function captureScreenshot() {
  let screenshot = null;
  showStatus('Capturing page screenshot... This may take a moment.', 'info');

  try {
    const tabResponse = await new Promise((resolve, reject) => {
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (!tabs || !tabs[0]) {
          reject(new Error('No active tab found'));
          return;
        }

        // Use our safe messaging function with a timeout
        let messageTimeout = setTimeout(() => {
          reject(new Error('Screenshot capture timed out'));
        }, 10000); // 10 seconds timeout

        safeSendMessage(tabs[0].id, {action: 'captureScreenshot'}, (response) => {
          clearTimeout(messageTimeout);
          if (!response || !response.success) {
            const errorMsg = response && response.error ? response.error : 'Unknown error';
            reject(new Error(errorMsg));
            return;
          }
          resolve(response);
        });
      });
    });

    if (tabResponse && tabResponse.success && tabResponse.data) {
      screenshot = tabResponse.data;
      showStatus('Screenshot captured successfully!', 'success');
    }
  } catch (error) {
    console.warn('Could not capture screenshot with content script:', error);
    showStatus('Trying fallback screenshot method...', 'info');

    try {
      // Use chrome.tabs API directly as fallback
      const tabs = await new Promise((resolve) => {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
          resolve(tabs);
        });
      });

      if (!tabs || !tabs.length) {
        throw new Error('No active tab found');
      }

      const dataUrl = await new Promise((resolve, reject) => {
        chrome.tabs.captureVisibleTab(null, {format: 'png', quality: 100}, (dataUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(dataUrl);
        });
      });

      if (dataUrl) {
        screenshot = dataUrl;
        showStatus('Screenshot captured with fallback method', 'success');
      }
    } catch (fallbackError) {
      console.error('All screenshot methods failed:', fallbackError);
      showStatus('Could not capture screenshot. Using simplified data.', 'error');
    }
  }

  return screenshot;
}

/**
 * Convert a base64 data URL to a Blob
 * @param {string} base64Data - The base64 data URL
 * @returns {Blob} The converted Blob
 */
export function dataURLtoBlob(base64Data) {
  if (!base64Data || typeof base64Data !== 'string' || !base64Data.startsWith('data:')) {
    console.error('Invalid data URL format');
    return null;
  }

  try {
    const base64Content = base64Data.split(',')[1];
    const byteCharacters = atob(base64Content);
    const byteArrays = [];

    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
      const slice = byteCharacters.slice(offset, offset + 512);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }

    return new Blob(byteArrays, {type: 'image/png'});
  } catch (error) {
    console.error('Error converting data URL to Blob:', error);
    return null;
  }
}

/**
 * Try to download using the background script as another fallback method
 * @param {string} screenshotData - The screenshot data URL
 * @param {string} description - Description for the filename
 * @returns {Promise<boolean>} Whether the download was successful
 */
async function downloadViaBackgroundScript(screenshotData, description) {
  return new Promise((resolve, reject) => {
    const filename = `portal-${description}-${Date.now()}.png`;

    chrome.runtime.sendMessage({
      action: 'downloadScreenshot',
      dataUrl: screenshotData,
      filename: filename
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('Error sending download message to background script:', chrome.runtime.lastError);
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!response || !response.success) {
        reject(new Error(response?.error || 'Unknown error downloading via background script'));
        return;
      }

      resolve(true);
    });
  });
}

/**
 * Save a screenshot with multiple fallback methods
 * @param {string} screenshotData - The screenshot data URL
 * @param {string} description - Description for the filename
 * @returns {Promise<boolean>} Whether the download was successful
 */
export async function saveScreenshot(screenshotData, description = 'portal') {
  if (!screenshotData || typeof screenshotData !== 'string' || !screenshotData.startsWith('data:image')) {
    console.error('Invalid screenshot data:', screenshotData ? screenshotData.substring(0, 50) + '...' : 'undefined');
    showStatus('Error: Invalid screenshot data format', 'error');
    return false;
  }

  let downloadSuccess = false;
  const filename = `portal-${description}-${Date.now()}.png`;

  // Method 1: Try using chrome.downloads API
  try {
    showStatus('Saving screenshot...', 'info');

    // Create a blob from the data URL
    const blob = dataURLtoBlob(screenshotData);
    if (!blob) {
      throw new Error('Failed to convert screenshot to blob');
    }

    const url = URL.createObjectURL(blob);

    // Use chrome.downloads API if available
    if (chrome.downloads) {
      await new Promise((resolve, reject) => {
        let timeoutId = setTimeout(() => {
          reject(new Error('Download timeout'));
        }, 10000);

        chrome.downloads.download({
          url: url,
          filename: filename,
          saveAs: false
        }, (downloadId) => {
          clearTimeout(timeoutId);

          if (chrome.runtime.lastError) {
            console.warn('Chrome download API error:', chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          if (downloadId === undefined) {
            reject(new Error('Download failed - undefined download ID'));
            return;
          }

          downloadSuccess = true;
          resolve(downloadId);
        });
      });

      showStatus(`Screenshot "${description}" saved to downloads folder!`, 'success');
      showStatus('Note: Screenshot shows only the visible portion of the page', 'info');

      // Clean up the object URL
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return true;
    } else {
      throw new Error('chrome.downloads API not available');
    }
  } catch (error) {
    console.warn('Primary download method failed:', error);
    showStatus('Primary download method failed, trying alternative...', 'info');
  }

  // Method 2: Try the background script method
  if (!downloadSuccess) {
    try {
      showStatus('Trying download through background script...', 'info');
      await downloadViaBackgroundScript(screenshotData, description);

      downloadSuccess = true;
      showStatus(`Screenshot "${description}" saved through background script`, 'success');
      return true;
    } catch (error) {
      console.warn('Background script download failed:', error);
      showStatus('Trying another download method...', 'info');
    }
  }

  // Method 3: Fallback to traditional download link
  if (!downloadSuccess) {
    try {
      const blob = dataURLtoBlob(screenshotData);
      if (!blob) {
        throw new Error('Failed to convert screenshot to blob');
      }

      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);

      // Click the link to trigger download
      link.click();

      // Wait for browser to process the download
      await new Promise(resolve => setTimeout(resolve, 500));

      // Clean up
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      downloadSuccess = true;
      showStatus(`Screenshot "${description}" saved using fallback method`, 'success');
      return true;
    } catch (error) {
      console.error('Fallback download method failed:', error);
      showStatus('Fallback download failed: ' + error.message, 'error');
    }
  }

  // Method 4: Try data URL opening in new tab as last resort
  if (!downloadSuccess) {
    try {
      const newTab = window.open();
      if (newTab) {
        newTab.document.write(`
          <html>
            <head>
              <title>Screenshot - Right-click to save</title>
              <style>
                body { margin: 0; background: #f5f5f5; text-align: center; font-family: sans-serif; }
                .instructions { background: #333; color: white; padding: 10px; position: fixed; top: 0; left: 0; right: 0; }
                img { margin-top: 50px; max-width: 100%; border: 1px solid #ccc; }
              </style>
            </head>
            <body>
              <div class="instructions">Right-click on the image and select "Save Image As..." to download</div>
              <img src="${screenshotData}" alt="Screenshot">
            </body>
          </html>
        `);
        newTab.document.close();

        downloadSuccess = true;
        showStatus('Screenshot opened in new tab. Right-click to save it.', 'info');
        return true;
      } else {
        throw new Error('Failed to open new tab');
      }
    } catch (error) {
      console.error('Tab opening method failed:', error);
      showStatus('All download methods failed. Please try again.', 'error');
      return false;
    }
  }

  return downloadSuccess;
}

/**
 * Captures a screenshot and saves it immediately
 * @param {string} description - Description for the screenshot filename
 * @returns {Promise<string|null>} The screenshot data URL or null if failed
 */
export async function captureAndSaveScreenshot(description = 'portal') {
  try {
    const screenshot = await captureScreenshot();
    if (screenshot) {
      await saveScreenshot(screenshot, description);
      return screenshot;
    }
    return null;
  } catch (error) {
    console.error('Error in captureAndSaveScreenshot:', error);
    showStatus(`Screenshot error: ${error.message}`, 'error');
    return null;
  }
}
