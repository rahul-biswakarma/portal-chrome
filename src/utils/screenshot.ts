import { getActiveTab, safeSendMessage } from './chrome-utils';

/**
 * Interface for screenshot response
 */
interface ScreenshotResponse {
  success: boolean;
  data?: string;
  error?: string;
}

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
 * Captures a screenshot of the active tab
 * @returns Promise resolving to the screenshot as a data URL
 */
export async function captureScreenshot(): Promise<string> {
  try {
    // Get active tab
    const tab = await getActiveTab();

    if (!tab.id) {
      throw new Error('No active tab found');
    }

    // Send message to background script to capture screenshot
    const response = await safeSendMessage<ScreenshotResponse>(tab.id, {
      action: 'captureVisibleTab',
    });

    if (!response?.success || !response?.data) {
      throw new Error(response?.error || 'Failed to capture screenshot');
    }

    return response.data;
  } catch (error) {
    console.error('Screenshot capture error:', error);
    throw error;
  }
}

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
