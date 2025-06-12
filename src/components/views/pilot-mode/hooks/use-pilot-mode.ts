import { useState, useCallback, useRef } from 'react';
import { dataCollectionService } from '../services/data-collection.service';
import { cssApplicationService } from '../services/css-application.service';
import { evaluationService } from '../services/evaluation.service';
import { generateCSSWithGemini, evaluateCSSResultWithGemini } from '@/utils/gemini-client';
import { getEnvVariable } from '@/utils/env-variables';
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
  EvaluationResult
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
  createReferenceImage
} from '../utils';

const defaultConfig: PilotConfig = {
  referenceImages: [],
  designDescription: '',
  maxIterations: 5,
  evaluationThreshold: 0.8,
  advancedSettings: {
    preserveExistingStyles: false,
    useImportantDeclarations: true,
    generateResponsiveCSS: true,
    optimizeForPerformance: false
  }
};

export const usePilotMode = (): UsePilotModeReturn => {
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
  const progress: ProgressInfo = {
    stage: processingStage,
    progress: calculateProgress(
      processingStage,
      currentIterationRef.current,
      config.maxIterations
    ),
    message: getProgressMessage(processingStage, currentIterationRef.current),
    iteration: currentIterationRef.current,
    totalIterations: config.maxIterations,
    estimatedTimeRemaining: processingContext?.startTime 
      ? estimateTimeRemaining() 
      : undefined
  };

  // Helper functions
  const addLog = useCallback((message: string, level: LogEntry['level'] = 'info', details?: Record<string, unknown>) => {
    const logEntry = createLogEntry(level, message, details, processingStage, currentIterationRef.current);
    setLogs(prev => [...prev, logEntry]);
  }, [processingStage]);

  const setErrorState = useCallback((errorType: PilotErrorInfo['type'], message: string, details?: Record<string, unknown>) => {
    const errorInfo = createPilotError(errorType, message, details);
    setError(errorInfo);
    addLog(message, 'error', details);
  }, [addLog]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Configuration updates
  const updateConfig = useCallback((updates: Partial<PilotConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, []);

  const addReferenceImage = useCallback(async (file: File) => {
    try {
      const referenceImage = await createReferenceImage(file);
      updateConfig({
        referenceImages: [...config.referenceImages, referenceImage]
      });
      addLog(`Added reference image: ${file.name}`, 'success');
    } catch (error) {
      addLog(
        `Failed to add reference image: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error'
      );
      throw error;
    }
  }, [config.referenceImages, updateConfig, addLog]);

  const removeReferenceImage = useCallback((id: string) => {
    const image = config.referenceImages.find(img => img.id === id);
    if (image) {
      updateConfig({
        referenceImages: config.referenceImages.filter(img => img.id !== id)
      });
      addLog(`Removed reference image: ${image.name}`, 'info');
    }
  }, [config.referenceImages, updateConfig, addLog]);

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

  const generateCSS = async (pageData: PageData, iteration: number, previousFeedback?: string): Promise<string> => {
    setProcessingStage('generating-css');
    addLog(`Generating CSS (iteration ${iteration})...`, 'info');
    
    try {
      const apiKey = await getEnvVariable('GEMINI_API_KEY');
      if (!apiKey) {
        throw new Error('Gemini API key not found. Please set it in Settings.');
      }

      // Generate fresh session ID for each CSS generation (no chat history)
      const sessionId = generateFreshSessionId('css-gen');
      
      // Create prompt based on iteration
      const prompt = createCSSPrompt(pageData, config, iteration, previousFeedback);
      
      // Convert to the format expected by generateCSSWithGemini
      const tree = createTreeFromElements(pageData.portalElements);
      const tailwindData = createTailwindData(pageData.portalElements);

      const css = await generateCSSWithGemini(
        apiKey,
        prompt,
        tree,
        tailwindData,
        pageData.currentCSS,
        iteration - 1, // Gemini expects 0-based iteration
        config.referenceImages[0]?.url,
        pageData.screenshot,
        pageData.computedStyles,
        sessionId
      );

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
    setProcessingStage('applying-css');
    addLog('Applying CSS to page...', 'info');
    
    const result = await cssApplicationService.applyCSS(css);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to apply CSS');
    }
    
    addLog('CSS applied successfully', 'success');
    
    // Return the screenshot after CSS application
    return result.screenshotAfter || '';
  };

  const evaluateResults = async (css: string, screenshot: string, iteration: number): Promise<EvaluationResult> => {
    setProcessingStage('evaluating');
    addLog('Evaluating results...', 'info');
    
    // Generate fresh session ID for each evaluation (no chat history)
    const sessionId = generateFreshSessionId('eval');
    
    try {
      const apiKey = await getEnvVariable('GEMINI_API_KEY');
      if (!apiKey) {
        throw new Error('Gemini API key not found');
      }

      // Use the evaluation service with fresh session
      const result = await evaluationService.evaluateResults(
        config.referenceImages,
        screenshot,
        css,
        config,
        iteration
      );
      
      addLog(
        `Evaluation complete: ${result.isDone ? 'Design matches!' : 'Needs improvement'}`,
        result.isDone ? 'success' : 'info'
      );
      
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      addLog(`Evaluation failed: ${message}`, 'error');
      
      // Return a failed evaluation result
      return {
        iteration,
        isDone: false,
        feedback: `Evaluation failed: ${message}`,
        improvementsSuggested: ['Check your internet connection', 'Try again'],
        qualityScore: 0,
        timestamp: Date.now(),
        screenshotAfter: screenshot,
        cssApplied: css
      };
    }
  };

  // Main processing workflow
  const startProcessing = useCallback(async () => {
    try {
      // Validation
      if (config.referenceImages.length === 0) {
        setErrorState('NO_PORTAL_CLASSES', 'Please add at least one reference image');
        return;
      }

      // Reset state
      clearError();
      setIsProcessing(true);
      setPilotStage('processing');
      setProcessingStage('collecting-data');
      currentIterationRef.current = 0;
      
      // Create abort controller
      abortControllerRef.current = new AbortController();
      
      // Initialize processing context with fresh session
      const sessionId = generateSessionId();
      setProcessingContext({
        iteration: 0,
        previousCSS: '',
        previousScreenshot: '',
        feedbackHistory: [],
        sessionId,
        startTime: Date.now()
      });

      addLog('Starting pilot mode processing...', 'info');

      // Step 1: Collect page data
      const collectedPageData = await collectPageData();
      setPageData(collectedPageData);

      let currentCSS = collectedPageData.currentCSS;
      let currentScreenshot = collectedPageData.screenshot;
      let feedbackHistory: EvaluationResult[] = [];

      // Step 2: Iterative CSS generation and evaluation
      for (let iteration = 1; iteration <= config.maxIterations; iteration++) {
        if (abortControllerRef.current?.signal.aborted) {
          addLog('Processing aborted by user', 'warning');
          break;
        }

        currentIterationRef.current = iteration;
        addLog(`Starting iteration ${iteration}/${config.maxIterations}`, 'info');

        // Generate CSS
        const previousFeedback = feedbackHistory[feedbackHistory.length - 1]?.feedback;
        const css = await generateCSS(collectedPageData, iteration, previousFeedback);
        
        // Apply CSS
        const screenshotAfter = await applyCSS(css);
        currentCSS = css;
        currentScreenshot = screenshotAfter || currentScreenshot;
        
        // Update page data with new CSS for next iteration
        collectedPageData.currentCSS = css;
        
        // Evaluate results
        const evaluation = await evaluateResults(css, currentScreenshot, iteration);
        feedbackHistory.push(evaluation);
        
        // Update processing context
        setProcessingContext(prev => prev ? {
          ...prev,
          iteration,
          previousCSS: css,
          previousScreenshot: currentScreenshot,
          feedbackHistory
        } : null);

        // Check if we're done
        if (evaluation.isDone || evaluation.qualityScore >= config.evaluationThreshold) {
          addLog(`Design goal achieved in ${iteration} iterations!`, 'success');
          break;
        }

        addLog(`Iteration ${iteration} complete. Quality score: ${evaluation.qualityScore}`, 'info');
      }

      // Complete
      setProcessingStage('complete');
      setPilotStage('complete');
      addLog('Pilot mode processing completed!', 'success');

    } catch (error) {
      console.error('Error in pilot mode processing:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      setErrorState('UNKNOWN_ERROR', message);
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  }, [config, addLog, setErrorState, clearError]);

  const stopProcessing = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      addLog('Processing stopped by user', 'warning');
    }
    setIsProcessing(false);
    setProcessingStage('idle');
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

  const retryFromStage = useCallback(async (stage: ProcessingStage) => {
    addLog(`Retrying from stage: ${stage}`, 'info');
    setProcessingStage(stage);
    // This would implement retry logic based on the stage
    // For now, just restart the entire process
    await startProcessing();
  }, [addLog, startProcessing]);

  // Helper functions for CSS generation
  const createCSSPrompt = (pageData: PageData, config: PilotConfig, iteration: number, previousFeedback?: string): string => {
    const portalClasses = getAllPortalClasses(pageData.portalElements);
    const portalTree = formatPortalTree(pageData.portalElements);
    
    if (iteration === 1) {
      return `Create CSS to transform this page to match the reference design.

DESIGN GOAL: ${config.designDescription || 'Transform the page to match the reference design aesthetics'}

PORTAL ELEMENTS:
${portalTree}

AVAILABLE CLASSES:
${portalClasses.map(cls => `- .${cls}`).join('\n')}

CURRENT CSS:
${pageData.currentCSS || '/* No existing CSS */'}

REQUIREMENTS:
1. Use ONLY the portal classes listed above
2. Generate complete CSS that matches the reference design
3. Focus on colors, typography, spacing, layout, and visual effects
4. Make it modern and visually appealing
5. Ensure good contrast and accessibility

${config.advancedSettings.generateResponsiveCSS ? 'Include responsive breakpoints for mobile and tablet.' : ''}
${config.advancedSettings.useImportantDeclarations ? 'Use !important declarations where necessary to override existing styles.' : ''}
${config.advancedSettings.optimizeForPerformance ? 'Optimize CSS for performance with efficient selectors.' : ''}

Generate clean, modern CSS that transforms the page to match the reference design.`;
    } else {
      return `Improve the CSS based on feedback to better match the reference design.

DESIGN GOAL: ${config.designDescription || 'Transform the page to match the reference design aesthetics'}

ITERATION: ${iteration}
PREVIOUS FEEDBACK: ${previousFeedback || 'No specific feedback provided'}

CURRENT CSS:
${pageData.currentCSS || '/* No existing CSS */'}

AVAILABLE CLASSES:
${portalClasses.map(cls => `- .${cls}`).join('\n')}

REQUIREMENTS:
1. Address the specific feedback provided
2. Improve visual accuracy to match the reference design
3. Build upon the existing CSS rather than starting over
4. Focus on the areas mentioned in the feedback
5. Maintain any working elements from the previous iteration

${config.advancedSettings.generateResponsiveCSS ? 'Ensure responsive design is maintained.' : ''}
${config.advancedSettings.useImportantDeclarations ? 'Use !important where needed to override existing styles.' : ''}

Generate improved CSS that addresses the feedback while maintaining existing improvements.`;
    }
  };

  const createTreeFromElements = (elements: any[]): any => {
    return {
      element: 'div',
      portalClasses: [],
      tailwindClasses: [],
      children: elements.map(el => ({
        element: el.tagName,
        portalClasses: el.portalClasses,
        tailwindClasses: el.tailwindClasses,
        text: el.text,
        children: el.children
      }))
    };
  };

  const createTailwindData = (elements: any[]): Record<string, string[]> => {
    const tailwindData: Record<string, string[]> = {};
    const processElement = (element: any) => {
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

  const getProgressMessage = (stage: ProcessingStage, iteration: number): string => {
    switch (stage) {
      case 'collecting-data': return 'Analyzing page structure and elements...';
      case 'taking-screenshot': return 'Capturing page screenshot...';
      case 'generating-css': return `Generating CSS design (iteration ${iteration})...`;
      case 'applying-css': return 'Applying CSS to page...';
      case 'evaluating': return 'Evaluating design match...';
      case 'complete': return 'Processing complete!';
      default: return 'Ready to start...';
    }
  };

  const estimateTimeRemaining = (): number => {
    if (!processingContext || currentIterationRef.current === 0) return 0;
    const elapsed = Date.now() - processingContext.startTime;
    const avgTimePerIteration = elapsed / currentIterationRef.current;
    const remainingIterations = config.maxIterations - currentIterationRef.current;
    return avgTimePerIteration * remainingIterations;
  };

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
    retryFromStage
  };
}; 