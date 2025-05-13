/**
 * Utility functions for Chrome storage operations
 */

/**
 * Save data to Chrome local storage
 * @param {object} data - Key-value pairs to save
 * @returns {Promise} - Promise resolving when storage is complete
 */
export function saveToStorage(data) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Get data from Chrome local storage
 * @param {string|array} keys - Key or array of keys to retrieve
 * @returns {Promise} - Promise resolving to the retrieved data
 */
export function getFromStorage(keys) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}
