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
  const startTime = Date.now();
  console.log('[SCREENSHOT] Starting full page capture...');

  try {
    // We need to inject a content script to handle the scrolling and stitching
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab?.id) {
      console.error('[SCREENSHOT] No active tab found');
      throw new Error('No active tab found');
    }

    console.log(`[SCREENSHOT] Active tab ID: ${tab.id}, URL: ${tab.url}`);

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
      console.error('[SCREENSHOT] Failed to get page dimensions');
      throw new Error('Failed to get page dimensions');
    }

    const { width, height } = results[0].result;
    console.log(`[SCREENSHOT] Page dimensions: ${width}x${height}px`);

    // Get the device pixel ratio for higher quality screenshots
    const pixelRatioResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.devicePixelRatio,
    });

    if (!pixelRatioResults[0] || pixelRatioResults[0].result === undefined) {
      console.error('[SCREENSHOT] Failed to get device pixel ratio');
      throw new Error('Failed to get device pixel ratio');
    }

    const devicePixelRatio = pixelRatioResults[0].result;
    console.log(`[SCREENSHOT] Device pixel ratio: ${devicePixelRatio}`);

    // Get viewport dimensions
    const viewportResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.innerHeight,
    });

    if (!viewportResults[0] || viewportResults[0].result === undefined) {
      console.error('[SCREENSHOT] Failed to get viewport dimensions');
      throw new Error('Failed to get viewport dimensions');
    }

    const viewportHeight = viewportResults[0].result;
    console.log(`[SCREENSHOT] Viewport height: ${viewportHeight}px`);

    // Create a canvas to stitch images together
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      console.error('[SCREENSHOT] Failed to create canvas context');
      throw new Error('Failed to create canvas context');
    }

    // Set canvas dimensions
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    console.log(
      `[SCREENSHOT] Canvas dimensions: ${canvas.width}x${canvas.height}px`,
    );

    // Calculate the number of captures needed
    const capturesNeeded = Math.ceil(height / viewportHeight);
    console.log(
      `[SCREENSHOT] Will take ${capturesNeeded} captures to cover full page`,
    );

    for (let i = 0; i < capturesNeeded; i++) {
      const scrollPosition = i * viewportHeight;
      console.log(
        `[SCREENSHOT] Capture ${i + 1}/${capturesNeeded}: Scrolling to ${scrollPosition}px`,
      );

      // Scroll to position
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (scrollPosition) => {
          window.scrollTo(0, scrollPosition);
        },
        args: [scrollPosition],
      });

      // Give time for the page to render after scrolling
      await new Promise((r) => setTimeout(r, 100));

      // Capture the visible tab
      const captureStartTime = Date.now();
      const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'png' });
      const captureTime = Date.now() - captureStartTime;
      console.log(
        `[SCREENSHOT] Capture ${i + 1} completed in ${captureTime}ms`,
      );

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

    console.log('[SCREENSHOT] Reset scroll position to top');

    // Return the final stitched image
    const finalImage = canvas.toDataURL('image/png');
    const totalTime = Date.now() - startTime;
    const imageSizeKB = Math.round(finalImage.length / 1024);
    console.log(
      `[SCREENSHOT] Full page capture completed in ${totalTime}ms, size: ${imageSizeKB}KB`,
    );

    return finalImage;
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(
      `[SCREENSHOT] Full page capture failed after ${totalTime}ms:`,
      error,
    );
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
  const startTime = Date.now();
  const screenshotType = options?.fullPage
    ? 'full-page'
    : options?.selector
      ? `element(${options.selector})`
      : 'viewport';
  console.log(`[SCREENSHOT] Starting ${screenshotType} screenshot capture...`);

  try {
    // If using browser extension API
    if (chrome && chrome.tabs) {
      // Check if we need to capture full page
      if (options?.fullPage) {
        console.log('[SCREENSHOT] Delegating to full page capture function');
        return await captureFullPage();
      }

      // If a specific element is targeted
      if (options?.selector) {
        console.log(
          `[SCREENSHOT] Targeting specific element: ${options.selector}`,
        );

        // Get active tab
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!tab?.id) {
          console.error('[SCREENSHOT] No active tab found for element capture');
          throw new Error('No active tab found');
        }

        console.log(`[SCREENSHOT] Element capture on tab ${tab.id}`);

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
          console.error(`[SCREENSHOT] Element not found: ${options.selector}`);
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

        console.log(
          `[SCREENSHOT] Element found at position (${elementInfo.left}, ${elementInfo.top}) with size ${elementInfo.width}x${elementInfo.height}`,
        );

        // Capture visible tab
        const dataUrl = await chrome.tabs.captureVisibleTab({
          format: 'png',
        });

        // Crop to the element
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) {
          console.error(
            '[SCREENSHOT] Failed to create canvas context for element cropping',
          );
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

        const croppedImage = canvas.toDataURL('image/png');
        const totalTime = Date.now() - startTime;
        const imageSizeKB = Math.round(croppedImage.length / 1024);
        console.log(
          `[SCREENSHOT] Element capture completed in ${totalTime}ms, size: ${imageSizeKB}KB`,
        );

        return croppedImage;
      }

      // Regular visible viewport capture
      console.log('[SCREENSHOT] Capturing visible viewport');
      const captureStartTime = Date.now();

      return await new Promise((resolve, reject) => {
        chrome.tabs.captureVisibleTab({ format: 'png' }, (dataUrl) => {
          const captureTime = Date.now() - captureStartTime;

          if (chrome.runtime.lastError) {
            console.error(
              `[SCREENSHOT] Viewport capture failed after ${captureTime}ms:`,
              chrome.runtime.lastError.message,
            );
            reject(
              new Error(
                `Screenshot error: ${chrome.runtime.lastError.message}`,
              ),
            );
          } else {
            const totalTime = Date.now() - startTime;
            const imageSizeKB = Math.round(dataUrl.length / 1024);
            console.log(
              `[SCREENSHOT] Viewport capture completed in ${totalTime}ms, size: ${imageSizeKB}KB`,
            );
            resolve(dataUrl);
          }
        });
      });
    }

    // Fallback for non-extension environments
    console.error('[SCREENSHOT] Browser extension environment not available');
    throw new Error(
      'Screenshot capture requires browser extension environment',
    );
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(
      `[SCREENSHOT] ${screenshotType} capture failed after ${totalTime}ms:`,
      error,
    );
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
  options?: ScreenshotOptions,
): Promise<string> => {
  const startTime = Date.now();
  const screenshotType = options?.fullPage
    ? 'full-page'
    : options?.selector
      ? `element(${options.selector})`
      : 'viewport';
  console.log(
    `[SCREENSHOT] Starting capture and save workflow: ${screenshotType} - "${description}"`,
  );

  try {
    const screenshotData = await captureScreenshot(options);
    await saveScreenshot(screenshotData, description);

    const totalTime = Date.now() - startTime;
    console.log(
      `[SCREENSHOT] Complete capture and save workflow finished in ${totalTime}ms`,
    );

    return screenshotData;
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(
      `[SCREENSHOT] Capture and save workflow failed after ${totalTime}ms:`,
      error,
    );
    throw error;
  }
};
