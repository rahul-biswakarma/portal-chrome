import type { TreeNode, TailwindClassData } from '../types';
import { captureScreenshot } from '../utils/screenshot';
import {
  generatePromptWithAI,
  generateCSSWithAI,
  evaluateCSSResultWithAI,
  getOpenAIApiKey,
} from '../utils/openai-client';

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
      this.apiKey = await getOpenAIApiKey();
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

      // Capture current page screenshot
      const currentScreenshot = await captureScreenshot();

      // Generate prompt using OpenAI
      const prompt = await generatePromptWithAI(
        this.apiKey!,
        this.referenceImage!,
        currentScreenshot,
      );

      return prompt;
    } catch (error) {
      console.error('Error generating prompt:', error);
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
    portalClassTree: TreeNode,
    tailwindData: TailwindClassData,
    cssApplyCallback: (css: string) => Promise<void>,
    promptOverride?: string,
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

      // Start the feedback loop
      for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
        // Capture current screenshot for this iteration
        const currentScreenshot = await captureScreenshot();

        // Generate CSS
        const css = await generateCSSWithAI(
          this.apiKey!,
          prompt,
          portalClassTree,
          tailwindData,
          this.lastGeneratedCSS,
          attempt,
          this.referenceImage!,
          currentScreenshot,
        );

        // Apply the CSS
        await cssApplyCallback(css);
        this.lastGeneratedCSS = css;

        // Capture screenshot with applied CSS
        const resultScreenshot = await captureScreenshot();

        // Evaluate the result
        const evaluation = await evaluateCSSResultWithAI(
          this.apiKey!,
          this.referenceImage!,
          resultScreenshot,
          css,
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
            message: evaluation.feedback,
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
