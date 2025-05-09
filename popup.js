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

// Function to extract all portal classes from the tree
function extractPortalClasses(node) {
  let classes = [...node.portalClasses];
  node.children.forEach(child => {
    classes = classes.concat(extractPortalClasses(child));
  });
  return classes;
}

// Function to show status message
function showStatus(message, type) {
  const statusElement = document.getElementById('status-message');
  statusElement.textContent = message;
  statusElement.className = type;
  statusElement.style.display = 'block';

  // Hide after 5 seconds
  setTimeout(() => {
    statusElement.style.display = 'none';
  }, 5000);
}

// Function to generate CSS with Gemini directly from DOM structure and tailwind classes
async function generateCSSDirectly(apiKey, prompt, portalClassTree, tailwindData, currentCSS = "") {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

  // Create a simplified version of the tree for the LLM
  // Only include tag name, portal classes, and tailwind classes
  function simplifyTree(node) {
    const simplified = {
      element: node.element,
      portalClasses: node.portalClasses,
      tailwindClasses: node.tailwindClasses || [],
      children: []
    };

    if (node.children && node.children.length > 0) {
      simplified.children = node.children.map(child => simplifyTree(child));
    }

    return simplified;
  }

  const simplifiedTree = simplifyTree(portalClassTree);

  // Get the screenshot if possible
  let screenshot = null;
  try {
    const tabResponse = await new Promise((resolve) => {
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, {action: 'captureScreenshot'}, (response) => {
          resolve(response);
        });
      });
    });

    if (tabResponse && tabResponse.success) {
      screenshot = tabResponse.data;

      // Save screenshot locally
      const link = document.createElement('a');
      link.href = screenshot;
      link.download = 'portal_screenshot_' + new Date().toISOString().replace(/:/g, '-') + '.jpg';
      link.click();
    }
  } catch (error) {
    console.warn('Could not capture screenshot:', error);
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

      const blob = new Blob(byteArrays, {type: 'image/jpeg'});

      // Get upload URL
      const uploadUrlResponse = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Length': blob.size.toString(),
          'X-Goog-Upload-Header-Content-Type': 'image/jpeg',
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
        throw new Error('Failed to upload file');
      }

      const fileInfo = await uploadResponse.json();
      fileUri = fileInfo.file.uri;
    } catch (error) {
      console.error('Error uploading screenshot:', error);
    }
  }

  // Simplify the tailwind data to only show essential information
  const simplifiedTailwindData = {};
  if (tailwindData) {
    Object.keys(tailwindData).forEach(selector => {
      if (/^portal-.*$/.test(selector)) {
        simplifiedTailwindData[selector] = tailwindData[selector];
      }
    });
  }

  // Prepare the payload
  const payload = {
    contents: [
      {
        parts: [
          // Add the image if we have a file URI
          ...(fileUri ? [{
            file_data: {
              mime_type: "image/jpeg",
              file_uri: fileUri
            }
          }] : []),
          {
            text: `You are a CSS expert specializing in creating styles for web applications.

USER PROMPT: "${prompt}"

DOM STRUCTURE (focusing on classes matching pattern ^portal-.*$):
${JSON.stringify(simplifiedTree, null, 2)}

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
      throw new Error(`API Error: ${errorData.error?.message || response.statusText || 'Unknown error'}`);
    }

    const data = await response.json();
    const cssText = data.candidates[0].content.parts[0].text;

    // Extract the CSS part from the response
    const cssMatch = cssText.match(/```css\n([\s\S]*?)\n```/) ||
                     cssText.match(/```\n([\s\S]*?)\n```/) ||
                     { 1: cssText }; // If no code block, use the entire text

    return cssMatch[1] || cssMatch[0];
  } catch (error) {
    console.error('Error calling Gemini API for CSS generation:', error);
    throw error;
  }
}

// Function to collect tailwind classes for each portal element
async function collectTailwindClasses() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'getTailwindClasses'}, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        if (!response || !response.success) {
          reject(new Error('Failed to collect tailwind classes'));
          return;
        }
        resolve(response.data);
      });
    });
  });
}

// Function to get current CSS from the page
async function getCurrentCSS() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'getCurrentCSS'}, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        if (!response || !response.success) {
          reject(new Error('Failed to get current CSS'));
          return;
        }
        resolve(response.data || "");
      });
    });
  });
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
    chrome.tabs.sendMessage(tabs[0].id, {
      action: 'scrollElementIntoView',
      className: className
    });
  });
}

// Function to send message to content script to highlight elements with a class
function highlightElementsWithClass(className) {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, {
      action: 'highlightElements',
      className: className
    });
  });
}

// Function to send message to content script to remove highlights
function removeHighlight() {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, {
      action: 'removeHighlight'
    });
  });
}

// Function to load tree data
async function loadTreeData() {
  // Clear the tree container
  const treeContainer = document.getElementById('tree-container');
  treeContainer.innerHTML = '<div style="text-align: center; padding: 20px;">Loading class hierarchy...</div>';

  try {
    // Get portal class tree
    const response = await new Promise((resolve, reject) => {
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (!tabs[0]) {
          reject(new Error('Unable to access the current tab.'));
          return;
        }
        chrome.tabs.sendMessage(tabs[0].id, {action: 'getPortalClassTree'}, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error('Could not establish connection with the page. Please refresh and try again.'));
            return;
          }
          if (!response) {
            reject(new Error('No response received from the page.'));
            return;
          }
          if (!response.success) {
            reject(new Error(response.error || 'Unknown error occurred'));
            return;
          }
          resolve(response);
        });
      });
    });

    if (response.data) {
      portalClassTree = response.data;

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

      // Use the HTML tree renderer
      treeContainer.innerHTML = '';
      const treeHTML = createTreeNodeHTML(response.data);
      treeContainer.appendChild(treeHTML);

      // Extract all portal classes for CSS generation
      allPortalClasses = extractPortalClasses(response.data);
      // Remove duplicates
      allPortalClasses = [...new Set(allPortalClasses)];
    } else {
      treeContainer.innerHTML = '<div style="text-align: center; padding: 20px;">No portal classes found on this page.</div>';
    }
  } catch (error) {
    treeContainer.innerHTML = `<div style="text-align: center; padding: 20px; color: #721c24;">${error.message}</div>`;
  }
}

// When popup is opened, request portal class tree from content script
document.addEventListener('DOMContentLoaded', () => {
  // Initialize CodeMirror editor for CSS
  const cssTextarea = document.getElementById('css-code');

  // Wait a moment to ensure DOM is fully loaded
  setTimeout(() => {
    const cssEditor = CodeMirror.fromTextArea(cssTextarea, {
      mode: "text/css",
      theme: "dracula",
      lineNumbers: true,
      lineWrapping: true,
      autoCloseBrackets: true,
      matchBrackets: true,
      indentUnit: 2,
      tabSize: 2,
      viewportMargin: Infinity
    });

    // Set initial content
    cssEditor.setValue("/* CSS will appear here after generation */");

    // Helper function to generate and apply CSS
    window.generateAndApplyCSS = async function(apiKey, prompt, currentCSS) {
      try {
        // Fetch the latest DOM data before generating CSS
        // This ensures we have the most up-to-date data if the user navigated to a different page
        // Get portal class tree
        const treeResponse = await new Promise((resolve, reject) => {
          chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id, {action: 'getPortalClassTree'}, (response) => {
              if (chrome.runtime.lastError || !response || !response.success) {
                reject(new Error('Failed to get portal class data'));
                return;
              }
              resolve(response);
            });
          });
        });

        portalClassTree = treeResponse.data;
        allPortalClasses = [...new Set(extractPortalClasses(portalClassTree))];

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

        // Generate CSS directly with the new approach
        const css = await generateCSSDirectly(apiKey, prompt, portalClassTree, tailwindClassData, currentCSS);

        // Display the generated CSS in CodeMirror
        cssEditor.setValue(css);
        cssEditor.refresh();
        window.generatedCSS = css;

        showStatus('CSS generated successfully!', 'success');
      } catch (error) {
        console.error('Error in CSS generation:', error);
        showStatus(`Error: ${error.message}`, 'error');
      } finally {
        document.getElementById('loading-spinner').style.display = 'none';
      }
    };

    // Add event listener for the Apply CSS button
    document.getElementById('apply-css-btn').addEventListener('click', () => {
      // Get CSS from CodeMirror editor
      const css = cssEditor.getValue();

      if (!css || css === '/* CSS will appear here after generation */') {
        showStatus('No CSS to apply. Generate CSS first.', 'error');
        return;
      }

      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'applyCSS',
          css: css
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

        // Refresh CodeMirror when customize tab is displayed
        if (tabName === 'customize') {
          cssEditor.refresh();
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
        // Get current CSS
        const currentCSS = await getCurrentCSS();

        // Generate CSS with latest DOM data
        await window.generateAndApplyCSS(apiKey, prompt, currentCSS);
      } catch (error) {
        console.error('Error generating CSS:', error);
        showStatus(`Error: ${error.message}`, 'error');
        document.getElementById('loading-spinner').style.display = 'none';
      }
    });

  }, 100); // Small delay to ensure DOM is ready

  // Create a container for the tree
  const treeContainer = document.getElementById('tree-container');

  // Store all portal classes and tree for CSS generation
  let allPortalClasses = [];
  let portalClassTree = null;
  let tailwindClassData = null;
  let generatedCSS = '';

  // Listen for messages from content script about hover events
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'hoverPortalElement') {
      // Highlight tree nodes for the hovered classes
      highlightTreeNodes(message.portalClasses);
    } else if (message.action === 'leavePortalElement') {
      // Remove highlights
      removeTreeHighlights();
    }
  });

  // Load API key from storage
  chrome.storage.local.get(['geminiApiKey'], (result) => {
    if (result.geminiApiKey) {
      document.getElementById('api-key').value = result.geminiApiKey;
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
});
