// Pilot mode stages
export type PilotStage = 
  | 'setup'
  | 'processing'
  | 'complete';

export type ProcessingStage =
  | 'idle'
  | 'collecting-data'
  | 'taking-screenshot'
  | 'generating-css'
  | 'applying-css'
  | 'evaluating'
  | 'complete';

// Interface for reference image
export interface ReferenceImage {
  id: string;
  url: string;
  name: string;
  size: number;
  type: string;
}

// Interface for portal element
export interface PortalElement {
  tagName: string;
  portalClasses: string[];
  tailwindClasses: string[];
  text?: string;
  children: PortalElement[];
  attributes?: Record<string, string>;
  boundingRect?: {
    width: number;
    height: number;
    top: number;
    left: number;
  };
}

// Interface for page data collection
export interface PageData {
  screenshot: string;
  portalElements: PortalElement[];
  currentCSS: string;
  computedStyles: Record<string, Record<string, string>>;
  pageMetadata: {
    title: string;
    url: string;
    timestamp: number;
    viewportSize: { width: number; height: number };
  };
}

// Configuration interface
export interface PilotConfig {
  referenceImages: ReferenceImage[];
  designDescription: string;
  maxIterations: number;
  evaluationThreshold: number;
  advancedSettings: {
    preserveExistingStyles: boolean;
    useImportantDeclarations: boolean;
    generateResponsiveCSS: boolean;
    optimizeForPerformance: boolean;
  };
}

// Processing context for iterations
export interface ProcessingContext {
  iteration: number;
  previousCSS: string;
  previousScreenshot: string;
  feedbackHistory: EvaluationResult[];
  sessionId: string;
  startTime: number;
}

// Evaluation result interface
export interface EvaluationResult {
  iteration: number;
  isDone: boolean;
  feedback?: string;
  improvementsSuggested?: string[];
  qualityScore?: number;
  timestamp: number;
  screenshotAfter: string;
  cssApplied: string;
}

// CSS generation options
export interface CSSGenerationOptions {
  iteration: number;
  previousFeedback?: string;
  focusAreas?: string[];
  preserveStyles?: string[];
  priorityClasses?: string[];
}

// Data collection result
export interface DataCollectionResult {
  success: boolean;
  data?: PageData;
  error?: string;
  warnings?: string[];
}

// CSS application result
export interface CSSApplicationResult {
  success: boolean;
  appliedCSS: string;
  screenshotAfter?: string;
  error?: string;
  validationResult?: {
    validRules: number;
    invalidRules: string[];
    appliedRules: number;
  };
}

// Progress information
export interface ProgressInfo {
  stage: ProcessingStage;
  progress: number;
  message: string;
  iteration: number;
  totalIterations: number;
  estimatedTimeRemaining?: number;
}

// Error types
export type PilotError = 
  | 'API_KEY_MISSING'
  | 'NO_PORTAL_CLASSES'
  | 'SCREENSHOT_FAILED'
  | 'CSS_GENERATION_FAILED'
  | 'CSS_APPLICATION_FAILED'
  | 'EVALUATION_FAILED'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';

export interface PilotErrorInfo {
  type: PilotError;
  message: string;
  details?: Record<string, unknown>;
  recoverable: boolean;
  suggestions?: string[];
}

// Log entry interface
export interface LogEntry {
  id: string;
  timestamp: number;
  level: 'info' | 'warning' | 'error' | 'success';
  message: string;
  details?: Record<string, unknown>;
  stage?: ProcessingStage;
  iteration?: number;
}

// Session data for persistence
export interface SessionData {
  id: string;
  config: PilotConfig;
  pageData?: PageData;
  processingContext?: ProcessingContext;
  logs: LogEntry[];
  createdAt: number;
  updatedAt: number;
  status: PilotStage;
}

// Hook return types
export interface UsePilotModeReturn {
  // State
  pilotStage: PilotStage;
  processingStage: ProcessingStage;
  progress: ProgressInfo;
  config: PilotConfig;
  pageData: PageData | null;
  processingContext: ProcessingContext | null;
  logs: LogEntry[];
  isProcessing: boolean;
  error: PilotErrorInfo | null;

  // Actions
  updateConfig: (updates: Partial<PilotConfig>) => void;
  startProcessing: () => Promise<void>;
  stopProcessing: () => void;
  resetSession: () => void;
  addReferenceImage: (file: File) => Promise<void>;
  removeReferenceImage: (id: string) => void;
  retryFromStage: (stage: ProcessingStage) => Promise<void>;
}

// Service interfaces
export interface DataCollectionService {
  collectPageData(): Promise<DataCollectionResult>;
  extractPortalElements(tabId: number): Promise<PortalElement[]>;
  getCurrentPageCSS(tabId: number): Promise<string>;
  getComputedStyles(tabId: number): Promise<Record<string, Record<string, string>>>;
  capturePageScreenshot(): Promise<string>;
}

export interface CSSGenerationService {
  generateCSS(
    pageData: PageData,
    config: PilotConfig,
    options: CSSGenerationOptions
  ): Promise<string>;
  validateCSS(css: string): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }>;
}

export interface CSSApplicationService {
  applyCSS(css: string): Promise<CSSApplicationResult>;
  removeCSS(): Promise<boolean>;
  validateApplication(css: string): Promise<boolean>;
}

export interface EvaluationService {
  evaluateResults(
    referenceImages: ReferenceImage[],
    currentScreenshot: string,
    appliedCSS: string,
    config: PilotConfig,
    iteration: number
  ): Promise<EvaluationResult>;
  compareScreenshots(reference: string, current: string): Promise<number>;
}

// Component props interfaces
export interface SetupStageProps {
  config: PilotConfig;
  onConfigUpdate: (updates: Partial<PilotConfig>) => void;
  onStart: () => void;
  isProcessing: boolean;
  onAddImage: (file: File) => Promise<void>;
  onRemoveImage: (imageId: string) => void;
}

// Processing result for completed sessions
export interface ProcessingResult {
  success: boolean;
  finalQualityScore: number;
  iterationsUsed: number;
  processingTime: number;
  generatedCSS: string;
  finalMessage?: string;
  elementsAnalyzed?: number;
}

export interface ProcessingStageProps {
  progress: ProgressInfo;
  config: PilotConfig;
  onStop: () => void;
  isProcessing: boolean;
  logs: LogEntry[];
}

export interface CompleteStageProps {
  result: ProcessingResult;
  onRestart: () => void;
  onDownloadCSS: () => void;
  isProcessing: boolean;
}

export interface ReferenceImageManagerProps {
  images: ReferenceImage[];
  onAdd: (file: File) => Promise<void>;
  onRemove: (imageId: string) => void;
  maxImages: number;
  isProcessing: boolean;
}

export interface AdvancedSettingsProps {
  config: PilotConfig;
  onChange: (updates: Partial<PilotConfig>) => void;
  isProcessing: boolean;
}

export interface ProcessingLogProps {
  logs: LogEntry[];
  maxEntries?: number;
  showTimestamps?: boolean;
} 