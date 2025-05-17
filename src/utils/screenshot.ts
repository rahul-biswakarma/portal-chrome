/**
 * Convert a data URL to a Blob
 * @param dataURL The data URL to convert
 * @returns The Blob object
 */
export const dataURLtoBlob = (dataURL: string): Blob => {
  const arr = dataURL.split(',');
  const mime = arr[0].match(/:(.*?);/)![1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);

  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }

  return new Blob([u8arr], { type: mime });
};

/**
 * Utility functions for capturing screenshots
 */

/**
 * Capture a screenshot of the current page
 * @param selector Optional CSS selector to capture specific element
 * @returns Promise resolving to the screenshot as a data URL
 */
export const captureScreenshot = async (selector?: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      // If using browser extension API
      if (chrome && chrome.tabs) {
        chrome.tabs.captureVisibleTab({ format: 'png' }, (dataUrl) => {
          if (chrome.runtime.lastError) {
            reject(
              new Error(
                `Screenshot error: ${chrome.runtime.lastError.message}`,
              ),
            );
          } else {
            resolve(dataUrl);
          }
        });
      } else {
        // Fallback for non-extension environments
        // If a specific element is targeted, capture that element
        if (selector) {
          const element = document.querySelector(selector);
          if (!element) {
            reject(new Error(`Element not found: ${selector}`));
            return;
          }

          // Use html2canvas or similar library for element capture
          // This is pseudo-code - you'll need to include html2canvas or similar
          // html2canvas(element).then(canvas => {
          //   resolve(canvas.toDataURL('image/png'));
          // }).catch(reject);

          // Temporary fallback
          reject(
            new Error('Element capture not supported in this environment'),
          );
        } else {
          // Capture the entire visible area
          reject(
            new Error('Full page capture not supported in this environment'),
          );
        }
      }
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Save a screenshot to the user's device
 * @param screenshotData The screenshot data URL
 * @param description Optional description for the filename
 * @returns Promise resolving when the download is complete
 */
export const saveScreenshot = async (
  screenshotData: string,
  description: string = 'portal',
): Promise<void> => {
  try {
    const filename = `${description.replace(/[^a-z0-9]/gi, '-').toLowerCase()}_${Date.now()}.png`;

    await chrome.downloads.download({
      url: screenshotData,
      filename: filename,
      saveAs: true,
    });
  } catch (error) {
    console.error('Error saving screenshot:', error);
    throw error;
  }
};

/**
 * Capture a screenshot of the current tab and save it
 * @param description Optional description for the filename
 * @returns Promise resolving to the screenshot data URL
 */
export const captureAndSaveScreenshot = async (
  description: string = 'portal',
): Promise<string> => {
  try {
    const screenshotData = await captureScreenshot();
    await saveScreenshot(screenshotData, description);
    return screenshotData;
  } catch (error) {
    console.error('Error capturing and saving screenshot:', error);
    throw error;
  }
};
