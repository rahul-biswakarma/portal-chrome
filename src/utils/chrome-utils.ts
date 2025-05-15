import type { ChromeMessage } from '../types'

/**
 * Send a message to a specific tab with safety checks
 * @param tabId The ID of the tab to send the message to
 * @param message The message to send
 * @returns Promise that resolves with the response
 */
export const safeSendMessage = (
  tabId: number,
  message: ChromeMessage,
): Promise<any> => {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          // Handle potential error gracefully
          console.error('Chrome message error:', chrome.runtime.lastError)
          reject(new Error(chrome.runtime.lastError.message))
          return
        }
        resolve(response)
      })
    } catch (error) {
      console.error('Error sending message:', error)
      reject(error)
    }
  })
}

/**
 * Get the active tab
 * @returns Promise that resolves with the active tab
 */
export const getActiveTab = async (): Promise<chrome.tabs.Tab> => {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }

      if (!tabs || tabs.length === 0) {
        reject(new Error('No active tab found'))
        return
      }

      resolve(tabs[0])
    })
  })
}
