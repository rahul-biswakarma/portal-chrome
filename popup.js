// Import required modules
import { showStatus, setUIProcessingState } from './js/modules/ui.js';
import { saveCSSVersion, deleteCSSVersion, applyVersion, previewVersion, updateVersionsTab } from './js/modules/versions.js';
import { simplifyTree } from './js/modules/tree.js';
import {
  analyzeReferenceImage,
  generateCSSWithAI,
  analyzeCSSAndGetFeedback,
  isValidImageData
} from './js/modules/api.js';

// Function to create a text representation of the tree node
function createTreeNode(node, level = 0, isLast = true) {
  let text = '';

  // Create the indentation with vertical lines for hierarchy
  if (level > 0) {
    for (let i = 0; i < level - 1; i++) {
      text += '\u2502  ';
    }
    text += isLast ? '\u2514\u2500 ' : '\u251C\u2500 ';
  }

  // Add element tag and portal classes
  text += node.element;
  if (node.portalClasses.length > 0) {
    text += ' [' + node.portalClasses.join(', ') + ']';
  }
  text += '\n';

  // Add child nodes
  const childCount = node.children.length;
  node.children.forEach((child, index) => {
    text += createTreeNode(child, level + 1, index === childCount - 1);
  });

  return text;
}

// Global variables
let portalClassTree = null;
let tailwindClassData = {};
let allPortalClasses = [];
// Store CSS versions
let cssVersions = [];

// Function to clean text of problematic characters
function cleanText(text) {
  if (!text) return '';
  return text;
}

// Function to extract all portal classes from the tree
function extractPortalClasses(node) {
  let classes = [...node.portalClasses];
  node.children.forEach(child => {
    classes = classes.concat(extractPortalClasses(child));
  });
  return classes;
}

// Moved to versions.js module

// Moved to versions.js module

// Moved to versions.js module

// Add safe messaging function to handle extension context errors
function safeSendMessage(tabId, message, callback, timeout = 30000) {
  return new Promise((resolve) => {
    let timeoutId = null;
    let hasResponded = false;

    // Create a wrapper for the callback that ensures we only call it once
    const safeCallback = (response) => {
      if (hasResponded) return;
      hasResponded = true;

      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (callback) callback(response);
      resolve(response);
    };

    try {
      // Verify Chrome APIs are available
      if (!chrome || !chrome.tabs || !chrome.runtime) {
        console.error('Chrome APIs not available');
        safeCallback({ success: false, error: 'Chrome APIs not available' });
        return;
      }

      // Set timeout to handle cases where a response might never come
      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          console.warn('Message timed out after', timeout, 'ms');
          safeCallback({ success: false, error: 'Message sending timed out' });
        }, timeout);
      }

      // Try to send the message, with error handling
      chrome.tabs.sendMessage(tabId, message, (response) => {
        // Check for runtime errors (like extension context invalidated)
        if (chrome.runtime.lastError) {
          console.warn('Chrome runtime error:', chrome.runtime.lastError.message);

          // Special handling for common errors
          if (chrome.runtime.lastError.message.includes('Extension context invalidated')) {
            console.warn('Extension context was invalidated. Attempting recovery...');

            // Show a user-friendly error and advice
            showStatus('Connection to page was lost. Try refreshing the page.', 'error');

            // Attempt to recover basic functionality
            safeCallback({
              success: false,
              error: 'Extension context invalidated',
              recoverable: false
            });
            return;
          }

          // Handle other errors
          safeCallback({
            success: false,
            error: chrome.runtime.lastError.message,
            recoverable: true
          });
          return;
        }

        // Handle empty or undefined response
        if (!response) {
          console.warn('Empty response from content script');
          safeCallback({ success: false, error: 'No response from page' });
          return;
        }

        // Success - return the response
        safeCallback(response);
      });
    } catch (error) {
      console.error('Error sending message:', error);
      safeCallback({ success: false, error: error.message });
    }
  });
}

