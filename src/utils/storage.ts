/**
 * Utility functions for Chrome storage operations
 */

/**
 * Get a value from Chrome storage
 * @param key The key to get from storage
 * @param defaultValue Optional default value to return if key is not found
 * @returns Promise resolving to the value or default value
 */
export async function getFromStorage<T>(
  key: string,
  defaultValue: T = null as unknown as T,
): Promise<T> {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      resolve(result[key] !== undefined ? result[key] : defaultValue);
    });
  });
}

/**
 * Save a value to Chrome storage
 * @param key The key to save under
 * @param value The value to save
 * @returns Promise resolving when the operation is complete
 */
export async function saveToStorage<T>(key: string, value: T): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => {
      resolve();
    });
  });
}

/**
 * Remove a value from Chrome storage
 * @param key The key to remove
 * @returns Promise resolving when the operation is complete
 */
export async function removeFromStorage(key: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(key, () => {
      resolve();
    });
  });
}
