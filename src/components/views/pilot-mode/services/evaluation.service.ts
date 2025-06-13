import type { EvaluationResult, EvaluationService, PilotConfig, ReferenceImage } from '../types';
import { generateEvaluationWithGemini } from './gemini.service';

export class SimpleEvaluationService implements EvaluationService {
  async evaluateResults(
    referenceImages: ReferenceImage[],
    currentScreenshot: string,
    appliedCSS: string,
    config: PilotConfig,
    iteration: number
  ): Promise<EvaluationResult> {
    const prompt = this.createEvaluationPrompt(
      referenceImages,
      currentScreenshot,
      appliedCSS,
      config
    );

    const response = await generateEvaluationWithGemini(
      process.env.GEMINI_API_KEY || '',
      prompt,
      appliedCSS,
      referenceImages[0]?.url,
      currentScreenshot,
      {} // computedStyles not needed for evaluation
    );

    if (!response) {
      throw new Error('No evaluation generated from Gemini');
    }

    return this.parseEvaluationResponse(response, iteration);
  }

  async compareScreenshots(_reference: string, _current: string): Promise<number> {
    // TODO: Implement screenshot comparison logic
    return 0.8; // Placeholder score
  }

  private createEvaluationPrompt(
    _referenceImages: ReferenceImage[],
    _currentScreenshot: string,
    appliedCSS: string,
    config: PilotConfig
  ): string {
    return `Evaluate the CSS implementation based on the reference design.

DESIGN GOAL: ${config.designDescription || 'Transform the page to match the reference design aesthetics'}

CURRENT CSS:
${appliedCSS || '/* No existing CSS */'}

REQUIREMENTS:
1. Evaluate visual accuracy compared to reference design
2. Check for responsive design implementation
3. Verify proper use of CSS properties
4. Identify any missing or incorrect styles
5. Provide specific feedback for improvements

${config.advancedSettings.generateResponsiveCSS ? 'Focus on responsive design evaluation.' : ''}
${config.advancedSettings.useImportantDeclarations ? 'Check for proper use of !important declarations.' : ''}

Generate a detailed evaluation with specific feedback for improvements.`;
  }

  private parseEvaluationResponse(response: string, iteration: number): EvaluationResult {
    try {
      const lines = response.split('\n');
      const feedback: string[] = [];
      let qualityScore: number | undefined;

      for (const line of lines) {
        if (line.toLowerCase().includes('quality score:')) {
          const score = parseFloat(line.split(':')[1].trim());
          if (!isNaN(score)) {
            qualityScore = score;
          }
        } else if (line.trim() && !line.toLowerCase().includes('quality score')) {
          feedback.push(line.trim());
        }
      }

      return {
        iteration,
        isDone: false,
        feedback: feedback.join('\n'),
        qualityScore,
        timestamp: Date.now(),
        screenshotAfter: '',
        cssApplied: '',
      };
    } catch (error) {
      console.error('Error parsing evaluation response:', error);
      return {
        iteration,
        isDone: false,
        feedback: 'Error parsing evaluation response',
        timestamp: Date.now(),
        screenshotAfter: '',
        cssApplied: '',
      };
    }
  }
}

// Export singleton instance
export const evaluationService = new SimpleEvaluationService();