// Function to generate CSS with Gemini directly from DOM structure and tailwind classes
async function generateCSSDirectly(apiKey, prompt, portalClassTree, tailwindData, currentCSS = "", retryCount = 0) {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 2000; // 2 seconds
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

  // Create a simplified version of the tree for the LLM
  const simplifiedTree = simplifyTree(portalClassTree);

  // Attempt to get a screenshot of the current page
  let screenshot = null;

  // Try to capture the screenshot using the content script
  try {
    const tabResponse = await new Promise((resolve, reject) => {
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (!tabs || !tabs[0]) {
          reject(new Error('No active tab found'));
          return;
        }

        // Use our safe messaging function with a timeout
        let messageTimeout = setTimeout(() => {
          reject(new Error('Screenshot capture timed out'));
        }, 10000); // 10 seconds timeout for full page capture

        safeSendMessage(tabs[0].id, {action: 'captureScreenshot'}, (response) => {
          clearTimeout(messageTimeout);
          if (!response || !response.success) {
            const errorMsg = response && response.error ? response.error : 'Unknown error';
            reject(new Error(errorMsg));
            return;
          }
          resolve(response);
        });
      });
    });

    if (tabResponse && tabResponse.success && tabResponse.data) {
      screenshot = tabResponse.data;
      showStatus('Screenshot captured successfully!', 'success');
    }
  } catch (error) {
    console.warn('Could not capture screenshot:', error);
    showStatus('Could not capture full page with styling. Using simplified data.', 'info');
  }

  // Show a new status before uploading
  if (screenshot) {
    showStatus('Preparing screenshot for AI analysis...', 'info');
  }

  // Prepare for file upload if we have a screenshot
  let fileUri = null;
  if (screenshot) {
    try {
      // Convert base64 to blob
      const base64Data = screenshot.split(',')[1];
      const byteCharacters = atob(base64Data);
      const byteArrays = [];

      for (let offset = 0; offset < byteCharacters.length; offset += 512) {
        const slice = byteCharacters.slice(offset, offset + 512);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
          byteNumbers[i] = slice.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        byteArrays.push(byteArray);
      }

      const blob = new Blob(byteArrays, {type: 'image/png'});

      // Get upload URL
      const uploadUrlResponse = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Length': blob.size.toString(),
          'X-Goog-Upload-Header-Content-Type': 'image/png',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          file: {
            display_name: 'SCREENSHOT'
          }
        })
      });

      // Extract upload URL from headers
      const uploadUrl = uploadUrlResponse.headers.get('X-Goog-Upload-URL');

      if (!uploadUrl) {
        throw new Error('Failed to get upload URL');
      }

      // Upload the file
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Length': blob.size.toString(),
          'X-Goog-Upload-Offset': '0',
          'X-Goog-Upload-Command': 'upload, finalize'
        },
        body: blob
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload screenshot');
      }

      const fileInfo = await uploadResponse.json();
      fileUri = fileInfo.file.uri;
    } catch (error) {
      console.error('Error uploading screenshot:', error);
      showStatus('Error uploading screenshot. Proceeding without visual context.', 'info');
    }
  }

  // Show a status before generating CSS
  showStatus('Generating CSS based on your request...', 'info');

  // Simplify the tailwind data to only show essential information
  const simplifiedTailwindData = {};
  if (tailwindData) {
    Object.keys(tailwindData).forEach(selector => {
      if (/^portal-.*$/.test(selector)) {
        simplifiedTailwindData[selector] = tailwindData[selector];
      }
    });
  }

  // Prepare the payload with reduced size if needed for retry
  const payload = {
    contents: [
      {
        parts: [
          // Add the screenshot if we have a file URI (only for first attempt)
          ...(fileUri && retryCount === 0 ? [{
            file_data: {
              mime_type: "image/png",
              file_uri: fileUri
            }
          }] : []),

          // Add all reference images if available (only for first attempt)
          ...(window.referenceImages.length > 0 && retryCount === 0 ?
            window.referenceImages.map(img => ({
              inline_data: {
                mime_type: img.data.split(';')[0].split(':')[1],
                data: img.data.split(',')[1]
              }
            })) : []),

          {
            text: `You are a CSS expert specializing in creating styles for web applications.

${window.referenceImages.length > 0 ? `IMPORTANT: I've provided ${window.referenceImages.length} reference image${window.referenceImages.length > 1 ? 's' : ''} showing the desired design style. Please use ${window.referenceImages.length > 1 ? 'these' : 'this'} as inspiration when creating the CSS. Try to match the color scheme, styling patterns, and overall aesthetic of the reference image${window.referenceImages.length > 1 ? 's' : ''}.` : ""}

USER PROMPT: "${prompt}"

DOM STRUCTURE (focusing on classes matching pattern ^portal-.*$):
${retryCount === 0 ? JSON.stringify(simplifiedTree, null, 2) : JSON.stringify(simplifiedTree)}

CURRENT CSS FILE:
${currentCSS}

Your task:
1. Generate or modify the CSS code that fulfills the user's design request
2. ONLY use selectors that target classes matching the pattern ^portal-.*$ (classes that start with "portal-")
3. Do not use element selectors, IDs, or non-portal- classes
4. The final output should be a COMPLETE CSS file that includes all existing styles with your modifications
5. If adding new styles, place them in logical sections within the existing CSS structure
6. If modifying existing styles, update them in-place
7. Include !important where necessary to override tailwind styles
8. Include comprehensive comments explaining your styling approach

Format your response as a CSS code block only, without any additional text.
Start with a comment block explaining the overall approach.`
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2048
    }
  };

  try {
    const response = await fetch(`${url}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      const errorMessage = errorData.error?.message || response.statusText || 'Unknown error';

      // Check for "model is overloaded" error and retry
      if ((errorMessage.includes('overloaded') || errorMessage.includes('rate limit')) && retryCount < MAX_RETRIES) {
        showStatus(`API busy (attempt ${retryCount + 1}/${MAX_RETRIES + 1}). Retrying in ${RETRY_DELAY/1000} seconds...`, 'info');

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));

        // Retry with simplified payload
        return generateCSSDirectly(apiKey, prompt, portalClassTree, tailwindData, currentCSS, retryCount + 1);
      }

      throw new Error(`API Error: ${errorMessage}`);
    }

    const data = await response.json();
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts) {
      throw new Error('Invalid response format from API');
    }

    const cssText = data.candidates[0].content.parts[0].text;

    // Extract the CSS part from the response
    const cssMatch = cssText.match(/```css\n([\s\S]*?)\n```/) ||
                     cssText.match(/```\n([\s\S]*?)\n```/) ||
                     { 1: cssText }; // If no code block, use the entire text

    // Just return the CSS without formatting
    return cssMatch[1] || cssMatch[0];
  } catch (error) {
    console.error('Error generating CSS:', error);

    // If we failed because of token length, retry with a simpler request
    if (error.message.includes('token') && retryCount < MAX_RETRIES) {
      showStatus(`CSS generation failed due to length limits. Simplifying request (attempt ${retryCount + 1}/${MAX_RETRIES + 1})...`, 'info');

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));

      // Retry with simplified payload
      return generateCSSDirectly(apiKey, prompt, portalClassTree, tailwindData, currentCSS, retryCount + 1);
    }

    throw error;
  }
}

// Function to collect tailwind classes for each portal element
async function collectTailwindClasses() {
  try {
    const tabs = await new Promise((resolve, reject) => {
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (!tabs || !tabs.length === 0) {
          reject(new Error('No active tab found'));
          return;
        }
        resolve(tabs);
      });
    });

    const response = await safeSendMessage(tabs[0].id, {action: 'getTailwindClasses'});

    if (!response || !response.success) {
      throw new Error('Failed to collect tailwind classes');
    }

    return response.data;
  } catch (error) {
    console.error('Error collecting tailwind classes:', error);
    // Return empty object as fallback
    return {};
  }
}

// Function to get current CSS from the page
async function getCurrentCSS() {
  try {
    const tabs = await new Promise((resolve, reject) => {
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (!tabs || !tabs.length === 0) {
          reject(new Error('No active tab found'));
          return;
        }
        resolve(tabs);
      });
    });

    const response = await safeSendMessage(tabs[0].id, {action: 'getCurrentCSS'});

    if (!response || !response.success) {
      throw new Error('Failed to get current CSS');
    }

    return response.data || "";
  } catch (error) {
    console.error('Error getting current CSS:', error);
    return "";
  }
}

// Function to handle when a portal element is hovered on the page
function handlePortalElementHover(portalClasses) {
  // Highlight the corresponding tree nodes
  highlightTreeNodes(portalClasses);
}

// Function to handle when mouse leaves a portal element on the page
function handlePortalElementLeave() {
  // Remove highlights
  removeTreeHighlights();
}

// Function to highlight tree nodes with specific classes
function highlightTreeNodes(classes) {
  // Remove any existing highlights first
  removeTreeHighlights();

  // Find all tree node spans with these classes
  classes.forEach(className => {
    // Try both camelCase and lowercase data attribute selectors for compatibility
    const treeNodeSpans = document.querySelectorAll(
      `.tree-portal-class[data-class-name="${className}"], .tree-portal-class[data-classname="${className}"]`
    );

    treeNodeSpans.forEach(span => {
      // Highlight the entire line containing this span
      let currentNode = span;
      while (currentNode && !currentNode.classList.contains('tree-line')) {
        currentNode = currentNode.parentElement;
      }

      if (currentNode) {
        currentNode.classList.add('tree-line-highlighted');
        // Scroll the node into view if it's not visible
        currentNode.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }

      // Also highlight the class name itself for better visibility
      span.style.backgroundColor = 'rgba(66, 133, 244, 0.25)';
      span.style.fontWeight = 'bold';
    });
  });
}

