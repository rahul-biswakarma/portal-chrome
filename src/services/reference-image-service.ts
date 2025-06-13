import type { TreeNode, TailwindClassData } from '../types';
import { captureScreenshot } from '../utils/screenshot';
import {
  getGeminiApiKey,
  generatePromptWithGemini,
  generateCSSWithGemini,
  evaluateCSSResultWithGemini,
} from '@/utils/gemini';

/**
 * Maximum number of retry attempts for the feedback loop
 */
const MAX_RETRY_ATTEMPTS = 5;

/**
 * Reference image workflow service
 */
export class ReferenceImageService {
  private referenceImage: string | null = null;
  private lastGeneratedCSS: string = '';
  private apiKey: string | null = null;
  private isProcessing: boolean = false;

  /**
   * Set the reference image for CSS generation
   * @param imageDataUrl The reference image data URL
   */
  public setReferenceImage(imageDataUrl: string): void {
    this.referenceImage = imageDataUrl;
    this.lastGeneratedCSS = '';
  }

  /**
   * Check if the service is ready to generate CSS
   * @returns Promise resolving to whether the service is ready
   */
  public async isReady(): Promise<boolean> {
    if (this.isProcessing) {
      return false;
    }

    if (!this.referenceImage) {
      return false;
    }

    if (!this.apiKey) {
      this.apiKey = await getGeminiApiKey();
    }

    return !!this.apiKey;
  }

