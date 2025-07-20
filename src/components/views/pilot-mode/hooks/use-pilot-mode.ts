import { useState, useCallback, useRef } from 'react';
import { dataCollectionService } from '../services/data-collection.service';
import { cssApplicationService } from '../services/css-application.service';
import { generateCSSWithGemini } from '@/utils/gemini';
import { generateEvaluationWithGemini } from '../services/gemini.service';
import { getEnvVariable } from '@/utils/environment';
import {
  CSS_GENERATION_RULES,
  ADDITIONAL_CSS_REQUIREMENTS,
} from '@/constants/css-generation-rules';
import type {
  UsePilotModeReturn,
  PilotStage,
  ProcessingStage,
  ProgressInfo,
  PilotConfig,
  PageData,
  ProcessingContext,
  LogEntry,
  PilotErrorInfo,
  PortalElement,
} from '../types';
import {
  createLogEntry,
  createPilotError,
  generateSessionId,
  generateFreshSessionId,
  calculateProgress,
  formatPortalTree,
  getAllPortalClasses,
  cleanCSSResponse,
  createReferenceImage,
} from '../utils';

// Local tree node interface for CSS generation
interface TreeNode {
  element: string;
  portalClasses: string[];
  tailwindClasses: string[];
  text?: string;
  children: TreeNode[];
}

const defaultConfig: PilotConfig = {
  referenceImages: [],
  designDescription: '',
  maxIterations: 3,
  evaluationThreshold: 0.8,
  advancedSettings: {
    preserveExistingStyles: false,
    useImportantDeclarations: false,
    generateResponsiveCSS: true,
    optimizeForPerformance: false,
  },
};