// Function to remove highlights from tree nodes
function removeTreeHighlights() {
  const highlightedNodes = document.querySelectorAll('.tree-line-highlighted');
  highlightedNodes.forEach(node => {
    node.classList.remove('tree-line-highlighted');
  });
}

// Function to create an HTML representation of the tree node with connecting lines
function createTreeNodeHTML(node, level = 0, isLast = true, parentLineIndices = []) {
  const container = document.createElement('div');
  container.className = 'tree-line';

  // Create the line content
  const content = document.createElement('div');
  content.className = 'tree-line-content';

  // Create indentation with Unicode characters for better visibility
  if (level > 0) {
    // Add connecting lines for previous levels
    for (let i = 0; i < level - 1; i++) {
      const lineSpan = document.createElement('span');
      lineSpan.textContent = parentLineIndices.includes(i) ? '\u2502 ' : '  ';
      lineSpan.style.color = '#888';
      content.appendChild(lineSpan);
    }

    // Add the current level connector
    const connectorSpan = document.createElement('span');
    connectorSpan.textContent = isLast ? '\u2514\u2500' : '\u251C\u2500';
    connectorSpan.style.color = '#888';
    content.appendChild(connectorSpan);
  }

  // Add element tag
  const elementTag = document.createElement('span');
  elementTag.className = 'tree-element';
  elementTag.textContent = node.element;
  elementTag.style.cursor = 'pointer';

  // Make the element tag clickable to scroll into view
  if (node.portalClasses.length > 0) {
    elementTag.addEventListener('click', () => {
      scrollElementIntoView(node.portalClasses[0]);
    });
  }

  content.appendChild(elementTag);

  // Add portal classes with color highlighting
  if (node.portalClasses.length > 0) {
    const classesContainer = document.createElement('span');
    classesContainer.textContent = ' [';
    content.appendChild(classesContainer);

    node.portalClasses.forEach((className, index) => {
      const classSpan = document.createElement('span');
      classSpan.className = 'tree-portal-class';
      classSpan.textContent = className;
      classSpan.dataset.className = className;
      classSpan.dataset.classname = className; // Also add the lowercase version for querySelector compatibility

      // Generate a consistent color based on the class name
      const hue = Math.abs(className.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360);
      classSpan.style.color = `hsl(${hue}, 70%, 45%)`;
      classSpan.style.fontWeight = 'bold';

      // Add hover event to highlight elements with this class
      classSpan.addEventListener('mouseover', () => {
        highlightElementsWithClass(className);
      });

      classSpan.addEventListener('mouseout', () => {
        removeHighlight();
      });

      // Add click event to scroll element into view
      classSpan.addEventListener('click', () => {
        scrollElementIntoView(className);
      });

      content.appendChild(classSpan);

      // Add comma if not the last class
      if (index < node.portalClasses.length - 1) {
        const comma = document.createElement('span');
        comma.textContent = ', ';
        content.appendChild(comma);
      }
    });

    const closingBracket = document.createElement('span');
    closingBracket.textContent = ']';
    content.appendChild(closingBracket);
  }

  // Remove tailwind classes display entirely

  container.appendChild(content);

  // Calculate which levels need connecting lines for children
  const newParentLineIndices = [...parentLineIndices];
  if (level > 0 && !isLast) {
    newParentLineIndices.push(level - 1);
  }

  // Add child nodes
  if (node.children.length > 0) {
    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'tree-children';

    node.children.forEach((child, index) => {
      const isLastChild = index === node.children.length - 1;
      const childNode = createTreeNodeHTML(child, level + 1, isLastChild, newParentLineIndices);
      childrenContainer.appendChild(childNode);
    });

    container.appendChild(childrenContainer);
  }

  return container;
}

// Function to send message to content script to scroll element into view
function scrollElementIntoView(className) {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (!tabs || !tabs[0]) {
      console.error('No active tab found');
      return;
    }

    safeSendMessage(tabs[0].id, {
      action: 'scrollElementIntoView',
      className: className
    }, (response) => {
      if (!response || !response.success) {
        console.warn('Failed to scroll element into view:', response?.error || 'unknown error');
      }
    });
  });
}

// Function to send message to content script to highlight elements with a class
function highlightElementsWithClass(className) {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (!tabs || !tabs[0]) {
      console.error('No active tab found');
      return;
    }

    safeSendMessage(tabs[0].id, {
      action: 'highlightElements',
      className: className
    }, (response) => {
      if (!response || !response.success) {
        console.warn('Failed to highlight elements:', response?.error || 'unknown error');
      }
    });
  });
}

// Function to send message to content script to remove highlights
function removeHighlight() {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (!tabs || !tabs[0]) {
      console.error('No active tab found');
      return;
    }

    safeSendMessage(tabs[0].id, {
      action: 'removeHighlight'
    }, (response) => {
      if (!response || !response.success) {
        console.warn('Failed to remove highlights:', response?.error || 'unknown error');
      }
    });
  });
}

// Function to load tree data
async function loadTreeData() {
  // Clear the tree container
  const treeContainer = document.getElementById('tree-container');
  treeContainer.innerHTML = '<div style="text-align: center; padding: 20px;">Loading class hierarchy...</div>';

  try {
    // Get active tab
    const tabs = await new Promise((resolve, reject) => {
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (!tabs || !tabs[0]) {
          reject(new Error('Unable to access the current tab.'));
          return;
        }
        resolve(tabs);
      });
    });

    // Get portal class tree with timeout handling
    const response = await safeSendMessage(tabs[0].id, {action: 'getPortalClassTree'}, null, 15000);

    if (!response || !response.success) {
      throw new Error(response?.error || 'Failed to get portal class data');
    }

    // Initialize default empty tree if no data received
    if (!response.data) {
      portalClassTree = {
        element: 'body',
        portalClasses: [],
        children: [],
        isPortalPage: false
      };
      treeContainer.innerHTML = '<div style="text-align: center; padding: 20px;">No portal classes found on this page. The extension works best on DevRev portal pages.</div>';
      return;
    }

    portalClassTree = response.data;

    try {
      // Get tailwind classes
      tailwindClassData = await collectTailwindClasses();

      // Attach tailwind classes to the portal class tree
      const attachTailwindClasses = (node) => {
        if (node.portalClasses && node.portalClasses.length > 0) {
          // Find matching tailwind data for this node
          const tailwindClasses = [];
          node.portalClasses.forEach(className => {
            if (tailwindClassData[className]) {
              tailwindClasses.push(...tailwindClassData[className]);
            }
          });
          node.tailwindClasses = [...new Set(tailwindClasses)]; // Remove duplicates
        }

        // Process children
        if (node.children) {
          node.children.forEach(child => attachTailwindClasses(child));
        }
      };

      attachTailwindClasses(portalClassTree);
    } catch (error) {
      console.warn('Error loading tailwind classes:', error);
      // Continue even if tailwind classes fail to load
    }

    // Use the HTML tree renderer
    treeContainer.innerHTML = '';
    const treeHTML = createTreeNodeHTML(portalClassTree);
    treeContainer.appendChild(treeHTML);

    // Extract all portal classes for CSS generation
    allPortalClasses = extractPortalClasses(portalClassTree);
    // Remove duplicates
    allPortalClasses = [...new Set(allPortalClasses)];

    // Show a message if no portal classes found
    if (allPortalClasses.length === 0) {
      treeContainer.innerHTML = '<div style="text-align: center; padding: 20px;">No portal classes found on this page. The extension works best on DevRev portal pages.</div>';
    }
  } catch (error) {
    console.error('Error loading tree data:', error);
    let errorMessage = error.message;

    if (errorMessage.includes('Extension context invalidated')) {
      errorMessage = 'Connection to page was lost. Please refresh the page and try again.';
    } else if (errorMessage.includes('timed out')) {
      errorMessage = 'Loading data timed out. Please refresh the page and try again.';
    }

    treeContainer.innerHTML = `
      <div style="text-align: center; padding: 20px; color: #721c24; background-color: #f8d7da; border-radius: 4px; border: 1px solid #f5c6cb;">
        <p><strong>Error:</strong> ${errorMessage}</p>
        <button id="refresh-tree-button" style="margin-top: 10px; padding: 5px 10px; background-color: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">Refresh Page</button>
      </div>`;

    // Add event listener to the refresh button instead of using inline onclick
    document.getElementById('refresh-tree-button')?.addEventListener('click', () => {
      window.location.reload();
    });
  }
}

