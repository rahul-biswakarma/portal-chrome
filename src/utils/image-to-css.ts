import { captureScreenshot } from './screenshot';
import {
  generatePromptWithAI as generatePrompt,
  generateCSSWithAI as generateCSS,
  evaluateCSSResultWithAI as evaluateCSSResult,
  getOpenAIApiKey,
} from './openai-client';
import type { TreeNode, TailwindClassData } from '../types';

// Add new interface for prompt response
interface PromptResponse {
  success: boolean;
  prompt: string;
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
export const applyCSS = async (
  tabId: number,
  cssCode: string,
): Promise<boolean> => {
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

/**
 * Main function to handle the entire image-to-CSS workflow
 */
export const processReferenceImage = async (
  referenceImage: File,
  tabId: number,
  classTree: TreeNode,
  tailwindData: TailwindClassData,
  maxIterations = 5,
): Promise<{ success: boolean; message: string }> => {
  try {
    // Get API key
    const apiKey = await getOpenAIApiKey();
    if (!apiKey) {
      return { success: false, message: 'OpenAI API key not found' };
    }

    // Convert reference image to data URL
    const referenceImageURL = await fileToDataURL(referenceImage);

    // Initial screenshot
    let initialScreenshot;
    try {
      initialScreenshot = await captureScreenshot();
    } catch (error) {
      console.error('Error in image-to-CSS workflow:', error);
      return {
        success: false,
        message: `Error capturing screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }

    // Generate prompt
    try {
      const generatedPrompt = await generatePrompt(
        apiKey,
        referenceImageURL,
        initialScreenshot,
      );

      const promptResponse: PromptResponse = {
        success: true,
        prompt: generatedPrompt,
      };

      // Start CSS generation and feedback loop
      let cssCode = '';
      let currentScreenshot = initialScreenshot;
      let iterations = 0;
      let success = false;

      // Ensure classTree is in the right format
      const safeClassTree =
        !classTree || typeof classTree === 'string'
          ? ({
              type: 'root',
              children: [],
              classes: [],
              element: null,
              portalClasses: [],
            } as unknown as TreeNode)
          : classTree;

      // Ensure tailwindData is in the right format
      const safeTailwindData =
        !tailwindData || Array.isArray(tailwindData)
          ? ({} as TailwindClassData)
          : tailwindData;

      while (iterations < maxIterations && !success) {
        iterations++;

        // Send iteration update
        chrome.runtime.sendMessage({
          action: 'css-iteration-update',
          iteration: iterations,
        });

        // Generate CSS based on prompt
        cssCode = await generateCSS(
          apiKey,
          promptResponse.prompt,
          safeClassTree,
          safeTailwindData,
          cssCode,
          iterations - 1,
          referenceImageURL,
          currentScreenshot,
        );

        // Apply CSS
        const appliedSuccessfully = await applyCSS(tabId, cssCode);
        if (!appliedSuccessfully) {
          return { success: false, message: 'Failed to apply CSS' };
        }

        // Take new screenshot after CSS applied
        currentScreenshot = await captureScreenshot();

        // Evaluate result
        const evaluation = await evaluateCSSResult(
          apiKey,
          referenceImageURL,
          currentScreenshot,
          cssCode,
        );

        success = evaluation.isMatch;

        if (!success) {
          // Use feedback for the next iteration if available
          // Since we don't have cssCode in the evaluation anymore,
          // we'll just use the existing css with feedback in prompt
        }
      }

      return {
        success: true,
        message: success
          ? 'DevRev'
          : 'Maximum iterations reached without perfect match',
      };
    } catch (error) {
      console.error('Error generating prompt:', error);
      return { success: false, message: 'Failed to generate prompt' };
    }
  } catch (error) {
    console.error('Error in image-to-CSS workflow:', error);
    return { success: false, message: 'Error processing reference image' };
  }
};
