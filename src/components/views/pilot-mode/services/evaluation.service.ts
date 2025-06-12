import { evaluateCSSResultWithGemini } from '@/utils/gemini-client';
import { captureScreenshot } from '@/utils/screenshot';
import type { 
  EvaluationService, 
  EvaluationResult, 
  ReferenceImage, 
  PilotConfig,
  PortalElement 
} from '../types';
import { generateFreshSessionId, dataUrlToBase64 } from '../utils';

export class EvaluationServiceImpl implements EvaluationService {
  
  async evaluateResults(
    referenceImages: ReferenceImage[],
    currentScreenshot: string,
    appliedCSS: string,
    config: PilotConfig,
    iteration: number
  ): Promise<EvaluationResult> {
    try {
      // Generate fresh session ID for each evaluation (no chat history)
      const sessionId = generateFreshSessionId('eval');
      
      // Take a fresh screenshot after CSS has been applied
      const freshScreenshot = await captureScreenshot({ fullPage: true });
      const screenshotToUse = freshScreenshot || currentScreenshot;
      
      // Use the first reference image for evaluation
      const primaryReference = referenceImages[0];
      if (!primaryReference) {
        throw new Error('No reference image available for evaluation');
      }
      
      // Create simplified tree structure for evaluation
      const simpleTree = {
        element: 'div',
        portalClasses: [],
        tailwindClasses: [],
        children: []
      };
      
      // Create empty tailwind data (evaluation doesn't need detailed class info)
      const tailwindData: Record<string, string[]> = {};
      
      // Evaluate using Gemini
      const result = await evaluateCSSResultWithGemini(
        '', // API key will be fetched internally
        primaryReference.url,
        screenshotToUse,
        appliedCSS,
        simpleTree,
        tailwindData,
        {}, // computed styles not needed for evaluation
        sessionId
      );
      
      // Parse the feedback and determine if we're done
      const isDone = result.isMatch || result.feedback?.trim().toUpperCase() === 'DONE';
      
      // Generate improvement suggestions if not done
      const improvementsSuggested = isDone ? [] : this.extractImprovementSuggestions(result.feedback || '');
      
      // Calculate a rough quality score based on feedback
      const qualityScore = this.calculateQualityScore(result.feedback || '', isDone);
      
      return {
        iteration,
        isDone,
        feedback: isDone ? 'Design matches the reference successfully!' : result.feedback,
        improvementsSuggested,
        qualityScore,
        timestamp: Date.now(),
        screenshotAfter: screenshotToUse,
        cssApplied: appliedCSS
      };
      
    } catch (error) {
      console.error('Error evaluating results:', error);
      
      // Return a failed evaluation result
      return {
        iteration,
        isDone: false,
        feedback: `Evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        improvementsSuggested: ['Check your internet connection', 'Verify reference images are valid'],
        qualityScore: 0,
        timestamp: Date.now(),
        screenshotAfter: currentScreenshot,
        cssApplied: appliedCSS
      };
    }
  }
  
  async compareScreenshots(reference: string, current: string): Promise<number> {
    try {
      // This is a simplified comparison - in a real implementation,
      // you might want to use image comparison libraries
      
      // For now, we'll use a basic approach:
      // - Compare image sizes
      // - Basic visual similarity (placeholder)
      
      if (!reference || !current) {
        return 0;
      }
      
      // Extract base64 data
      const refData = dataUrlToBase64(reference);
      const curData = dataUrlToBase64(current);
      
      // Simple similarity check based on data length (very basic)
      const sizeDiff = Math.abs(refData.length - curData.length);
      const maxSize = Math.max(refData.length, curData.length);
      const sizeSimilarity = 1 - (sizeDiff / maxSize);
      
      // Return a similarity score between 0 and 1
      return Math.max(0, Math.min(1, sizeSimilarity));
      
    } catch (error) {
      console.error('Error comparing screenshots:', error);
      return 0;
    }
  }
  
  private extractImprovementSuggestions(feedback: string): string[] {
    const suggestions: string[] = [];
    
    // Look for common improvement patterns in feedback
    const patterns = [
      { pattern: /color/i, suggestion: 'Adjust colors to better match reference' },
      { pattern: /spacing|padding|margin/i, suggestion: 'Fine-tune spacing and layout' },
      { pattern: /font|typography|text/i, suggestion: 'Improve typography and text styling' },
      { pattern: /size|width|height/i, suggestion: 'Adjust element dimensions' },
      { pattern: /border|outline/i, suggestion: 'Refine borders and outlines' },
      { pattern: /background/i, suggestion: 'Update background styling' },
      { pattern: /shadow|effect/i, suggestion: 'Enhance visual effects and shadows' },
      { pattern: /responsive|mobile/i, suggestion: 'Improve responsive design' },
      { pattern: /hover|interaction/i, suggestion: 'Add interactive states' },
      { pattern: /alignment|position/i, suggestion: 'Fix element positioning' }
    ];
    
    patterns.forEach(({ pattern, suggestion }) => {
      if (pattern.test(feedback)) {
        suggestions.push(suggestion);
      }
    });
    
    // If no specific patterns found, add general suggestions
    if (suggestions.length === 0) {
      suggestions.push(
        'Review overall visual accuracy',
        'Check color consistency',
        'Verify spacing and layout'
      );
    }
    
    // Limit to top 5 suggestions
    return suggestions.slice(0, 5);
  }
  
  private calculateQualityScore(feedback: string, isDone: boolean): number {
    if (isDone) {
      return 1.0; // Perfect match
    }
    
    // Analyze feedback to estimate quality
    let score = 0.5; // Start with middle score
    
    // Positive indicators
    const positivePatterns = [
      /good|great|excellent|perfect|matches|correct/i,
      /close|similar|almost/i,
      /minor|small|slight/i
    ];
    
    // Negative indicators
    const negativePatterns = [
      /wrong|incorrect|bad|poor|terrible/i,
      /major|significant|completely/i,
      /missing|lacking|needs/i
    ];
    
    // Count positive and negative indicators
    let positiveCount = 0;
    let negativeCount = 0;
    
    positivePatterns.forEach(pattern => {
      if (pattern.test(feedback)) positiveCount++;
    });
    
    negativePatterns.forEach(pattern => {
      if (pattern.test(feedback)) negativeCount++;
    });
    
    // Adjust score based on feedback sentiment
    if (positiveCount > negativeCount) {
      score = Math.min(0.9, score + (positiveCount * 0.1)); // Cap at 0.9 for non-done results
    } else if (negativeCount > positiveCount) {
      score = Math.max(0.1, score - (negativeCount * 0.1)); // Floor at 0.1
    }
    
    // If feedback is very short or generic, lower the score
    if (feedback.length < 50) {
      score *= 0.8;
    }
    
    return Math.round(score * 100) / 100; // Round to 2 decimal places
  }
  
  // Helper method to analyze multiple reference images
  async evaluateAgainstMultipleReferences(
    referenceImages: ReferenceImage[],
    currentScreenshot: string,
    appliedCSS: string,
    config: PilotConfig,
    iteration: number
  ): Promise<EvaluationResult[]> {
    const results: EvaluationResult[] = [];
    
    for (const reference of referenceImages) {
      try {
        const result = await this.evaluateResults(
          [reference],
          currentScreenshot,
          appliedCSS,
          config,
          iteration
        );
        results.push(result);
      } catch (error) {
        console.error(`Error evaluating against reference ${reference.id}:`, error);
        // Continue with other references
      }
    }
    
    return results;
  }
  
  // Helper method to combine multiple evaluation results
  combineEvaluationResults(results: EvaluationResult[]): EvaluationResult {
    if (results.length === 0) {
      throw new Error('No evaluation results to combine');
    }
    
    if (results.length === 1) {
      return results[0];
    }
    
    // Use the best result (highest quality score) as the primary result
    const bestResult = results.reduce((best, current) => 
      (current.qualityScore || 0) > (best.qualityScore || 0) ? current : best
    );
    
    // Combine improvement suggestions from all results
    const allSuggestions = results.flatMap(r => r.improvementsSuggested || []);
    const uniqueSuggestions = [...new Set(allSuggestions)];
    
    // Average quality scores
    const avgQualityScore = results.reduce((sum, r) => sum + (r.qualityScore || 0), 0) / results.length;
    
    // Check if any result is done
    const anyDone = results.some(r => r.isDone);
    
    return {
      ...bestResult,
      isDone: anyDone,
      qualityScore: avgQualityScore,
      improvementsSuggested: uniqueSuggestions.slice(0, 8), // Limit combined suggestions
      feedback: anyDone 
        ? 'Design successfully matches one or more reference images!'
        : bestResult.feedback
    };
  }
}

// Export singleton instance
export const evaluationService = new EvaluationServiceImpl(); 