// When popup is opened, request portal class tree from content script
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Monaco editor for CSS
  let monacoEditor;

  // Create a global array to store reference images data
  window.referenceImages = [];

  // Wait a moment to ensure DOM is fully loaded
  setTimeout(async () => {
    // Create Monaco editor
    monacoEditor = await initMonacoEditor('monaco-editor-container', '/* CSS will appear here after generation */', 'css');

    // Make monacoEditor available for other functions
    window.cssEditor = monacoEditor;

    // Function to add an image to the preview grid
    function addImageToPreview(imageData) {
      // Store the image data with a unique ID
      const imageId = 'img_' + Date.now();
      window.referenceImages.push({
        id: imageId,
        data: imageData
      });

      // Show the image preview
      const imagePreviewContainer = document.getElementById('image-preview-container');
      const imagesGrid = document.getElementById('images-grid');

      // Create a new image preview container
      const imagePreviewDiv = document.createElement('div');
      imagePreviewDiv.id = imageId;
      imagePreviewDiv.style.position = 'relative';
      imagePreviewDiv.style.display = 'inline-block';

      // Create the image element
      const imgElement = document.createElement('img');
      imgElement.src = imageData;
      imgElement.style.maxWidth = '150px';
      imgElement.style.maxHeight = '150px';
      imgElement.style.border = '1px solid #ccc';
      imgElement.style.borderRadius = '4px';

      // Create remove button
      const removeBtn = document.createElement('button');
      removeBtn.textContent = '✕';
      removeBtn.style.position = 'absolute';
      removeBtn.style.top = '5px';
      removeBtn.style.right = '5px';
      removeBtn.style.background = 'rgba(255,255,255,0.7)';
      removeBtn.style.border = 'none';
      removeBtn.style.borderRadius = '50%';
      removeBtn.style.width = '24px';
      removeBtn.style.height = '24px';
      removeBtn.style.fontSize = '12px';
      removeBtn.style.cursor = 'pointer';

      // Add remove button event listener
      removeBtn.addEventListener('click', () => {
        // Remove from array
        window.referenceImages = window.referenceImages.filter(img => img.id !== imageId);

        // Remove from DOM
        imagePreviewDiv.remove();

        // Hide container if no images left
        if (window.referenceImages.length === 0) {
          imagePreviewContainer.style.display = 'none';
        }

        showStatus('Image removed', 'info');
      });

      // Add elements to the DOM
      imagePreviewDiv.appendChild(imgElement);
      imagePreviewDiv.appendChild(removeBtn);
      imagesGrid.appendChild(imagePreviewDiv);

      imagePreviewContainer.style.display = 'block';

      showStatus('Reference image added successfully!', 'success');
    }

    // Function to handle file upload
    function handleFileUpload(event) {
      const file = event.target.files[0];
      if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => {
          const imageData = reader.result;
          addImageToPreview(imageData);

          // Generate suggested prompt based on the image
          generatePromptFromImage(imageData);
        };
        reader.readAsDataURL(file);
      }
    }

    // Function to generate a suggested prompt based on the uploaded image
    function generatePromptFromImage(imageData) {
      // Get current prompt value
      const promptField = document.getElementById('user-prompt');
      const currentPrompt = promptField.value.trim();

      // If there's already a prompt, don't override it
      if (currentPrompt.length > 0) {
        return;
      }

      // Set a loading message
      promptField.value = "Analyzing image to identify visual differences...";
      showStatus('Analyzing reference image to identify visual differences...', 'info');

      // Disable UI while processing image
      setUIProcessingState(true, 'image-analysis');

      // Get API key from storage
      chrome.storage.local.get(['geminiApiKey'], async (result) => {
        const apiKey = result.geminiApiKey;

        if (!apiKey) {
          promptField.value = "Please add your API key in the Settings tab first.";
          showStatus('API key is missing. Please add it in Settings tab.', 'error');
          // Re-enable UI
          setUIProcessingState(false);
          return;
        }

        try {
          // Get current page data for context
          const tabs = await new Promise((resolve) => {
            chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
              resolve(tabs);
            });
          });

          // Get the DOM structure
          const treeResponse = await safeSendMessage(tabs[0].id, {action: 'getPortalClassTree'});
          if (!treeResponse.success) {
            throw new Error('Failed to get portal class structure');
          }
          const portalClassTree = treeResponse.data;

          // Get screenshot of current page if possible
          let pageScreenshot = null;
          try {
            // Show detailed status message
            showStatus('Capturing screenshot of current viewport...', 'info');

            // Increase the timeout for screenshot capture
            const screenshotResponse = await new Promise((resolve, reject) => {
              let responseTimer = setTimeout(() => {
                reject(new Error('Screenshot capture timeout'));
              }, 12000); // Increased timeout for more reliable capture

              console.log('Requesting screenshot from content script...');
              safeSendMessage(tabs[0].id, {action: 'captureScreenshot'}, (response) => {
                clearTimeout(responseTimer);
                console.log('Screenshot response received:', response ? 'Success' : 'Failed');

                if (!response || !response.success) {
                  const error = response?.error || 'Failed to capture screenshot';
                  console.error('Screenshot error:', error);
                  reject(new Error(error));
                  return;
                }

                if (!isValidImageData(response.data)) {
                  console.error('Invalid screenshot data format received');
                  reject(new Error('Invalid screenshot data format'));
                  return;
                }

                resolve(response);
              });
            })

            if (screenshotResponse && screenshotResponse.data) {
              pageScreenshot = screenshotResponse.data;
              console.log('Successfully captured current page screenshot for first LLM call');

              // Automatically download the screenshot for verification
              saveScreenshot(pageScreenshot, 'current-page');
              showStatus('Current page screenshot captured for comparison', 'success');
            }
          } catch (err) {
            console.warn('Could not capture page screenshot:', err);
            showStatus('Could not capture current page screenshot. Falling back to reference-only analysis.', 'info');

            // Try an alternative screenshot method if the first one failed
            try {
              console.log('Trying alternative screenshot method...');

              // Use chrome.tabs API directly as fallback
              const dataUrl = await new Promise((resolve, reject) => {
                chrome.tabs.captureVisibleTab(null, {format: 'png', quality: 100}, (dataUrl) => {
                  if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                  }
                  resolve(dataUrl);
                });
              });

              if (dataUrl) {
                pageScreenshot = dataUrl;
                console.log('Successfully captured screenshot using fallback method');
                saveScreenshot(pageScreenshot, 'current-page-fallback');
                showStatus('Current page screenshot captured using fallback method', 'info');
              }
            } catch (fallbackError) {
              console.error('All screenshot methods failed:', fallbackError);
              showStatus('Unable to capture current page. Analysis will be limited.', 'error');
            }
          }

          // Call the API function to analyze the reference image
          const generatedPrompt = await analyzeReferenceImage(apiKey, imageData, pageScreenshot);

          // Update the prompt field with the generated prompt
          promptField.value = generatedPrompt;

          // Show success message
          showStatus('Visual description created from reference image!', 'success');

        } catch (error) {
          console.error('Error analyzing image:', error);
          promptField.value = "Error analyzing image. Please try again or write your own description.";
          showStatus(`Error: ${error.message}`, 'error');
        } finally {
          // Re-enable UI no matter what happened
          setUIProcessingState(false);
        }
      });
    }

    // Set up file input handler
    const fileInput = document.getElementById('image-file-input');
    fileInput.addEventListener('change', handleFileUpload);

    // Add button click handler for upload button
    document.getElementById('upload-image-btn').addEventListener('click', () => {
      fileInput.click(); // Trigger file input click
    });

    // Set up the clear all images button
    document.getElementById('clear-all-images-btn').addEventListener('click', () => {
      // Clear all reference images
      window.referenceImages = [];
      document.getElementById('images-grid').innerHTML = '';
      document.getElementById('image-preview-container').style.display = 'none';
      showStatus('All reference images removed', 'info');
    });

    // Helper function to generate and apply CSS
    window.generateAndApplyCSS = async function(apiKey, prompt, currentCSS) {
      try {
        // Show loading spinner
        document.getElementById('loading-spinner').style.display = 'inline-block';

        // Disable UI elements during processing
        setUIProcessingState(true, 'css-generation');

        // Save current CSS as a version before generating new one if it's not the initial placeholder
        if (currentCSS && currentCSS !== "/* CSS will appear here after generation */") {
          saveCSSVersion(currentCSS, `Before: ${prompt.substring(0, 30)}${prompt.length > 30 ? '...' : ''}`);
        }

        // Check if we have reference images
        const hasReferenceImages = window.referenceImages.length > 0;
        if (hasReferenceImages) {
          showStatus(`Using ${window.referenceImages.length} reference image(s) for design inspiration`, 'info');
        }

        showStatus('Fetching page data...', 'info');

        // Fetch the latest DOM data before generating CSS
        // This ensures we have the most up-to-date data if the user navigated to a different page
        try {
          // Get portal class tree
          const treeResponse = await new Promise((resolve, reject) => {
            chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
              if (!tabs || !tabs[0]) {
                reject(new Error('No active tab found'));
                return;
              }

              try {
                const response = await safeSendMessage(tabs[0].id, {action: 'getPortalClassTree'});
                if (!response || !response.success) {
                  reject(new Error('Failed to get portal class data'));
                  return;
                }
                resolve(response);
              } catch (err) {
                reject(err);
              }
            });
          });

          portalClassTree = treeResponse.data;
          allPortalClasses = [...new Set(extractPortalClasses(portalClassTree))];

          // Get tailwind classes
          showStatus('Analyzing page styles...', 'info');
          tailwindClassData = await collectTailwindClasses();

          // Attach tailwind classes to the portal class tree
          const attachTailwindClasses = (node) => {
            if (node.portalClasses && node.portalClasses.length > 0) {
              // Find matching tailwind data for this node
              const tailwindClasses = [];
              node.portalClasses.forEach(className => {
                if (tailwindClassData[className]) {
                  tailwindClasses.push(...tailwindClassData[className]);
                }
              });
              node.tailwindClasses = [...new Set(tailwindClasses)]; // Remove duplicates
            }

            // Process children
            if (node.children) {
              node.children.forEach(child => attachTailwindClasses(child));
            }
          };

          attachTailwindClasses(portalClassTree);

          // --- BEGIN ITERATIVE FEEDBACK LOOP ---
          let css = await generateCSSWithAI(
            apiKey,
            // Improved prompt for pixel-perfect matching
            `${prompt}\n\nIMPORTANT: The goal is to make the current Help Center visually indistinguishable from the reference image(s). Focus on pixel-perfect matching of color, spacing, font, and layout. Do not ignore small differences. Only use the provided class names. If unsure, err on the side of making more changes.`,
            portalClassTree,
            tailwindClassData,
            currentCSS
          );

          // Display the generated CSS in Monaco Editor
          window.cssEditor.setValue(css);
          window.generatedCSS = css;

          // Save the new CSS as a version
          saveCSSVersion(css, `${prompt.substring(0, 30)}${prompt.length > 30 ? '...' : ''}`);

          showStatus('CSS generated successfully!', 'success');

          // AUTOMATIC FEEDBACK LOOP - Apply CSS, take screenshot, get feedback
          showStatus('Running AI review of applied styles...', 'info');

          // Create a visual progress indicator for the feedback rounds
          const progressIndicator = document.createElement('div');
          progressIndicator.className = 'feedback-progress-indicator';
          progressIndicator.style.cssText = 'display: flex; justify-content: center; margin: 10px 0; gap: 5px;';

          // Iterative feedback loop: increased from 3 to 5 rounds
          const MAX_FEEDBACK_ITERATIONS = 5;

          // Create visual indicators for each round
          for (let i = 0; i < MAX_FEEDBACK_ITERATIONS; i++) {
            const roundIndicator = document.createElement('div');
            roundIndicator.className = `round-indicator round-${i}`;
            roundIndicator.style.cssText = 'width: 12px; height: 12px; border-radius: 50%; background-color: #ddd; transition: all 0.3s;';
            roundIndicator.setAttribute('title', `Feedback round ${i+1}`);
            progressIndicator.appendChild(roundIndicator);
          }

          // Find a good place to insert the progress indicator
          const statusContainer = document.querySelector('.status-container') || document.getElementById('monaco-editor-container');
          if (statusContainer) {
            statusContainer.parentNode.insertBefore(progressIndicator, statusContainer.nextSibling);
          }

          let improvedCSS = css;
          let feedbackRound = 0;
          let feedbackNeeded = true;
          let lastChangeSignificance = 1.0; // Start with full significance

          // Update the visual indicator for the current round
          const updateProgressIndicator = (round, success = true) => {
            const indicators = document.querySelectorAll('.round-indicator');
            indicators.forEach((indicator, index) => {
              if (index < round) {
                indicator.style.backgroundColor = '#4CAF50'; // Green for completed rounds
              } else if (index === round) {
                indicator.style.backgroundColor = success ? '#2196F3' : '#F44336'; // Blue for current, red for error
                indicator.style.transform = 'scale(1.2)';
              }
            });
          };

          try {
            while (feedbackNeeded && feedbackRound < MAX_FEEDBACK_ITERATIONS) {
              // Update progress indicator for current round
              updateProgressIndicator(feedbackRound);

              showStatus(`Analyzing style match... (Round ${feedbackRound + 1}/${MAX_FEEDBACK_ITERATIONS})`, 'info');

              // Apply the CSS and get feedback
              const feedback = await analyzeCSSAndGetFeedback(
                apiKey,
                improvedCSS,
                // Improved feedback prompt
                `${prompt}\n\nIMPORTANT: The goal is to make the current Help Center visually indistinguishable from the reference image(s). Focus on pixel-perfect matching of color, spacing, font, and layout. Do not ignore small differences. Only use the provided class names. If unsure, err on the side of making more changes.`
              );

              if (feedback) {
                feedbackRound++;

                // Estimate significance of changes (simple heuristic based on difference length)
                const changeSize = Math.abs(feedback.length - improvedCSS.length);
                lastChangeSignificance = Math.min(1.0, changeSize / (improvedCSS.length * 0.3)); // Normalize to 0-1

                showStatus(`Visual improvements identified! Applying changes... (Round ${feedbackRound}/${MAX_FEEDBACK_ITERATIONS})`, 'info');

                // Update the editor with improved CSS
                window.cssEditor.setValue(feedback);
                window.generatedCSS = feedback;

                // Save as a new version with round number
                saveCSSVersion(feedback, `AI-improved (Round ${feedbackRound}/${MAX_FEEDBACK_ITERATIONS}): ${prompt.substring(0, 30)}${prompt.length > 30 ? '...' : ''}`);

                // Apply the improved CSS
                await new Promise((resolve) => {
                  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                    chrome.tabs.sendMessage(tabs[0].id, {
                      action: 'applyCSS',
                      css: feedback
                    }, (response) => {
                      if (chrome.runtime.lastError || !response || !response.success) {
                        showStatus('Warning: Could not apply improved CSS.', 'error');
                        updateProgressIndicator(feedbackRound, false);
                        resolve();
                        return;
                      }
                      updateProgressIndicator(feedbackRound);
                      showStatus(`✅ Improved styles applied! (Round ${feedbackRound}/${MAX_FEEDBACK_ITERATIONS})`, 'success');
                      resolve();
                    });
                  });
                });

                improvedCSS = feedback;

                // Early termination if changes are very minor (indicating we're close to perfect)
                if (lastChangeSignificance < 0.05 && feedbackRound >= 2) {
                  showStatus('✅ Achieved high-quality visual match! Further improvements would be minimal.', 'success');
                  feedbackNeeded = false;
                }
              } else {
                // No improvements needed
                updateProgressIndicator(feedbackRound);
                showStatus('✅ AI review complete - visual match achieved!', 'success');
                feedbackNeeded = false;
              }
            }

            // Final message after all iterations
            if (feedbackRound >= MAX_FEEDBACK_ITERATIONS) {
              showStatus(`Completed ${MAX_FEEDBACK_ITERATIONS} rounds of visual refinement. Final result applied.`, 'success');
            }

          } catch (error) {
            console.error('Error in feedback loop:', error);
            updateProgressIndicator(feedbackRound, false);
            showStatus(`Error during feedback round ${feedbackRound + 1}: ${error.message}`, 'error');
          }

          // After loop completes (successfully or with error), remove progress indicator after a delay
          setTimeout(() => {
            if (progressIndicator && progressIndicator.parentNode) {
              progressIndicator.style.opacity = '0';
              setTimeout(() => progressIndicator.remove(), 500);
            }
          }, 5000);
          // --- END ITERATIVE FEEDBACK LOOP ---

        } catch (error) {
          console.error('Error fetching page data:', error);
          if (error.message.includes('Extension context invalidated')) {
            showStatus('Connection to page lost. Please refresh the page and try again.', 'error');
          } else {
            showStatus(`Error accessing page data: ${error.message}. Try refreshing the page.`, 'error');
          }
          throw error; // Re-throw to stop execution
        }
      } catch (error) {
        console.error('Error in CSS generation:', error);

        // Show specific error messages for different types of errors
        if (error.message.includes('API Error')) {
          showStatus(`API Error: ${error.message.replace('API Error: ', '')}`, 'error');
        } else if (error.message.includes('context invalidated')) {
          showStatus('Connection to page was lost. Try refreshing the page.', 'error');
        } else if (error.message.includes('timeout')) {
          showStatus('Operation timed out. Please try again.', 'error');
        } else {
          showStatus(`Error: ${error.message}`, 'error');
        }
      } finally {
        // Re-enable UI elements
        setUIProcessingState(false);
      }
    };

    // Add event listener for the Apply CSS button
    document.getElementById('apply-css-btn').addEventListener('click', () => {
      // Get CSS from Monaco editor
      const css = window.cssEditor ? window.cssEditor.getValue() : null;

      if (!css || css === '/* CSS will appear here after generation */') {
        showStatus('No CSS to apply. Generate CSS first.', 'error');
        return;
      }

      // Clean the CSS before applying
      const cleanedCss = cleanText(css);

      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'applyCSS',
          css: cleanedCss
        }, (response) => {
          if (chrome.runtime.lastError || !response || !response.success) {
            showStatus('Failed to apply CSS. Please try again.', 'error');
            return;
          }
          showStatus('CSS applied successfully!', 'success');
        });
      });
    });

    // Set up tab switching
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    // Initially hide all tab contents except the active one
    tabContents.forEach(content => {
      if (!content.classList.contains('active')) {
        content.style.display = 'none';
      } else {
        content.style.display = 'flex';
      }
    });

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        // Remove active class from all tabs and content
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));

        tabContents.forEach(c => {
          c.classList.remove('active');
          c.style.display = 'none';
        });

        // Add active class to clicked tab and corresponding content
        tab.classList.add('active');
        const tabName = tab.getAttribute('data-tab');
        const activeContent = document.getElementById(`${tabName}-tab`);
        activeContent.classList.add('active');
        activeContent.style.display = 'flex';

        // Only load the tree data when the hierarchy tab is clicked
        if (tabName === 'hierarchy' && !document.getElementById('tree-container').hasChildNodes()) {
          loadTreeData();
        }

        // Refresh Monaco editor when customize tab is displayed
        if (tabName === 'customize' && monacoEditor) {
          // Give Monaco editor a moment to adjust to the new size
          setTimeout(() => {
            monacoEditor.layout();
          }, 10);
        }

        // Update versions tab when clicked
        if (tabName === 'versions') {
          updateVersionsTab();
        }
      });
    });

    // Ensure the correct tab is active on initial load
    const activeTab = document.querySelector('.tab.active');
    if (activeTab) {
      const tabName = activeTab.getAttribute('data-tab');
      const activeContent = document.getElementById(`${tabName}-tab`);
      activeContent.classList.add('active');
      activeContent.style.display = 'flex';

      // Only load the tree data if the hierarchy tab is initially active
      if (tabName === 'hierarchy') {
        loadTreeData();
      }
    }

    // Add event listener for the reload tree button
    document.getElementById('reload-tree-btn').addEventListener('click', () => {
      loadTreeData();
    });

    // Add event listener for the Generate CSS button
    document.getElementById('generate-btn').addEventListener('click', async () => {
      const apiKey = document.getElementById('api-key').value;
      if (!apiKey) {
        showStatus('Please enter a valid API key in the Settings tab.', 'error');
        return;
      }

      const prompt = document.getElementById('user-prompt').value;
      if (!prompt.trim()) {
        showStatus('Please enter a design prompt.', 'error');
        return;
      }

      // Show loading spinner
      document.getElementById('loading-spinner').style.display = 'inline-block';

      try {
        // Get current CSS from editor to save as a version
        const currentCSS = monacoEditor.getValue();

        // Generate CSS with latest DOM data
        await window.generateAndApplyCSS(apiKey, prompt, currentCSS);
      } catch (error) {
        console.error('Error generating CSS:', error);
        showStatus(`Error: ${error.message}`, 'error');
        document.getElementById('loading-spinner').style.display = 'none';
      }
    });

  }, 100); // Small delay to ensure DOM is ready

  // Load API key and CSS versions from storage
  chrome.storage.local.get(['geminiApiKey', 'cssVersions'], (result) => {
    if (result.geminiApiKey) {
      document.getElementById('api-key').value = result.geminiApiKey;
    }

    if (result.cssVersions && Array.isArray(result.cssVersions)) {
      cssVersions = result.cssVersions;

      // Ensure all versions have numeric timestamps
      cssVersions = cssVersions.map(version => {
        // If timestamp is a string or a Date object, convert it to a number
        if (typeof version.timestamp !== 'number') {
          // Try to convert to number, if that fails use current time
          const timestamp = new Date(version.timestamp).getTime();
          return {
            ...version,
            timestamp: isNaN(timestamp) ? Date.now() : timestamp
          };
        }
        return version;
      });

      // Save the fixed versions back to storage
      chrome.storage.local.set({cssVersions});

      // Initialize versions tab if it's the active tab
      const activeTab = document.querySelector('.tab.active');
      if (activeTab && activeTab.getAttribute('data-tab') === 'versions') {
        updateVersionsTab();
      }
    }
  });

  // Add event listener for the Save API Key button
  document.getElementById('save-key-btn').addEventListener('click', () => {
    const apiKey = document.getElementById('api-key').value;
    if (!apiKey) {
      showStatus('Please enter a valid API key.', 'error');
      return;
    }

    chrome.storage.local.set({geminiApiKey: apiKey}, () => {
      showStatus('API key saved successfully!', 'success');
    });
  });

  // Add toast animations to document head
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes fadeOut {
      from { opacity: 1; transform: translateY(0); }
      to { opacity: 0; transform: translateY(-20px); }
    }
  `;
  document.head.appendChild(style);
});

// Function to save a captured screenshot
function saveScreenshot(screenshotData, description = 'portal') {
  // Import the saveScreenshot function from our screenshot module
  import('./js/modules/screenshot.js').then(screenshotModule => {
    screenshotModule.saveScreenshot(screenshotData, description);
  }).catch(error => {
    console.error('Error importing screenshot module:', error);
    showStatus('Error saving screenshot: ' + error.message, 'error');
  });
}

// Function to apply CSS and get feedback from LLM
async function applyCSSAndGetFeedback(apiKey, generatedCSS, prompt) {
  try {
    // First apply the CSS to the page
    showStatus('Applying CSS to evaluate results...', 'info');

    // Apply CSS to the page
    const applyResponse = await new Promise((resolve, reject) => {
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (!tabs || !tabs[0]) {
          reject(new Error('No active tab found'));
          return;
        }

        safeSendMessage(tabs[0].id, {
          action: 'applyCSS',
          css: generatedCSS
        }, (response) => {
          if (!response || !response.success) {
            reject(new Error('Failed to apply CSS'));
            return;
          }
          resolve(response);
        });
      });
    });

    // Give the page a moment to render with the new CSS
    await new Promise(resolve => setTimeout(resolve, 500));

    // Capture screenshot of the result using multiple methods with fallbacks
    showStatus('Capturing screenshot of the styled page...', 'info');

    let screenshot = null;
    let captureError = null;

    // Try method 1: Use content script capture (better for full page)
    try {
      // Get current tab
      const tab = await new Promise((resolve) => {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
          resolve(tabs[0]);
        });
      });

      // Request screenshot with timeout protection
      const screenshotResult = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Screenshot capture timed out'));
        }, 15000); // 15 second timeout

        safeSendMessage(tab.id, {action: 'captureScreenshot'}, (response) => {
          clearTimeout(timeout);
          if (!response || !response.success) {
            reject(new Error(response?.error || 'Failed to capture screenshot'));
            return;
          }
          resolve(response.data);
        });
      });

      // Validate screenshot
      if (screenshotResult && typeof screenshotResult === 'string' && screenshotResult.startsWith('data:image')) {
        screenshot = screenshotResult;
        showStatus('Captured screenshot for feedback', 'success');
      } else {
        throw new Error('Invalid screenshot data received');
      }
    } catch (error) {
      console.warn('Primary screenshot method failed:', error);
      captureError = error;
      showStatus('Primary screenshot method failed, trying alternatives...', 'info');
    }

    // Try method 2: Chrome API capture (fallback, but may not include full page)
    if (!screenshot) {
      try {
        showStatus('Trying alternative screenshot method...', 'info');
        const tab = await new Promise((resolve) => {
          chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            resolve(tabs[0]);
          });
        });

        // Use chrome.tabs.captureVisibleTab API
        const dataUrl = await new Promise((resolve, reject) => {
          chrome.tabs.captureVisibleTab(null, {format: 'png'}, (dataUrl) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve(dataUrl);
          });
        });

        if (dataUrl) {
          screenshot = dataUrl;
          showStatus('Captured visible portion of page', 'success');
        }
      } catch (error) {
        console.warn('Fallback screenshot method failed:', error);
        captureError = captureError || error;
      }
    }

    // Try method 3: Use DOM serialization fallback if screenshots failed
    if (!screenshot) {
      try {
        showStatus('Using DOM analysis as fallback...', 'info');

        // Skip the screenshot and just use the CSS analysis
        screenshot = null;
        showStatus('Proceeding with AI feedback without screenshot', 'info');
      } catch (error) {
        console.error('All screenshot methods failed:', error);
        captureError = captureError || error;
        throw new Error('Unable to capture or analyze page content: ' + captureError.message);
      }
    }

          // Save the screenshot automatically if we got one
      if (screenshot) {
        saveScreenshot(screenshot, 'for-feedback');
      } else {
      showStatus('Could not save screenshot, but continuing with analysis', 'info');
    }

    // Prepare for file upload if we have a screenshot
    let fileUri = null;
    if (screenshot) {
      try {
        // Upload screenshot to Gemini API
        showStatus('Analyzing results for potential improvements...', 'info');

        // Convert base64 to blob
        const base64Data = screenshot.split(',')[1];
        const byteCharacters = atob(base64Data);
        const byteArrays = [];

        for (let offset = 0; offset < byteCharacters.length; offset += 512) {
          const slice = byteCharacters.slice(offset, offset + 512);
          const byteNumbers = new Array(slice.length);
          for (let i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          byteArrays.push(byteArray);
        }

        const blob = new Blob(byteArrays, {type: 'image/png'});

        // Get upload URL
        const uploadUrlResponse = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'X-Goog-Upload-Protocol': 'resumable',
            'X-Goog-Upload-Command': 'start',
            'X-Goog-Upload-Header-Content-Length': blob.size.toString(),
            'X-Goog-Upload-Header-Content-Type': 'image/png',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            file: {
              display_name: 'RESULT_SCREENSHOT'
            }
          })
        });

        // Extract upload URL from headers
        const uploadUrl = uploadUrlResponse.headers.get('X-Goog-Upload-URL');

        if (!uploadUrl) {
          throw new Error('Failed to get upload URL');
        }

        // Upload the file
        const uploadResponse = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Content-Length': blob.size.toString(),
            'X-Goog-Upload-Offset': '0',
            'X-Goog-Upload-Command': 'upload, finalize'
          },
          body: blob
        });

        if (!uploadResponse.ok) {
          throw new Error('Failed to upload result screenshot');
        }

        const fileInfo = await uploadResponse.json();
        fileUri = fileInfo.file.uri;
      } catch (error) {
        console.error('Error uploading screenshot:', error);
        showStatus('Error uploading screenshot. Proceeding without visual feedback.', 'info');
      }
    }

    // Now ask LLM for feedback - with or without screenshot
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

    // Create payload for feedback with text-only fallback if no screenshot
    showStatus(fileUri ? 'Getting AI feedback on visual results...' : 'Getting AI feedback on CSS code...', 'info');

    // Create payload for feedback with clearer instructions
    const payload = {
      contents: [{
        parts: [
          // Include original reference images if available
          ...(window.referenceImages.length > 0 ?
            window.referenceImages.map(img => ({
              inline_data: {
                mime_type: img.data.split(';')[0].split(':')[1],
                data: img.data.split(',')[1]
              }
            })) : []),

          // Include the result screenshot if available
          ...(fileUri ? [{
            file_data: {
              mime_type: "image/png",
              file_uri: fileUri
            }
          }] : []),

          {
            text: `You are a CSS expert evaluating a web page styling.

