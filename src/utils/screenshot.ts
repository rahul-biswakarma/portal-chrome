// Screenshot utilities for Chrome extension

/**
 * Convert a data URL to a Blob
 * @param dataURL The data URL to convert
 * @returns The Blob object
 */
export const dataURLtoBlob = (dataURL: string): Blob => {
  const arr = dataURL.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);

  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }

  return new Blob([u8arr], { type: mime });
};

// New interface for screenshot options
export interface ScreenshotOptions {
  tabId?: number;
  fullPage?: boolean;
  selector?: string;
}

/**
 * Capture a screenshot of the current tab
 * @param tabId The ID of the tab to capture
 * @returns Promise resolving to the screenshot as a data URL
 */
export const captureScreenshot = async (tabId: number): Promise<string> => {
  try {
    if (!tabId) {
      throw new Error('No tab ID provided');
    }

    // Use Chrome's native screenshot API
    // First get the current window to ensure we're capturing from the right one
    const windows = await chrome.windows.getCurrent();
    const dataUrl = await chrome.tabs.captureVisibleTab(windows.id!, {
      format: 'png',
      quality: 90,
    });

    if (!dataUrl) {
      throw new Error('Failed to capture screenshot - no data returned');
    }

    return dataUrl;
  } catch (error) {
    console.error('Error capturing screenshot:', error);
    throw new Error(
      `Screenshot capture failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
};

/**
 * Save a screenshot to the user's device
 * @param screenshotData The screenshot data URL
 * @param description Optional description for the filename
 * @returns Promise resolving when the download is complete
 */
export const saveScreenshot = async (
  screenshotData: string,
  description: string = 'portal'
): Promise<void> => {
  const startTime = Date.now();
  console.log(`[SCREENSHOT] Starting save process for "${description}"...`);

  try {
    const filename = `${description.replace(/[^a-z0-9]/gi, '-').toLowerCase()}_${Date.now()}.png`;
    console.log(`[SCREENSHOT] Generated filename: ${filename}`);

    await chrome.downloads.download({
      url: screenshotData,
      filename: filename,
      saveAs: true,
    });

    const totalTime = Date.now() - startTime;
    console.log(`[SCREENSHOT] Save completed in ${totalTime}ms: ${filename}`);
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`[SCREENSHOT] Save failed after ${totalTime}ms:`, error);
    throw error;
  }
};

/**
 * Capture a screenshot of the current tab and save it
 * @param description Optional description for the filename
 * @param options Screenshot options
 * @returns Promise resolving to the screenshot data URL
 */
export const captureAndSaveScreenshot = async (
  description: string = 'portal',
  options?: ScreenshotOptions
): Promise<string> => {
  const startTime = Date.now();
  const screenshotType = options?.fullPage
    ? 'full-page'
    : options?.selector
      ? `element(${options.selector})`
      : 'viewport';
  console.log(
    `[SCREENSHOT] Starting capture and save workflow: ${screenshotType} - "${description}"`
  );

  try {
    const screenshotData = await captureScreenshot(options?.tabId || 0);
    await saveScreenshot(screenshotData, description);

    const totalTime = Date.now() - startTime;
    console.log(`[SCREENSHOT] Complete capture and save workflow finished in ${totalTime}ms`);

    return screenshotData;
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`[SCREENSHOT] Capture and save workflow failed after ${totalTime}ms:`, error);
    throw error;
  }
};
