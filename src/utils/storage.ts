/**
 * Save a value to chrome storage
 * @param key The key to save the value under
 * @param value The value to save
 * @returns Promise that resolves when the save is complete
 */
export const saveToStorage = <T>(key: string, value: T): Promise<void> => {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ [key]: value }, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError)
        return
      }
      resolve()
    })
  })
}

/**
 * Get a value from chrome storage
 * @param key The key to get the value for
 * @param defaultValue The default value to return if the key doesn't exist
 * @returns Promise that resolves with the value
 */
export const getFromStorage = <T>(key: string, defaultValue: T): Promise<T> => {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(key, (items) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError)
        return
      }

      if (items[key] === undefined) {
        resolve(defaultValue)
        return
      }

      resolve(items[key] as T)
    })
  })
}

/**
 * Remove a value from chrome storage
 * @param key The key to remove
 * @returns Promise that resolves when the removal is complete
 */
export const removeFromStorage = (key: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.remove(key, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError)
        return
      }
      resolve()
    })
  })
}
