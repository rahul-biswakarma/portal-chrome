/**
 * Utility functions for Chrome extension API operations
 */

/**
 * Get the currently active tab
 * @returns Promise resolving to the active tab
 */
export function getActiveTab(): Promise<chrome.tabs.Tab> {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        return reject(
          new Error(
            `Error getting active tab: ${chrome.runtime.lastError.message}`,
          ),
        );
      }

      if (!tabs || tabs.length === 0) {
        return reject(new Error('No active tab found'));
      }

      resolve(tabs[0]);
    });
  });
}

/**
 * Safely send a message to a tab with error handling
 * @param tabId The ID of the tab to send the message to
 * @param message The message to send
 * @returns Promise resolving to the response
 */
export function safeSendMessage<T = unknown>(
  tabId: number,
  message: Record<string, unknown>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          return reject(
            new Error(
              `Error sending message: ${chrome.runtime.lastError.message}`,
            ),
          );
        }
        resolve(response as T);
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Execute a script in a specific tab
 * @param tabId The ID of the tab to execute the script in
 * @param func The function to execute
 * @returns Promise resolving to the result of the script execution
 */
export function executeScript<T = unknown>(
  tabId: number,
  func: () => T,
): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        func,
      },
      (results) => {
        if (chrome.runtime.lastError) {
          return reject(
            new Error(
              `Error executing script: ${chrome.runtime.lastError.message}`,
            ),
          );
        }

        if (!results || results.length === 0) {
          return reject(new Error('Script execution failed'));
        }

        resolve(results[0].result as T);
      },
    );
  });
}
