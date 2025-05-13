/**
 * CSS version management module
 */
import { saveToStorage, getFromStorage } from '../utils/storage.js';
import { safeSendMessage } from '../utils/messaging.js';
import { showStatus } from './ui.js';

// Store CSS versions
let cssVersions = [];

/**
 * Initialize versions from storage
 * @returns {Promise} - Promise resolving when versions are loaded
 */
export async function initVersions() {
  try {
    const result = await getFromStorage('cssVersions');
    cssVersions = result.cssVersions || [];
    return cssVersions;
  } catch (error) {
    console.error('Error loading CSS versions:', error);
    return [];
  }
}

/**
 * Save a CSS version
 * @param {string} css - The CSS content to save
 * @param {string} description - Optional description
 * @returns {object} - The saved version object
 */
export async function saveCSSVersion(css, description = '') {
  const timestamp = Date.now();
  const id = `version_${timestamp}`;

  // Create new version object
  const version = {
    id,
    timestamp,
    description: description || `Version ${cssVersions.length + 1}`,
    css
  };

  // Add to versions array
  cssVersions.push(version);

  // Save to chrome.storage.local
  try {
    await saveToStorage({cssVersions});
    console.log('CSS version saved', version);
    return version;
  } catch (error) {
    console.error('Error saving CSS version:', error);
    throw error;
  }
}

/**
 * Delete a CSS version
 * @param {string} versionId - ID of the version to delete
 * @returns {Promise} - Promise resolving when deletion is complete
 */
export async function deleteCSSVersion(versionId) {
  cssVersions = cssVersions.filter(v => v.id !== versionId);

  // Save updated versions to storage
  try {
    await saveToStorage({cssVersions});
    console.log('CSS version deleted', versionId);
    return true;
  } catch (error) {
    console.error('Error deleting CSS version:', error);
    throw error;
  }
}

/**
 * Apply a version to the editor and page
 * @param {string} versionId - ID of the version to apply
 * @param {object} editor - Monaco editor instance
 */
export async function applyVersion(versionId, editor) {
  try {
    const result = await getFromStorage('cssVersions');
    const versions = result.cssVersions || [];
    const version = versions.find(v => v.id === versionId);

    if (!version) return;

    // Set the CSS in Monaco editor
    if (editor) {
      editor.setValue(version.css);
    }

    // Also apply the CSS to the page
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      safeSendMessage(tabs[0].id, {
        action: 'applyCSS',
        css: version.css
      }, (response) => {
        if (!response || !response.success) {
          showStatus('Failed to apply CSS version. Please try again.', 'error');
          return;
        }
        showStatus('CSS version applied successfully!', 'success');
      });
    });
  } catch (error) {
    console.error('Error applying CSS version:', error);
    showStatus('Error applying CSS version: ' + error.message, 'error');
  }
}