  /**
   * Generate a prompt for CSS generation based on the reference image
   * @returns Promise resolving to the generated prompt
   */
  public async generatePrompt(): Promise<string> {
    if (!(await this.isReady())) {
      throw new Error('Service not ready. Missing API key or reference image.');
    }

    try {
      this.isProcessing = true;
      console.log('[REFERENCE-SERVICE] Starting prompt generation process...');

      // Get active tab
      const tab = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab[0]?.id) {
        throw new Error('No active tab found');
      }

      const tabId = tab[0].id;

      // Capture current screenshot
      console.log('[REFERENCE-SERVICE] Capturing current page screenshot...');
      const screenshotStartTime = Date.now();
      const currentScreenshot = await captureScreenshot(tab[0].id);
      const screenshotTime = Date.now() - screenshotStartTime;
      const imageSizeKB = Math.round(currentScreenshot.length / 1024);
      console.log(
        `[REFERENCE-SERVICE] Screenshot captured in ${screenshotTime}ms, size: ${imageSizeKB}KB`
      );

      // Extract DOM structure
      let computedStyles: Record<string, Record<string, string>> = {};
      try {
        // Extract computed styles
        const getComputedStylesScript = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const portalElements = document.querySelectorAll('[class*="portal-"]');
            const result: Record<string, Record<string, string>> = {};

            // Important CSS properties to capture
            const importantProperties = [
              // Typography
              'color',
              'font-family',
              'font-size',
              'font-weight',
              'line-height',
              'letter-spacing',
              'text-align',
              'text-decoration',
              'text-transform',

              // Box model
              'width',
              'height',
              'padding',
              'padding-top',
              'padding-right',
              'padding-bottom',
              'padding-left',
              'margin',
              'margin-top',
              'margin-right',
              'margin-bottom',
              'margin-left',

              // Layout
              'display',
              'position',
              'top',
              'right',
              'bottom',
              'left',
              'flex-direction',
              'flex-wrap',
              'justify-content',
              'align-items',
              'grid-template-columns',
              'grid-template-rows',
              'grid-gap',

              // Visual styles
              'background-color',
              'background-image',
              'border',
              'border-radius',
              'box-shadow',
              'opacity',
              'transform',
              'transition',

              // Other
              'z-index',
              'overflow',
              'cursor',
            ];

            portalElements.forEach(element => {
              const classes = element.className.split(' ');
              const portalClasses = classes.filter(cls => cls.startsWith('portal-'));
              const computedStyle = window.getComputedStyle(element);

              portalClasses.forEach(portalClass => {
                const styles: Record<string, string> = {};

                // Extract only the important properties
                importantProperties.forEach(prop => {
                  const value = computedStyle.getPropertyValue(prop);
                  if (value && value !== '') {
                    styles[prop] = value;
                  }
                });

                // Add element tag name for context
                styles['element'] = element.tagName.toLowerCase();

                // Add parent-child relationship info if possible
                const parentElement = element.parentElement;
                if (parentElement && parentElement.className) {
                  const parentPortalClasses = parentElement.className
                    .split(' ')
                    .filter(cls => cls.startsWith('portal-'));
                  if (parentPortalClasses.length > 0) {
                    styles['parent-classes'] = parentPortalClasses.join(' ');
                  }
                }

                // Add child context if it has children
                if (element.children.length > 0) {
                  const childPortalElements = Array.from(element.children).filter(
                    child =>
                      child.className &&
                      child.className.split(' ').some(cls => cls.startsWith('portal-'))
                  );

                  if (childPortalElements.length > 0) {
                    styles['has-portal-children'] = 'true';
                    styles['child-elements'] = childPortalElements.length.toString();
                  }
                }

                result[portalClass] = styles;
              });
            });

            return result;
          },
        });

        computedStyles = getComputedStylesScript[0]?.result || {};

        // Generate prompt using OpenAI
        console.log('[REFERENCE-SERVICE] Generating prompt with AI...');
        const prompt = await generatePromptWithGemini(
          this.apiKey!,
          this.referenceImage!,
          currentScreenshot,
          this.lastGeneratedCSS,
          computedStyles
        );

        console.log('[REFERENCE-SERVICE] Prompt generation completed successfully');
        return prompt;
      } catch (error) {
        console.error('Error extracting DOM structure:', error);
        // Continue without DOM structure if it fails
      }

      // Should never reach here due to the try block, but just in case
      return '';
    } catch (error) {
      console.error('[REFERENCE-SERVICE] Error generating prompt:', error);
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Generate CSS based on the reference image and apply it
   * @param portalClassTree The portal class tree
   * @param tailwindData The tailwind class data
   * @param cssApplyCallback Callback function to apply the generated CSS
   * @param promptOverride Optional user-provided prompt override
   * @returns Promise resolving to the result of the CSS generation
   */
  public async generateAndApplyCSS(
    portalClassTree: TreeNode | undefined,
    tailwindData: TailwindClassData,
    cssApplyCallback: (css: string) => Promise<void>,
    promptOverride?: string
  ): Promise<{ success: boolean; message: string; css: string }> {
    if (!(await this.isReady())) {
      throw new Error('Service not ready. Missing API key or reference image.');
    }

    try {
      this.isProcessing = true;

      // Get or generate prompt
      let prompt: string;
      if (promptOverride) {
        prompt = promptOverride;
      } else {
        prompt = await this.generatePrompt();
      }

      // Get active tab
      const tab = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab[0]?.id) {
        throw new Error('No active tab found');
      }

      // Start the feedback loop
      console.log(
        `[REFERENCE-SERVICE] Starting CSS generation feedback loop (max ${MAX_RETRY_ATTEMPTS} attempts)...`
      );
      for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
        console.log(
          `[REFERENCE-SERVICE] CSS generation attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS}`
        );

        // Capture current screenshot for this iteration
        const screenshotStartTime = Date.now();
        console.log(`[REFERENCE-SERVICE] Capturing screenshot for iteration ${attempt + 1}...`);
        const currentScreenshot = await captureScreenshot(tab[0].id);
        const screenshotTime = Date.now() - screenshotStartTime;
        const imageSizeKB = Math.round(currentScreenshot.length / 1024);
        console.log(
          `[REFERENCE-SERVICE] Iteration ${attempt + 1} screenshot captured in ${screenshotTime}ms, size: ${imageSizeKB}KB`
        );

        // Get computed styles before CSS application
        const getComputedStyles = async (): Promise<Record<string, Record<string, string>>> => {
          try {
            const result = await chrome.scripting.executeScript({
              target: { tabId: tab[0].id! },
              func: () => {
                const portalElements = document.querySelectorAll('[class*="portal-"]');
                const result: Record<string, Record<string, string>> = {};

                // Important CSS properties to capture
                const importantProperties = [
                  'color',
                  'font-family',
                  'font-size',
                  'font-weight',
                  'line-height',
                  'letter-spacing',
                  'text-align',
                  'text-decoration',
                  'text-transform',
                  'width',
                  'height',
                  'padding',
                  'padding-top',
                  'padding-right',
                  'padding-bottom',
                  'padding-left',
                  'margin',
                  'margin-top',
                  'margin-right',
                  'margin-bottom',
                  'margin-left',
                  'display',
                  'position',
                  'top',
                  'right',
                  'bottom',
                  'left',
                  'flex-direction',
                  'flex-wrap',
                  'justify-content',
                  'align-items',
                  'background-color',
                  'background-image',
                  'border',
                  'border-radius',
                  'box-shadow',
                  'opacity',
                  'z-index',
                  'overflow',
                ];

                portalElements.forEach(element => {
                  const classes = element.className.split(' ');
                  const portalClasses = classes.filter(cls => cls.startsWith('portal-'));
                  const computedStyle = window.getComputedStyle(element);

                  portalClasses.forEach(portalClass => {
                    const styles: Record<string, string> = {};

                    importantProperties.forEach(prop => {
                      const value = computedStyle.getPropertyValue(prop);
                      if (value && value !== '') {
                        styles[prop] = value;
                      }
                    });

                    styles['element'] = element.tagName.toLowerCase();

                    result[portalClass] = styles;
                  });
                });

                return result;
              },
            });

            return result[0]?.result || {};
          } catch (error) {
            console.error('Error getting computed styles:', error);
            return {};
          }
        };

        const computedStyles = await getComputedStyles();

        if (!portalClassTree) {
          throw new Error('Portal class tree is required for CSS generation');
        }

        // Generate CSS
        const css = await generateCSSWithGemini(
          this.apiKey!,
          prompt,
          portalClassTree || { element: 'div', portalClasses: [], children: [] },
          tailwindData,
          this.lastGeneratedCSS,
          this.referenceImage!,
          currentScreenshot,
          computedStyles
        );

        // Apply the CSS
        await cssApplyCallback(css);
        this.lastGeneratedCSS = css;

        // Capture screenshot with applied CSS
        const resultScreenshotStartTime = Date.now();
        console.log(
          `[REFERENCE-SERVICE] Capturing result screenshot after CSS application (iteration ${attempt + 1})...`
        );
        const resultScreenshot = await captureScreenshot(tab[0].id);
        const resultScreenshotTime = Date.now() - resultScreenshotStartTime;
        const resultImageSizeKB = Math.round(resultScreenshot.length / 1024);
        console.log(
          `[REFERENCE-SERVICE] Result screenshot captured in ${resultScreenshotTime}ms, size: ${resultImageSizeKB}KB`
        );

        // Get updated computed styles after CSS application
        const updatedComputedStyles = await getComputedStyles();

        // Evaluate the result
        const evaluation = await evaluateCSSResultWithGemini(
          this.apiKey!,
          this.referenceImage!,
          resultScreenshot,
          css,
          portalClassTree,
          tailwindData,
          updatedComputedStyles
        );

        if (evaluation.isMatch) {
          return {
            success: true,
            message: 'DevRev',
            css: css,
          };
        } else if (attempt < MAX_RETRY_ATTEMPTS - 1) {
          // Enhance the prompt with feedback for the next iteration
          prompt = `${prompt}\n\nPrevious attempt feedback: ${evaluation.feedback}`;
        } else {
          // Last attempt, return what we have
          return {
            success: false,
            message: evaluation.feedback || 'CSS generation failed',
            css: css,
          };
        }
      }

      // Should never reach here due to the for loop, but just in case
      return {
        success: false,
        message: 'Maximum retry attempts reached.',
        css: this.lastGeneratedCSS,
      };
    } catch (error) {
      console.error('Error in CSS generation feedback loop:', error);
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Reset the service state
   */
  public reset(): void {
    this.referenceImage = null;
    this.lastGeneratedCSS = '';
    this.isProcessing = false;
  }
}

// Export singleton instance
export const referenceImageService = new ReferenceImageService();

export const analyzeReferenceImage = async (imageData: string): Promise<string> => {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key not found');
  }

  // TODO: Implement actual Gemini API call for image analysis
  console.log('Analyzing reference image:', { imageData });
  return 'Analyzed reference image style and design patterns';
};
