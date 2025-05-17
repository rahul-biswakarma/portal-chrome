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
