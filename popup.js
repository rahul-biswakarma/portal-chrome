// Import required modules
import { showStatus, setUIProcessingState } from './js/modules/ui.js';
import { saveCSSVersion, deleteCSSVersion, applyVersion, previewVersion, updateVersionsTab } from './js/modules/versions.js';
import { simplifyTree } from './js/modules/tree.js';
import {
  analyzeReferenceImage,
  generateCSSWithAI,
  analyzeCSSAndGetFeedback,
  isValidImageData,
  generateCSSDirectly
} from './js/modules/api.js';
import { safeSendMessage } from './js/utils/chrome-utils.js';

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
      chrome.storage.local.get(['openAIApiKey'], async (result) => {
        const apiKey = result.openAIApiKey;

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
          let css = await generateCSSDirectly(
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
  chrome.storage.local.get(['openAIApiKey', 'cssVersions'], (result) => {
    if (result.openAIApiKey) {
      document.getElementById('api-key').value = result.openAIApiKey;
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

    chrome.storage.local.set({openAIApiKey: apiKey}, () => {
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

    // Now use OpenAI API to get feedback
    showStatus('Analyzing results for potential improvements...', 'info');

    // Use the analyzeCSSAndGetFeedback function from our openai.js module
    const improvedCSS = await analyzeCSSAndGetFeedback(apiKey, generatedCSS, prompt, screenshot);

    if (improvedCSS) {
      // Apply the improved CSS if available
      return improvedCSS;
    } else {
      // No improvements needed
      return null;
    }
  } catch (error) {
    console.error('Error in CSS feedback process:', error);
    showStatus(`Error getting feedback: ${error.message}`, 'error');
    return null;
  }
}

// Function moved to ui.js module
