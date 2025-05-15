/**
 * CSS version management module
 */
import { saveToStorage, getFromStorage } from '../utils/storage.js';
import { safeSendMessage } from '../utils/chrome-utils.js';
import { showStatus } from '../components/status-bar.js';

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
    updateVersionsTab();
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
    updateVersionsTab();
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
    } else if (window.cssEditor) {
      window.cssEditor.setValue(version.css);
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

/**
 * Preview a version
 * @param {string} versionId - The ID of the version to preview
 */
export function previewVersion(versionId) {
  chrome.storage.local.get('cssVersions', (result) => {
    const versions = result.cssVersions || [];
    const version = versions.find(v => v.id === versionId);

    if (!version) return;

    // Create a modal to show the CSS
    const modal = document.createElement('div');
    modal.className = 'css-preview-modal';

    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';

    const modalHeader = document.createElement('div');
    modalHeader.className = 'modal-header';
    modalHeader.innerHTML = `
      <span>${version.description || 'CSS Version'} - ${new Date(version.timestamp).toLocaleString()}</span>
      <span class="close-btn">&times;</span>
    `;

    const cssContent = document.createElement('div');
    cssContent.className = 'css-content';
    cssContent.textContent = version.css;

    const applyBtn = document.createElement('button');
    applyBtn.className = 'apply-preview-btn';
    applyBtn.textContent = 'Apply this CSS';
    applyBtn.addEventListener('click', () => {
      applyVersion(version.id);
      modal.remove();
    });

    modalContent.appendChild(modalHeader);
    modalContent.appendChild(cssContent);
    modalContent.appendChild(applyBtn);
    modal.appendChild(modalContent);

    document.body.appendChild(modal);

    // Close modal when clicking the close button
    modalContent.querySelector('.close-btn').addEventListener('click', () => {
      modal.remove();
    });

    // Close modal when clicking outside the content
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  });
}

/**
 * Update the versions tab with all saved versions
 */
export function updateVersionsTab() {
  const versionsContainer = document.getElementById('versions-container');
  if (!versionsContainer) return;

  // Clear current content
  versionsContainer.innerHTML = '';

  if (cssVersions.length === 0) {
    versionsContainer.innerHTML = '<div class="no-versions">No saved versions yet. Generate CSS to create a version.</div>';
    return;
  }

  // Sort versions by timestamp (newest first)
  const sortedVersions = [...cssVersions].sort((a, b) => b.timestamp - a.timestamp);

  // Create version cards
  sortedVersions.forEach(version => {
    const versionCard = document.createElement('div');
    versionCard.className = 'version-card';
    versionCard.dataset.versionId = version.id;

    const header = document.createElement('div');
    header.className = 'version-header';

    const title = document.createElement('div');
    title.className = 'version-title';
    title.textContent = version.description;

    const date = document.createElement('div');
    date.className = 'version-date';
    // Format the timestamp (which is a number) to a date string
    date.textContent = new Date(version.timestamp).toLocaleString();

    header.appendChild(title);
    header.appendChild(date);

    const actions = document.createElement('div');
    actions.className = 'version-actions';

    const previewBtn = document.createElement('button');
    previewBtn.className = 'version-btn preview-btn';
    previewBtn.textContent = 'Preview';
    previewBtn.addEventListener('click', () => previewVersion(version.id));

    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'version-btn apply-btn';
    restoreBtn.textContent = 'Restore';
    restoreBtn.addEventListener('click', () => applyVersion(version.id));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'version-btn delete-btn';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to delete this version?')) {
        deleteCSSVersion(version.id);
      }
    });

    actions.appendChild(previewBtn);
    actions.appendChild(restoreBtn);
    actions.appendChild(deleteBtn);

    versionCard.appendChild(header);
    versionCard.appendChild(actions);

    // Add a small preview of the CSS
    const cssPreview = document.createElement('div');
    cssPreview.className = 'css-preview';
    // Show first 100 characters of the CSS
    const cleanedPreview = version.css.substring(0, 100) + (version.css.length > 100 ? '...' : '');
    cssPreview.textContent = cleanedPreview;
    versionCard.appendChild(cssPreview);

    versionsContainer.appendChild(versionCard);
  });
}