export const usePilotMode = (setCssContent?: (_css: string) => void): UsePilotModeReturn => {
  // State management
  const [pilotStage, setPilotStage] = useState<PilotStage>('setup');
  const [processingStage, setProcessingStage] = useState<ProcessingStage>('idle');
  const [config, setConfig] = useState<PilotConfig>(defaultConfig);
  const [pageData, setPageData] = useState<PageData | null>(null);
  const [processingContext, setProcessingContext] = useState<ProcessingContext | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<PilotErrorInfo | null>(null);

  // Refs for controlling the process
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentIterationRef = useRef(0);

  // Progress calculation
  // Progress object will be defined after helper functions

  // Helper functions moved up to avoid hoisting issues
  const getProgressMessage = (stage: ProcessingStage, iteration: number): string => {
    switch (stage) {
      case 'collecting-data':
        return 'Analyzing page structure and elements...';
      case 'taking-screenshot':
        return 'Capturing page screenshot...';
      case 'generating-css':
        return `Generating CSS design (iteration ${iteration})...`;
      case 'applying-css':
        return 'Applying CSS to page...';
      case 'evaluating':
        return 'Evaluating design match...';
      case 'complete':
        return 'Processing complete!';
      default:
        return 'Ready to start...';
    }
  };

  const estimateTimeRemaining = (): number => {
    if (!processingContext || currentIterationRef.current === 0) return 0;
    const elapsed = Date.now() - processingContext.startTime;
    const avgTimePerIteration = elapsed / currentIterationRef.current;
    const remainingIterations = config.maxIterations - currentIterationRef.current;
    return avgTimePerIteration * remainingIterations;
  };

  const addLog = useCallback(
    (message: string, level: LogEntry['level'] = 'info', details?: Record<string, unknown>) => {
      const logEntry = createLogEntry(
        level,
        message,
        details,
        processingStage,
        currentIterationRef.current
      );
      setLogs(prev => [...prev, logEntry]);
    },
    [processingStage]
  );

  // Progress object defined after helper functions
  const progress: ProgressInfo = {
    stage: processingStage,
    progress: calculateProgress(processingStage, currentIterationRef.current, config.maxIterations),
    message: getProgressMessage(processingStage, currentIterationRef.current),
    iteration: currentIterationRef.current,
    totalIterations: config.maxIterations,
    estimatedTimeRemaining: processingContext?.startTime ? estimateTimeRemaining() : undefined,
  };

  const setErrorState = useCallback(
    (errorType: PilotErrorInfo['type'], message: string, details?: Record<string, unknown>) => {
      const errorInfo = createPilotError(errorType, message, details);
      setError(errorInfo);
      addLog(message, 'error', details);
    },
    [addLog]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Configuration updates
  const updateConfig = useCallback((updates: Partial<PilotConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, []);

  const addReferenceImage = useCallback(
    async (file: File) => {
      try {
        const referenceImage = await createReferenceImage(file);
        updateConfig({
          referenceImages: [...config.referenceImages, referenceImage],
        });
        addLog(`Added reference image: ${file.name}`, 'success');
      } catch (error) {
        addLog(
          `Failed to add reference image: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'error'
        );
        throw error;
      }
    },
    [config.referenceImages, updateConfig, addLog]
  );

  const removeReferenceImage = useCallback(
    (id: string) => {
      const image = config.referenceImages.find(img => img.id === id);
      if (image) {
        updateConfig({
          referenceImages: config.referenceImages.filter(img => img.id !== id),
        });
        addLog(`Removed reference image: ${image.name}`, 'info');
      }
    },
    [config.referenceImages, updateConfig, addLog]
  );

  // Core processing functions
  const collectPageData = async (): Promise<PageData> => {
    setProcessingStage('collecting-data');
    addLog('Collecting page data...', 'info');

    const result = await dataCollectionService.collectPageData();

    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to collect page data');
    }

    if (result.warnings && result.warnings.length > 0) {
      result.warnings.forEach(warning => addLog(warning, 'warning'));
    }

    addLog('Page data collected successfully', 'success');
    return result.data;
  };

  const generateCSS = async (
    pageData: PageData,
    iteration: number,
    previousFeedback?: string
  ): Promise<string> => {
    if (abortControllerRef.current?.signal.aborted) {
      throw new Error('Processing was aborted');
    }

    setProcessingStage('generating-css');
    addLog(`Generating CSS (iteration ${iteration})...`, 'info');

    try {
      const apiKey = await getEnvVariable('GEMINI_API_KEY');
      if (!apiKey) {
        throw new Error('Gemini API key not found. Please set it in Settings.');
      }

      if (abortControllerRef.current?.signal.aborted) {
        throw new Error('Processing was aborted');
      }

      const sessionId = generateFreshSessionId('css-gen');
      const prompt = createCSSPrompt(pageData, config, iteration, previousFeedback);
      const tree = createTreeFromElements(pageData.portalElements);
      const tailwindData = createTailwindData(pageData.portalElements);

      const css = await generateCSSWithGemini(
        apiKey,
        prompt,
        tree,
        tailwindData,
        pageData.currentCSS,
        config.referenceImages[0]?.url,
        pageData.screenshot,
        pageData.computedStyles,
        sessionId
      );

      if (abortControllerRef.current?.signal.aborted) {
        throw new Error('Processing was aborted');
      }

      if (!css) {
        throw new Error('No CSS generated from Gemini');
      }

      const cleanedCSS = cleanCSSResponse(css);
      addLog(`CSS generated successfully (${cleanedCSS.length} characters)`, 'success');

      return cleanedCSS;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      addLog(`Failed to generate CSS: ${message}`, 'error');
      throw error;
    }
  };

  const applyCSS = async (css: string): Promise<string> => {
    if (abortControllerRef.current?.signal.aborted) {
      throw new Error('Processing was aborted');
    }

    setProcessingStage('applying-css');
    addLog('Applying CSS to page...', 'info');

    const result = await cssApplicationService.applyCSS(css);

    if (abortControllerRef.current?.signal.aborted) {
      throw new Error('Processing was aborted');
    }

    if (!result.success) {
      throw new Error(result.error || 'Failed to apply CSS');
    }

    if (setCssContent) {
      setCssContent(css);
      addLog('CSS editor updated with generated styles', 'info');
    }

    addLog('CSS applied successfully', 'success');
    return result.screenshotAfter || '';
  };

  const evaluateResult = async (
    pageData: PageData,
    appliedCSS: string,
    resultScreenshot: string,
    iteration: number
  ): Promise<{ isDone: boolean; feedback?: string; qualityScore?: number }> => {
    if (abortControllerRef.current?.signal.aborted) {
      throw new Error('Processing was aborted');
    }

    setProcessingStage('evaluating');
    addLog(`Evaluating results (iteration ${iteration})...`, 'info');

    try {
      const apiKey = await getEnvVariable('GEMINI_API_KEY');
      if (!apiKey) {
        throw new Error('Gemini API key not found');
      }

      if (abortControllerRef.current?.signal.aborted) {
        throw new Error('Processing was aborted');
      }

      const referenceImageUrl = config.referenceImages[0]?.url;
      if (!referenceImageUrl) {
        throw new Error('No reference image available');
      }

      const evaluationPrompt = `Compare the current portal design with the reference image and evaluate the transformation quality.

DESIGN GOAL: ${config.designDescription || 'Match the reference design aesthetics'}

EVALUATION CRITERIA:
1. Visual similarity to reference design
2. Color scheme accuracy
3. Typography matching
4. Layout and spacing consistency
5. Overall aesthetic appeal

CURRENT CSS APPLIED:
${appliedCSS}

Rate the quality from 0.0 to 1.0 and provide specific feedback for improvements.
If quality is above ${config.evaluationThreshold}, respond with "DONE".
Otherwise, provide specific suggestions for the next iteration.

Format your response as:
QUALITY_SCORE: 0.X
FEEDBACK: [specific suggestions]`;

      const response = await generateEvaluationWithGemini(
        apiKey,
        evaluationPrompt,
        appliedCSS,
        referenceImageUrl,
        resultScreenshot,
        pageData.computedStyles
      );

      if (abortControllerRef.current?.signal.aborted) {
        throw new Error('Processing was aborted');
      }

      if (!response) {
        return { isDone: false, feedback: 'Evaluation failed' };
      }

      if (response.trim() === 'DONE') {
        addLog('Evaluation complete - quality threshold met!', 'success');
        return { isDone: true };
      }

      const qualityMatch = response.match(/QUALITY_SCORE:\s*([\d.]+)/);
      const feedbackMatch = response.match(/FEEDBACK:\s*(.+)/s);

      const qualityScore = qualityMatch ? parseFloat(qualityMatch[1]) : 0;
      const feedback = feedbackMatch ? feedbackMatch[1].trim() : response;

      const isDone = qualityScore >= config.evaluationThreshold;

      addLog(
        `Quality score: ${qualityScore.toFixed(2)} (${isDone ? 'threshold met' : 'needs improvement'})`,
        isDone ? 'success' : 'warning'
      );

      return { isDone, feedback, qualityScore };
    } catch (error) {
      console.error('Error in evaluation:', error);
      return { isDone: false, feedback: 'Evaluation error occurred' };
    }
  };

  const startProcessing = useCallback(async () => {
    try {
      if (config.referenceImages.length === 0) {
        setErrorState('NO_PORTAL_CLASSES', 'Please add at least one reference image');
        return;
      }

      clearError();
      setIsProcessing(true);
      setPilotStage('processing');
      setProcessingStage('collecting-data');
      currentIterationRef.current = 0;

      abortControllerRef.current = new AbortController();

      const sessionId = generateSessionId();
      setProcessingContext({
        iteration: 0,
        previousCSS: '',
        previousScreenshot: '',
        feedbackHistory: [],
        sessionId,
        startTime: Date.now(),
      });

      addLog('Starting pilot mode processing...', 'info');

      const collectedPageData = await collectPageData();
      setPageData(collectedPageData);

      let currentScreenshot = collectedPageData.screenshot;
      let previousFeedback: string | undefined;

      for (let iteration = 1; iteration <= config.maxIterations; iteration++) {
        if (abortControllerRef.current?.signal.aborted) {
          addLog('Processing interrupted', 'warning');
          return;
        }

        currentIterationRef.current = iteration;
        addLog(`Starting iteration ${iteration}/${config.maxIterations}`, 'info');

        const css = await generateCSS(collectedPageData, iteration, previousFeedback);

        if (abortControllerRef.current?.signal.aborted) {
          addLog('Processing interrupted', 'warning');
          return;
        }

        const screenshotAfter = await applyCSS(css);
        currentScreenshot = screenshotAfter || currentScreenshot;

        setProcessingContext(prev =>
          prev
            ? {
                ...prev,
                iteration,
                previousCSS: css,
                previousScreenshot: currentScreenshot,
              }
            : null
        );

        if (iteration < config.maxIterations) {
          if (abortControllerRef.current?.signal.aborted) {
            addLog('Processing interrupted', 'warning');
            return;
          }

          const evaluation = await evaluateResult(
            collectedPageData,
            css,
            currentScreenshot,
            iteration
          );

          if (abortControllerRef.current?.signal.aborted) {
            addLog('Processing interrupted', 'warning');
            return;
          }

          const evaluationResult = {
            iteration,
            isDone: evaluation.isDone,
            feedback: evaluation.feedback,
            qualityScore: evaluation.qualityScore,
            timestamp: Date.now(),
            screenshotAfter: currentScreenshot,
            cssApplied: css,
          };

          setProcessingContext(prev =>
            prev
              ? {
                  ...prev,
                  feedbackHistory: [...prev.feedbackHistory, evaluationResult],
                }
              : null
          );

          if (evaluation.isDone) {
            addLog(`Quality threshold met in ${iteration} iterations!`, 'success');
            break;
          }

          if (iteration < config.maxIterations) {
            previousFeedback = evaluation.feedback;
            addLog(`Iteration ${iteration} complete, improving...`, 'info');
          }
        } else {
          addLog(`Completed maximum iterations (${config.maxIterations})`, 'info');
        }
      }

      addLog('Style transformation complete!', 'success');
      setProcessingStage('complete');
      setPilotStage('complete');
      addLog('Pilot mode processing completed!', 'success');
    } catch (error) {
      console.error('Error in pilot mode processing:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';

      if (message === 'Processing was aborted') {
        addLog('Processing stopped by user', 'warning');
      } else {
        setErrorState('UNKNOWN_ERROR', message);
      }
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  }, [config, addLog, setErrorState, clearError, applyCSS, collectPageData, generateCSS]);

  const stopProcessing = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    setIsProcessing(false);
    setProcessingStage('idle');
    setPilotStage('complete');

    addLog('Processing stopped by user', 'warning');
    addLog('Session terminated', 'info');
  }, [addLog]);

  const resetSession = useCallback(() => {
    setPilotStage('setup');
    setProcessingStage('idle');
    setPageData(null);
    setProcessingContext(null);
    setLogs([]);
    setIsProcessing(false);
    clearError();
    currentIterationRef.current = 0;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    addLog('Session reset', 'info');
  }, [clearError, addLog]);

  const retryFromStage = useCallback(
    async (stage: ProcessingStage) => {
      addLog(`Retrying from stage: ${stage}`, 'info');
      setProcessingStage(stage);
      // This would implement retry logic based on the stage
      // For now, just restart the entire process
      await startProcessing();
    },
    [addLog, startProcessing]
  );

  // Helper functions for CSS generation
  const createCSSPrompt = (
    pageData: PageData,
    config: PilotConfig,
    iteration: number,
    previousFeedback?: string
  ): string => {
    const portalClasses = getAllPortalClasses(pageData.portalElements);
    const portalTree = formatPortalTree(pageData.portalElements);

    if (iteration === 1) {
      return `You are an expert CSS designer. Your task is to intelligently adapt a reference design to transform the current portal page while respecting its existing structure and content.

${config.designDescription ? `SPECIFIC FOCUS: ${config.designDescription}` : 'GOAL: Match the overall aesthetic and visual style of the reference design'}

IMPORTANT - INTELLIGENT ADAPTATION STRATEGY:
• ANALYZE the current portal's structure and identify what elements exist (buttons, cards, headers, etc.)
• STUDY the reference design for visual styles (colors, typography, spacing, shadows, effects)
• ADAPT the reference design's visual language to the portal's actual elements
• DO NOT try to create elements that don't exist in the portal
• DO NOT replicate exact layouts that don't match the portal structure
• FOCUS on visual transformation: colors, fonts, spacing, borders, shadows, hover effects

CURRENT PORTAL STRUCTURE:
${portalTree}

AVAILABLE PORTAL CLASSES TO STYLE:
${portalClasses.map(cls => `- .${cls}`).join('\n')}

EXISTING CSS (to build upon):
${pageData.currentCSS || '/* No existing CSS */'}

${CSS_GENERATION_RULES}

${ADDITIONAL_CSS_REQUIREMENTS}
6. Intelligently map visual elements from reference to available portal classes
7. Preserve the portal's functional layout while transforming its visual appearance
8. Extract color schemes, typography choices, and design patterns from reference
9. Apply cohesive visual styling that makes the portal feel like the reference design
10. Use gradients, shadows, borders, and effects inspired by the reference

${config.advancedSettings.generateResponsiveCSS ? 'Include responsive design considerations.' : ''}
${config.advancedSettings.useImportantDeclarations ? 'Use !important declarations strategically to override existing styles.' : ''}
${config.advancedSettings.optimizeForPerformance ? 'Optimize for performance with efficient selectors.' : ''}

Create CSS that transforms the portal's visual appearance to match the reference design's aesthetic while being smart about what elements exist and what styling is actually possible.`;
    } else {
      return `Improve the CSS based on feedback to better match the reference design.

DESIGN GOAL: ${config.designDescription || 'Transform the page to match the reference design aesthetics'}

ITERATION: ${iteration}
PREVIOUS FEEDBACK: ${previousFeedback || 'No specific feedback provided'}

CURRENT CSS:
${pageData.currentCSS || '/* No existing CSS */'}

AVAILABLE CLASSES:
${portalClasses.map(cls => `- .${cls}`).join('\n')}

${CSS_GENERATION_RULES}

${ADDITIONAL_CSS_REQUIREMENTS}
6. Address the specific feedback provided
7. Improve visual accuracy to match the reference design
8. Build upon the existing CSS rather than starting over
9. Focus on the areas mentioned in the feedback
10. Maintain any working elements from the previous iteration

${config.advancedSettings.generateResponsiveCSS ? 'Ensure responsive design is maintained.' : ''}
${config.advancedSettings.useImportantDeclarations ? 'Use !important where needed to override existing styles.' : ''}

Generate improved CSS that addresses the feedback while maintaining existing improvements.`;
    }
  };

  const createTreeFromElements = (elements: PortalElement[]): TreeNode => {
    return {
      element: 'div',
      portalClasses: [],
      tailwindClasses: [],
      children: elements.map(el => ({
        element: el.tagName,
        portalClasses: el.portalClasses,
        tailwindClasses: el.tailwindClasses,
        text: el.text,
        children: el.children.map(child => ({
          element: child.tagName,
          portalClasses: child.portalClasses,
          tailwindClasses: child.tailwindClasses,
          text: child.text,
          children: [],
        })),
      })),
    };
  };

  const createTailwindData = (elements: PortalElement[]): Record<string, string[]> => {
    const tailwindData: Record<string, string[]> = {};
    const processElement = (element: PortalElement) => {
      element.portalClasses.forEach((cls: string) => {
        if (!tailwindData[cls]) {
          tailwindData[cls] = element.tailwindClasses;
        }
      });
      element.children.forEach(processElement);
    };
    elements.forEach(processElement);
    return tailwindData;
  };

  // Removed duplicate function declarations

  return {
    // State
    pilotStage,
    processingStage,
    progress,
    config,
    pageData,
    processingContext,
    logs,
    isProcessing,
    error,

    // Actions
    updateConfig,
    startProcessing,
    stopProcessing,
    resetSession,
    addReferenceImage,
    removeReferenceImage,
    retryFromStage,
  };
};
