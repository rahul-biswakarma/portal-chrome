import type { EvaluationResult, EvaluationService, PilotConfig, ReferenceImage } from '../types';
import { generateEvaluationWithGemini } from './gemini.service';
import { getEnvVariable } from '@/utils/environment';

export class SimpleEvaluationService implements EvaluationService {
  async evaluateResults(
    referenceImages: ReferenceImage[],
    currentScreenshot: string,
    appliedCSS: string,
    config: PilotConfig,
    iteration: number
  ): Promise<EvaluationResult> {
    const apiKey = await getEnvVariable('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('Gemini API key not found');
    }

    const prompt = this.createEvaluationPrompt(referenceImages, appliedCSS, config);

    const response = await generateEvaluationWithGemini(
      apiKey,
      prompt,
      appliedCSS,
      referenceImages[0]?.url,
      currentScreenshot,
      {}
    );

    if (!response) {
      throw new Error('No evaluation generated from Gemini');
    }

    return this.parseEvaluationResponse(response, iteration, currentScreenshot, appliedCSS);
  }

  async compareScreenshots(_reference: string, _current: string): Promise<number> {
    return 0.8;
  }

  private createEvaluationPrompt(
    referenceImages: ReferenceImage[],
    appliedCSS: string,
    config: PilotConfig
  ): string {
    const hasReference = referenceImages.length > 0;
    const referenceCount = referenceImages.length;

    return `Compare the current portal design with the reference image${referenceCount > 1 ? 's' : ''} and provide detailed evaluation.

DESIGN GOAL: ${config.designDescription || 'Transform the page to match the reference design aesthetics'}
REFERENCE IMAGES: ${referenceCount} image${referenceCount > 1 ? 's' : ''} provided

EVALUATION CRITERIA:
1. Visual similarity to reference design (colors, typography, layout)
2. Element styling accuracy (buttons, cards, headers)
3. Spacing and proportions matching
4. Overall aesthetic cohesion
5. Design consistency with reference

CURRENT CSS APPLIED:
${appliedCSS || '/* No existing CSS */'}

INSTRUCTIONS:
- Rate quality from 0.0 to 1.0 based on how well the current design matches the reference
- If quality is above ${config.evaluationThreshold}, respond ONLY with "DONE"
- Otherwise, provide specific, actionable feedback for the next iteration
- Focus on the most impactful improvements first
- Be specific about colors, fonts, spacing, and layout changes needed
${!hasReference ? '- NOTE: No reference image provided, evaluate based on general design principles' : ''}

Format your response as:
QUALITY_SCORE: 0.X
FEEDBACK: [specific actionable suggestions for improvement]`;
  }

  private parseEvaluationResponse(
    response: string,
    iteration: number,
    screenshotAfter: string,
    cssApplied: string
  ): EvaluationResult {
    try {
      if (response.trim() === 'DONE') {
        return {
          iteration,
          isDone: true,
          feedback: 'Quality threshold achieved',
          timestamp: Date.now(),
          screenshotAfter,
          cssApplied,
        };
      }

      const qualityMatch = response.match(/QUALITY_SCORE:\s*([\d.]+)/);
      const feedbackMatch = response.match(/FEEDBACK:\s*(.+)/s);

      const qualityScore = qualityMatch ? parseFloat(qualityMatch[1]) : 0;
      const feedback = feedbackMatch ? feedbackMatch[1].trim() : response;

      return {
        iteration,
        isDone: false,
        feedback,
        qualityScore,
        timestamp: Date.now(),
        screenshotAfter,
        cssApplied,
      };
    } catch (error) {
      console.error('Error parsing evaluation response:', error);
      return {
        iteration,
        isDone: false,
        feedback: 'Error parsing evaluation response',
        timestamp: Date.now(),
        screenshotAfter,
        cssApplied,
      };
    }
  }
}

export const evaluationService = new SimpleEvaluationService();
