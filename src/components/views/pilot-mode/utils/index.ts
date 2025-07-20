import type {
  ReferenceImage,
  LogEntry,
  PortalElement,
  PilotError,
  PilotErrorInfo,
  ProcessingStage,
} from '../types';

// File utilities
export const readFileAsDataURL = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const validateImageFile = (file: File): { valid: boolean; error?: string } => {
  const maxSize = 10 * 1024 * 1024; // 10MB
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: 'Invalid file type. Please use JPG, PNG, GIF, or WebP.' };
  }

  if (file.size > maxSize) {
    return { valid: false, error: 'File size too large. Maximum size is 10MB.' };
  }

  return { valid: true };
};

export const createReferenceImage = async (file: File): Promise<ReferenceImage> => {
  const validation = validateImageFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const url = await readFileAsDataURL(file);

  return {
    id: `ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    url,
    name: file.name,
    size: file.size,
    type: file.type,
  };
};

// CSS utilities
export const cleanCSSResponse = (response: string): string => {
  return response
    .replace(/```css\s*/g, '')
    .replace(/```\s*$/g, '')
    .replace(/```/g, '')
    .trim();
};

export const validateCSSStructure = (css: string): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  // Check for basic CSS structure
  if (!css.includes('{') || !css.includes('}')) {
    errors.push('CSS appears to be malformed (missing braces)');
  }

  // Check for portal classes
  if (!css.includes('.portal-')) {
    errors.push('CSS does not contain any portal-* classes');
  }

  // Check for balanced braces
  const openBraces = (css.match(/\{/g) || []).length;
  const closeBraces = (css.match(/\}/g) || []).length;
  if (openBraces !== closeBraces) {
    errors.push('Unbalanced CSS braces');
  }

  return { valid: errors.length === 0, errors };
};

export const extractPortalClasses = (css: string): string[] => {
  const matches = css.match(/\.portal-[a-zA-Z0-9_-]+/g);
  return matches ? [...new Set(matches.map(cls => cls.replace('.', '')))] : [];
};

// Element utilities
export const flattenPortalElements = (elements: PortalElement[]): PortalElement[] => {
  const flattened: PortalElement[] = [];

  const flatten = (element: PortalElement) => {
    flattened.push(element);
    element.children.forEach(flatten);
  };

  elements.forEach(flatten);
  return flattened;
};

export const getAllPortalClasses = (elements: PortalElement[]): string[] => {
  const classes: string[] = [];

  const extractClasses = (element: PortalElement) => {
    classes.push(...element.portalClasses);
    element.children.forEach(extractClasses);
  };

  elements.forEach(extractClasses);
  return [...new Set(classes)];
};

export const formatPortalTree = (elements: PortalElement[], indent = 0): string => {
  return elements
    .map(element => {
      const indentation = '  '.repeat(indent);
      let result = `${indentation}<${element.tagName}`;

      if (element.portalClasses.length > 0) {
        result += ` portal-classes="${element.portalClasses.join(' ')}"`;
      }

      if (element.tailwindClasses.length > 0) {
        result += ` tailwind-classes="${element.tailwindClasses.join(' ')}"`;
      }

      if (element.attributes && Object.keys(element.attributes).length > 0) {
        const attrs = Object.entries(element.attributes)
          .map(([key, value]) => `${key}="${value}"`)
          .join(' ');
        result += ` ${attrs}`;
      }

      result += `>${element.text ? ` ${element.text.slice(0, 50)}${element.text.length > 50 ? '...' : ''}` : ''}`;

      if (element.children.length > 0) {
        result += '\n' + formatPortalTree(element.children, indent + 1);
        result += `\n${indentation}</${element.tagName}>`;
      } else {
        result += ` </${element.tagName}>`;
      }

      return result;
    })
    .join('\n');
};

// Logging utilities
export const createLogEntry = (
  level: 'info' | 'warning' | 'error' | 'success',
  message: string,
  details?: Record<string, unknown>,
  stage?: string,
  iteration?: number
): LogEntry => ({
  id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  timestamp: Date.now(),
  level,
  message,
  details,
  stage: stage as ProcessingStage,
  iteration,
});

