import { captureScreenshot } from './screenshot';
import { getGeminiApiKey, generatePromptWithGemini } from '@/utils/gemini';

interface EvaluationResult {
  isMatch: boolean;
  feedback?: string;
}

/**
 * Converts a file to a data URL
 */
export const fileToDataURL = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/**
 * Applies CSS to the current page
 */
export const applyCSS = async (tabId: number, cssCode: string): Promise<boolean> => {
  try {
    // Execute script to apply CSS
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (css: string) => {
        // Create or update style element
        let styleEl = document.getElementById('portal-generated-css');
        if (!styleEl) {
          styleEl = document.createElement('style');
          styleEl.id = 'portal-generated-css';
          document.head.appendChild(styleEl);
        }
        styleEl.textContent = css;
        return true;
      },
      args: [cssCode],
    });

    return true;
  } catch (error) {
    console.error('Error applying CSS:', error);
    return false;
  }
};

// Helper function to get current CSS
const getCurrentCSS = async (tabId: number): Promise<string> => {
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const styleEl = document.getElementById('portal-generated-css');
      return styleEl ? styleEl.textContent || '' : '';
    },
  });
  return result[0]?.result || '';
};

// Helper function to get computed styles
const getComputedStyles = async (
  tabId: number
): Promise<Record<string, Record<string, string>>> => {
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const styles: Record<string, Record<string, string>> = {};
      const elements = document.querySelectorAll('[class*="portal-"]');
      elements.forEach(element => {
        const computedStyle = window.getComputedStyle(element);
        const elementStyles: Record<string, string> = {};
        for (const prop of computedStyle) {
          elementStyles[prop] = computedStyle.getPropertyValue(prop);
        }
        styles[element.className] = elementStyles;
      });
      return styles;
    },
  });
  return result[0]?.result || {};
};

/**
 * Main function to handle the entire image-to-CSS workflow
 */
export const processReferenceImage = async (
  referenceImage: File,
  tabId: number
): Promise<{ success: boolean; message: string }> => {
  try {
    // Get API key
    const apiKey = await getGeminiApiKey();
    if (!apiKey) {
      return { success: false, message: 'Gemini API key not found' };
    }

    // Convert reference image to data URL
    const referenceImageURL = await fileToDataURL(referenceImage);

    // Initial screenshot
    let initialScreenshot;
    try {
      console.log('[IMAGE-TO-CSS] Capturing initial page screenshot...');
      const screenshotStartTime = Date.now();
      initialScreenshot = await captureScreenshot(tabId);
      const screenshotTime = Date.now() - screenshotStartTime;
      const imageSizeKB = Math.round(initialScreenshot.length / 1024);
      console.log(
        `[IMAGE-TO-CSS] Initial screenshot captured in ${screenshotTime}ms, size: ${imageSizeKB}KB`
      );
    } catch (error) {
      console.error('[IMAGE-TO-CSS] Error capturing initial screenshot:', error);
      return {
        success: false,
        message: `Error capturing screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }

    // Get current CSS and computed styles
    const currentCSS = await getCurrentCSS(tabId);
    const computedStyles = await getComputedStyles(tabId);

    // Generate prompt
    await generatePromptWithGemini(
      apiKey,
      referenceImageURL,
      initialScreenshot,
      currentCSS,
      computedStyles
    );

    // Generate CSS
    const css = await generateCSSFromImage(referenceImageURL);

    // Apply CSS
    await applyCSS(tabId, css);

    // Capture result screenshot
    const resultScreenshot = await captureScreenshot(tabId);

    // Evaluate result
    const evaluation = await evaluateCSSResult(referenceImageURL, resultScreenshot, css);

    return {
      success: evaluation.isMatch,
      message: evaluation.isMatch
        ? 'CSS generation successful'
        : 'CSS generation needs improvement',
    };
  } catch (error) {
    console.error('Error in image-to-CSS workflow:', error);
    return {
      success: false,
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
};

const evaluateCSSResult = async (
  referenceImage: string,
  currentScreenshot: string,
  cssCode: string
): Promise<EvaluationResult> => {
  // TODO: Implement actual Gemini API call for evaluation
  console.log('Evaluating CSS result:', { referenceImage, currentScreenshot, cssCode });
  return { isMatch: true };
};

export const generateCSSFromImage = async (imageData: string): Promise<string> => {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key not found');
  }

  // TODO: Implement actual Gemini API call for CSS generation
  console.log('Generating CSS from image:', { imageData });
  return `
    .portal-container {
      background-color: #ffffff;
      padding: 1rem;
      border-radius: 0.5rem;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
  `;
};
