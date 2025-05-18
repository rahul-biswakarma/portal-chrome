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

// New interface for screenshot options
export interface ScreenshotOptions {
  selector?: string;
  fullPage?: boolean;
}

/**
 * Capture the full page by scrolling and stitching images
 * @returns Promise resolving to the stitched screenshot as a data URL
 */
const captureFullPage = async (): Promise<string> => {
  try {
    // We need to inject a content script to handle the scrolling and stitching
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab?.id) {
      throw new Error('No active tab found');
    }

    // Execute script to get page dimensions
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        return {
          width: Math.max(
            document.documentElement.scrollWidth,
            document.body.scrollWidth,
          ),
          height: Math.max(
            document.documentElement.scrollHeight,
            document.body.scrollHeight,
          ),
        };
      },
    });

    if (!results[0] || !results[0].result) {
      throw new Error('Failed to get page dimensions');
    }

    const { width, height } = results[0].result;

    // Get the device pixel ratio for higher quality screenshots
    const pixelRatioResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.devicePixelRatio,
    });

    if (!pixelRatioResults[0] || pixelRatioResults[0].result === undefined) {
      throw new Error('Failed to get device pixel ratio');
    }

    const devicePixelRatio = pixelRatioResults[0].result;

    // Get viewport dimensions
    const viewportResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.innerHeight,
    });

    if (!viewportResults[0] || viewportResults[0].result === undefined) {
      throw new Error('Failed to get viewport dimensions');
    }

    const viewportHeight = viewportResults[0].result;

    // Create a canvas to stitch images together
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Failed to create canvas context');
    }

    // Set canvas dimensions
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;

    // Calculate the number of captures needed
    const capturesNeeded = Math.ceil(height / viewportHeight);

    for (let i = 0; i < capturesNeeded; i++) {
      // Scroll to position
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (scrollPosition) => {
          window.scrollTo(0, scrollPosition);
        },
        args: [i * viewportHeight],
      });

      // Give time for the page to render after scrolling
      await new Promise((r) => setTimeout(r, 100));

      // Capture the visible tab
      const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'png' });

      // Load the image
      const img = new Image();
      await new Promise((resolveImg, rejectImg) => {
        img.onload = resolveImg;
        img.onerror = rejectImg;
        img.src = dataUrl;
      });

      // Draw the image at the correct position on the canvas
      context.drawImage(
        img,
        0,
        i * viewportHeight * devicePixelRatio,
        img.width,
        img.height,
      );
    }

    // Reset scroll position
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        window.scrollTo(0, 0);
      },
    });

    // Return the final stitched image
    return canvas.toDataURL('image/png');
  } catch (error) {
    console.error('Error capturing full page screenshot:', error);
    throw error;
  }
};

/**
 * Capture a screenshot of the current page
 * @param options Screenshot options (selector, fullPage)
 * @returns Promise resolving to the screenshot as a data URL
 */
export const captureScreenshot = async (
  options?: ScreenshotOptions,
): Promise<string> => {
  try {
    // If using browser extension API
    if (chrome && chrome.tabs) {
      // Check if we need to capture full page
      if (options?.fullPage) {
        return await captureFullPage();
      }

      // If a specific element is targeted
      if (options?.selector) {
        // Get active tab
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!tab?.id) {
          throw new Error('No active tab found');
        }

        // Execute script to capture the specific element
        const result = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (selector) => {
            const element = document.querySelector(selector);
            if (!element) return null;

            // Return element position and dimensions
            const rect = element.getBoundingClientRect();
            return {
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
              scrollLeft: window.scrollX,
              scrollTop: window.scrollY,
            };
          },
          args: [options.selector],
        });

        if (!result[0] || result[0].result === null) {
          throw new Error(`Element not found: ${options.selector}`);
        }

        // Add proper type assertion to assure TypeScript that elementInfo is defined
        const elementInfo = result[0].result as {
          left: number;
          top: number;
          width: number;
          height: number;
          scrollLeft: number;
          scrollTop: number;
        };

        // Capture visible tab
        const dataUrl = await chrome.tabs.captureVisibleTab({
          format: 'png',
        });

        // Crop to the element
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('Failed to create canvas context');
        }

        const img = new Image();
        await new Promise((resolveImg, rejectImg) => {
          img.onload = resolveImg;
          img.onerror = rejectImg;
          img.src = dataUrl;
        });

        // Set canvas dimensions to match element
        canvas.width = elementInfo.width;
        canvas.height = elementInfo.height;

        // Draw only the element portion
        context.drawImage(
          img,
          elementInfo.left,
          elementInfo.top,
          elementInfo.width,
          elementInfo.height,
          0,
          0,
          elementInfo.width,
          elementInfo.height,
        );

        return canvas.toDataURL('image/png');
      }

      // Regular visible viewport capture
      return await new Promise((resolve, reject) => {
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
      });
    }

    // Fallback for non-extension environments
    throw new Error(
      'Screenshot capture requires browser extension environment',
    );
  } catch (error) {
    console.error('Error capturing screenshot:', error);
    throw error;
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
 * @param options Screenshot options
 * @returns Promise resolving to the screenshot data URL
 */
export const captureAndSaveScreenshot = async (
  description: string = 'portal',
  options?: ScreenshotOptions,
): Promise<string> => {
  try {
    const screenshotData = await captureScreenshot(options);
    await saveScreenshot(screenshotData, description);
    return screenshotData;
  } catch (error) {
    console.error('Error capturing and saving screenshot:', error);
    throw error;
  }
};