export const formatLogMessage = (entry: LogEntry, showTimestamp = true): string => {
  const timestamp = showTimestamp ? new Date(entry.timestamp).toLocaleTimeString() : '';
  const level = entry.level.toUpperCase();
  const stage = entry.stage ? `[${entry.stage}]` : '';
  const iteration = entry.iteration ? `(${entry.iteration})` : '';

  return [timestamp, level, stage, iteration, entry.message].filter(Boolean).join(' ');
};

// Error utilities
export const createPilotError = (
  type: PilotError,
  message: string,
  details?: Record<string, unknown>,
  recoverable = true
): PilotErrorInfo => {
  const suggestions: string[] = [];

  switch (type) {
    case 'API_KEY_MISSING':
      suggestions.push('Set your Gemini API key in Settings');
      break;
    case 'NO_PORTAL_CLASSES':
      suggestions.push('Ensure your page has elements with portal-* classes');
      break;
    case 'SCREENSHOT_FAILED':
      suggestions.push('Try refreshing the page', 'Check if the tab is still active');
      break;
    case 'CSS_GENERATION_FAILED':
      suggestions.push('Check your internet connection', 'Try with different reference images');
      break;
    case 'CSS_APPLICATION_FAILED':
      suggestions.push('Check if the CSS is valid', 'Try applying CSS manually');
      break;
    case 'EVALUATION_FAILED':
      suggestions.push('Try with different reference images', 'Check your internet connection');
      break;
    case 'NETWORK_ERROR':
      suggestions.push('Check your internet connection', 'Try again later');
      break;
  }

  return {
    type,
    message,
    details,
    recoverable,
    suggestions,
  };
};

// Session utilities
export const generateSessionId = (): string => {
  return `pilot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

export const generateFreshSessionId = (prefix = 'pilot'): string => {
  return `${prefix}_fresh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Time utilities
export const formatDuration = (milliseconds: number): string => {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
};

export const estimateTimeRemaining = (
  startTime: number,
  currentIteration: number,
  totalIterations: number
): number => {
  if (currentIteration === 0) return 0;

  const elapsed = Date.now() - startTime;
  const avgTimePerIteration = elapsed / currentIteration;
  const remainingIterations = totalIterations - currentIteration;

  return avgTimePerIteration * remainingIterations;
};

// Validation utilities
export const validatePortalElements = (
  elements: PortalElement[]
): { valid: boolean; issues: string[] } => {
  const issues: string[] = [];
  const allClasses = getAllPortalClasses(elements);

  if (allClasses.length === 0) {
    issues.push('No portal classes found');
  }

  if (elements.length === 0) {
    issues.push('No portal elements found');
  }

  // Check for common issues
  const duplicateClasses = allClasses.filter((cls, index) => allClasses.indexOf(cls) !== index);
  if (duplicateClasses.length > 0) {
    issues.push(`Duplicate portal classes found: ${duplicateClasses.join(', ')}`);
  }

  return { valid: issues.length === 0, issues };
};

// Data URL utilities
export const dataUrlToBase64 = (dataUrl: string): string => {
  return dataUrl.split(',')[1];
};

export const getImageMimeType = (dataUrl: string): string => {
  const match = dataUrl.match(/^data:([^;]+);/);
  return match ? match[1] : 'image/jpeg';
};

export const isValidImageData = (dataUrl: string): boolean => {
  return dataUrl.startsWith('data:image/') && dataUrl.includes('base64,');
};

// Progress calculation utilities
export const calculateProgress = (
  stage: string,
  iteration: number,
  totalIterations: number,
  stageProgress = 0
): number => {
  const stageWeights = {
    'collecting-data': 10,
    'taking-screenshot': 15,
    'generating-css': 30,
    'applying-css': 20,
    evaluating: 25,
  };

  const totalWeight = Object.values(stageWeights).reduce((sum, weight) => sum + weight, 0);
  const iterationWeight = totalWeight / totalIterations;
  const completedIterationsProgress = (iteration - 1) * iterationWeight;

  const currentStageWeight = stageWeights[stage as keyof typeof stageWeights] || 0;
  const currentStageProgress = (stageProgress / 100) * currentStageWeight;

  return Math.min(100, completedIterationsProgress + currentStageProgress);
};

// Debounce utility
export const debounce = <T extends (..._args: Parameters<T>) => ReturnType<T>>(
  func: T,
  delay: number
): ((..._args: Parameters<T>) => void) => {
  let timeoutId: NodeJS.Timeout;

  return (..._args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(..._args), delay);
  };
};
