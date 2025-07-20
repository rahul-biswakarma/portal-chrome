import { useState, useCallback, useRef } from 'react';
import { dataCollectionService } from '../services/data-collection.service';
import { cssApplicationService } from '../services/css-application.service';
import { generateCSSWithGemini } from '@/utils/gemini';
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
  maxIterations: 1, // Simplified to single-shot generation
  evaluationThreshold: 0.8,
  advancedSettings: {
    preserveExistingStyles: false,
    useImportantDeclarations: true,
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

    // Update CSS editor content if available (like chat customization does)
    if (setCssContent) {
      setCssContent(css);
      addLog('CSS editor updated with generated styles', 'info');
    }

    addLog('CSS applied successfully', 'success');

    // Return the screenshot after CSS application
    return result.screenshotAfter || '';
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
        startTime: Date.now(),
      });

      addLog('Starting pilot mode processing...', 'info');

      // Step 1: Collect page data
      const collectedPageData = await collectPageData();
      setPageData(collectedPageData);

      // Step 2: Generate and apply CSS (single-shot like chat customization)
      addLog('Generating CSS from reference image...', 'info');
      const css = await generateCSS(collectedPageData, 1);

      // Apply CSS and get screenshot
      addLog('Applying CSS to page...', 'info');
      const screenshotAfter = await applyCSS(css);

      // Update processing context with results
      setProcessingContext(prev =>
        prev
          ? {
              ...prev,
              iteration: 1,
              previousCSS: css,
              previousScreenshot: screenshotAfter || collectedPageData.screenshot,
              feedbackHistory: [],
            }
          : null
      );

      addLog('Style transformation complete!', 'success');

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
  }, [config, addLog, setErrorState, clearError, applyCSS, collectPageData, generateCSS]);

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
