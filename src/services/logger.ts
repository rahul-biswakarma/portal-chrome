import { create } from 'zustand';

export type LogLevel = 'info' | 'success' | 'warning' | 'error';

export interface LogEntry {
  id: string;
  message: string;
  level: LogLevel;
  timestamp: Date;
}

interface LoggerState {
  logs: LogEntry[];
  currentLog: LogEntry | null;
  addLog: (message: string, level?: LogLevel) => LogEntry;
  clearLogs: () => void;
}

export const useLogger = create<LoggerState>((set) => ({
  logs: [],
  currentLog: null,
  addLog: (message: string, level: LogLevel = 'info') => {
    const entry: LogEntry = {
      id: Date.now().toString(),
      message,
      level,
      timestamp: new Date(),
    };

    set((state: LoggerState) => ({
      logs: [...state.logs, entry],
      currentLog: entry,
    }));

    return entry;
  },
  clearLogs: () => set({ logs: [], currentLog: null }),
}));

// Predefined log messages for consistent messaging
export const LogMessages = {
  // Image processing
  SCREENSHOT_TAKING: 'Taking screenshot of current page...',
  SCREENSHOT_COMPLETE: 'Screenshot captured successfully',
  SCREENSHOT_TAKING_FULLPAGE: 'Taking full page screenshot...',
  SCREENSHOT_TAKING_VIEWPORT: 'Taking viewport screenshot...',
  SCREENSHOT_TAKING_ELEMENT: (selector: string) =>
    `Taking screenshot of element: ${selector}`,
  SCREENSHOT_SUCCESS: (type: string, timeMs: number, sizeKB: number) =>
    `${type} screenshot captured in ${timeMs}ms (${sizeKB}KB)`,
  SCREENSHOT_ERROR: (type: string, timeMs: number, error: string) =>
    `${type} screenshot failed after ${timeMs}ms: ${error}`,
  SCREENSHOT_SAVE_START: (filename: string) =>
    `Saving screenshot as: ${filename}`,
  SCREENSHOT_SAVE_SUCCESS: (filename: string, timeMs: number) =>
    `Screenshot saved successfully in ${timeMs}ms: ${filename}`,

  // API interactions
  API_GENERATING_PROMPT: 'Generating prompt for CSS...',
  API_PROMPT_COMPLETE: 'Prompt generated successfully',
  API_GENERATING_CSS: 'Generating CSS based on reference image...',
  API_CSS_COMPLETE: 'CSS generation complete',

  // CSS operations
  CSS_APPLYING: 'Applying generated CSS to page...',
  CSS_APPLIED: 'CSS applied to page',

  // Feedback loop
  FEEDBACK_EVALUATING: 'Evaluating CSS results...',
  FEEDBACK_ITERATION: (iteration: number, max: number) =>
    `CSS iteration ${iteration}/${max}: Refining styles...`,
  FEEDBACK_SUCCESS: 'CSS successfully matches reference design!',
  FEEDBACK_MAX_ITERATIONS: 'Maximum iterations reached with partial match',

  // Errors
  ERROR_API_KEY: 'OpenAI API key missing or invalid',
  ERROR_SCREENSHOT: 'Error capturing screenshot',
  ERROR_CSS_GENERATION: 'Error generating CSS',
  ERROR_CSS_APPLICATION: 'Error applying CSS',
  ERROR_GENERAL: 'An error occurred during processing',
};

// Screenshot logging utilities
export const ScreenshotLogger = {
  logStart: (type: 'full-page' | 'viewport' | 'element', context?: string) => {
    const contextStr = context ? ` (${context})` : '';
    console.log(`[SCREENSHOT] Starting ${type} capture${contextStr}...`);
  },

  logSuccess: (
    type: 'full-page' | 'viewport' | 'element',
    timeMs: number,
    sizeKB: number,
    context?: string,
  ) => {
    const contextStr = context ? ` (${context})` : '';
    console.log(
      `[SCREENSHOT] ${type} capture completed${contextStr} in ${timeMs}ms, size: ${sizeKB}KB`,
    );
  },

  logError: (
    type: 'full-page' | 'viewport' | 'element',
    timeMs: number,
    error: Error | string,
    context?: string,
  ) => {
    const contextStr = context ? ` (${context})` : '';
    const errorMsg = error instanceof Error ? error.message : error;
    console.error(
      `[SCREENSHOT] ${type} capture failed${contextStr} after ${timeMs}ms: ${errorMsg}`,
    );
  },

  logSaveStart: (filename: string) => {
    console.log(`[SCREENSHOT] Starting save process: ${filename}`);
  },

  logSaveSuccess: (filename: string, timeMs: number) => {
    console.log(`[SCREENSHOT] Save completed in ${timeMs}ms: ${filename}`);
  },

  logSaveError: (filename: string, timeMs: number, error: Error | string) => {
    const errorMsg = error instanceof Error ? error.message : error;
    console.error(
      `[SCREENSHOT] Save failed after ${timeMs}ms (${filename}): ${errorMsg}`,
    );
  },

  // Summary logging for multiple screenshots
  logSessionSummary: (
    totalScreenshots: number,
    totalTimeMs: number,
    totalSizeKB: number,
  ) => {
    console.log(
      `[SCREENSHOT-SUMMARY] Session complete: ${totalScreenshots} screenshots, ${totalTimeMs}ms total, ${totalSizeKB}KB total size`,
    );
  },
};