ORIGINAL REQUEST: "${prompt}"

CURRENT CSS IMPLEMENTATION:
\`\`\`css
${generatedCSS}
\`\`\`

TASK:
1. ${fileUri ? "I've applied the CSS above to the page and taken a screenshot of the result." : "I've applied the CSS above to the page but couldn't capture a screenshot."}
2. ${fileUri ? `Compare this result against ${window.referenceImages.length > 0 ? "the reference image(s) provided earlier" : "the intended design described in the original request"}.` : "Analyze the CSS code quality and make improvements where needed."}
3. Determine if the CSS needs further improvement.

EXACTLY FOLLOW THIS RESPONSE FORMAT:
- If NO improvements are needed, respond with ONLY the word "No".
- If improvements ARE needed, respond with ONLY the complete improved CSS file, with no explanations or markdown formatting.

IMPORTANT RULES:
- Your ENTIRE response must be EITHER the single word "No" OR the complete CSS code.
- Do NOT add any explanation text, prefixes, or suffixes.
- If returning CSS, include ALL previous CSS with your modifications.
- Add comments in the CSS to explain your changes.
- Do NOT use markdown code blocks or any extra formatting.

I REPEAT: Return ONLY "No" or the complete CSS code with no other text.`
          }
        ]
      }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2048
      }
    };

    // Make API request
    const response = await fetch(`${url}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API Error: ${errorData.error?.message || response.statusText || 'Unknown error'}`);
    }

    const data = await response.json();
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts) {
      throw new Error('Invalid response format from API');
    }

    const feedbackText = data.candidates[0].content.parts[0].text.trim();

    console.log('Feedback LLM response:', feedbackText.substring(0, 100) + '...');

    // Process the response with improved handling
    if (feedbackText === "No" || feedbackText.toLowerCase() === "no.") {
      showStatus('AI review: No improvements needed! The CSS looks good.', 'success');
      return null; // No improvements needed
    } else {
      // Check if it looks like CSS (contains braces)
      if (feedbackText.includes('{') && feedbackText.includes('}')) {
        showStatus('AI suggested CSS improvements! Applying updated styles...', 'info');

        // Extract CSS if it's wrapped in code blocks (even though we asked for no markdown)
        const cssMatch = feedbackText.match(/```css\n([\s\S]*?)\n```/) ||
                         feedbackText.match(/```\n([\s\S]*?)\n```/);

        if (cssMatch && cssMatch[1]) {
          showStatus('Applied AI-suggested CSS improvements', 'success');
          return cssMatch[1]; // Return the extracted CSS
        }

        // Otherwise, return the full text assuming it's all CSS
        showStatus('Applied AI-suggested CSS improvements', 'success');
        return feedbackText;
      } else if (feedbackText.toLowerCase().includes("unchanged") ||
                feedbackText.toLowerCase().includes("no changes") ||
                feedbackText.toLowerCase().startsWith("no")) {
        // Handle variant "no change needed" responses
        showStatus('AI review: No improvements needed! The CSS looks good.', 'success');
        return null;
      } else {
        // If we got here, the response format was unexpected
        console.error('Unexpected feedback format:', feedbackText);
        showStatus('AI provided feedback in an unexpected format', 'error');
        return null;
      }
    }

  } catch (error) {
    console.error('Error in feedback process:', error);
    showStatus(`Error getting feedback: ${error.message}`, 'error');
    return null; // Return null to indicate no changes
  }
}

// Function moved to ui.js module
