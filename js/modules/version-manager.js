// Version history functionality
import { cleanText } from '../utils/ui-utils.js';
import { showStatus } from '../utils/ui-utils.js';

// Store CSS versions
let cssVersions = [];

/**
 * Initialize the version manager
 */
export function initVersionManager() {
  // Load saved versions from storage
  chrome.storage.local.get('cssVersions', (result) => {
    if (result.cssVersions) {
      cssVersions = result.cssVersions;
      updateVersionsTab();
    }
  });
}

/**
 * Save a CSS version
 * @param {string} css - The CSS to save
 * @param {string} description - Optional description
 * @returns {object} - The saved version object
 */
export function saveCSSVersion(css, description = '') {
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
  chrome.storage.local.set({cssVersions}, () => {
    console.log('CSS version saved', version);
    // Update versions tab
    updateVersionsTab();
  });

  return version;
}

/**
 * Delete a CSS version
 * @param {string} versionId - The ID of the version to delete
 */
export function deleteCSSVersion(versionId) {
  cssVersions = cssVersions.filter(v => v.id !== versionId);

  // Save updated versions to storage
  chrome.storage.local.set({cssVersions}, () => {
    console.log('CSS version deleted', versionId);
    // Update versions tab
    updateVersionsTab();
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
    // Show first 100 characters of the CSS - clean first to remove any weird characters
    const cleanedPreview = cleanText(version.css);
    cssPreview.textContent = cleanedPreview.substring(0, 100) + (cleanedPreview.length > 100 ? '...' : '');
    versionCard.appendChild(cssPreview);

    versionsContainer.appendChild(versionCard);
  });
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
      applyVersion(versionId);
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
 * Apply a version to the editor
 * @param {string} versionId - The ID of the version to apply
 */
export function applyVersion(versionId) {
  chrome.storage.local.get('cssVersions', (result) => {
    const versions = result.cssVersions || [];
    const version = versions.find(v => v.id === versionId);

    if (!version) return;

    // Set the CSS in Monaco editor
    if (window.cssEditor) {
      window.cssEditor.setValue(version.css);
    }

    // Also apply the CSS to the page
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'applyCSS',
        css: version.css
      }, (response) => {
        if (chrome.runtime.lastError || !response || !response.success) {
          showStatus('Failed to apply CSS version. Please try again.', 'error');
          return;
        }
        showStatus('CSS version applied successfully!', 'success');
      });
    });
  });
}
