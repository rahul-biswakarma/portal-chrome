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

// Function to call Gemini API for DOM analysis
async function analyzeDOM(apiKey, prompt, portalClassTree) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

  // Create a simplified version of the tree for the LLM
  const simplifiedTree = JSON.stringify(portalClassTree, null, 2);

  // Fix the JSON structure - ensure proper formatting of the text
  const payload = {
    contents: [
      {
        parts: [
          {
            text: `You are a DOM analyzer that extracts relevant information from a webpage's structure.

USER PROMPT: "${prompt}"

DOM STRUCTURE (focusing on portal classes):
${simplifiedTree}

Your task:
1. Analyze the DOM structure and identify the portal classes that are relevant to the user's prompt
2. Extract information about these classes: their purpose, hierarchy, and current styling context
3. Provide a structured analysis that will help generate CSS for these classes
4. Focus only on portal-prefixed classes

Format your response as a JSON object with these properties:
- relevantClasses: array of relevant portal class names
- classAnalysis: object with class names as keys and analysis as values
- designIntent: interpretation of what the user wants to achieve
- stylingRecommendations: general styling approaches to fulfill the user's request

DO NOT generate any CSS code yet, just analyze the DOM and the user's intent.`
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1024
    }
  };

  try {
    const DEBUG = true;

    if (DEBUG) {
      console.log('API URL:', url);
      console.log('API Key (first 3 chars):', apiKey.substring(0, 3) + '...');

      // Log the stringified payload to check for JSON errors
      const payloadString = JSON.stringify(payload);
      console.log('Payload length:', payloadString.length);
      console.log('Payload preview:', payloadString.substring(0, 100) + '...');

      // Check for JSON validity
      try {
        JSON.parse(payloadString);
        console.log('Payload is valid JSON');
      } catch (jsonError) {
        console.error('Payload is NOT valid JSON:', jsonError);
      }
    }

    const response = await fetch(`${url}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (DEBUG && response) {
      console.log('API Response status:', response.status, response.statusText);
    }

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Full API error:', errorData);
      throw new Error(`API Error: ${errorData.error?.message || response.statusText || 'Unknown error'}`);
    }

    const data = await response.json();
    if (DEBUG) {
      console.log('API Response data preview:', JSON.stringify(data).substring(0, 100) + '...');
    }

    const analysisText = data.candidates[0].content.parts[0].text;

    // Extract the JSON part from the response
    const jsonMatch = analysisText.match(/```json\n([\s\S]*?)\n```/) ||
                      analysisText.match(/{[\s\S]*}/);

    if (jsonMatch) {
      return JSON.parse(jsonMatch[1] || jsonMatch[0]);
    } else {
      throw new Error('Could not parse JSON from LLM response');
    }
  } catch (error) {
    console.error('Error calling Gemini API for analysis:', error);
    throw error;
  }
}

// Function to generate CSS with Gemini
async function generateCSS(apiKey, prompt, domAnalysis, allPortalClasses) {
 const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

  const payload = {
    contents: [
      {
        parts: [
          {
            text: `You are a CSS expert specializing in creating styles for web applications.

USER PROMPT: "${prompt}"

DOM ANALYSIS:
${JSON.stringify(domAnalysis, null, 2)}

ALL AVAILABLE PORTAL CLASSES:
${JSON.stringify(allPortalClasses, null, 2)}

Your task:
1. Generate CSS code that fulfills the user's design request
2. ONLY use selectors that target the portal-prefixed classes
3. Do not use element selectors, IDs, or non-portal classes
4. Create clean, efficient CSS that implements the user's design intent
5. Include comments explaining your styling choices

Format your response as a CSS code block only, without any additional text.
Start with a comment block explaining the overall approach.`
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 1024
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
      throw new Error(`API Error: ${errorData.error?.message || 'Unknown error'}`);
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

// Function to call Gemini API for CSS generation with enhanced context
async function generateEnhancedCSS(apiKey, prompt, portalClassTree, portalClassStyles, screenshot) {
  const DEBUG = true;

  // Step 1: Upload the screenshot as a file
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

      if (DEBUG) {
        console.log('File uploaded successfully, URI:', fileUri);
      }
    } catch (error) {
      console.error('Error uploading screenshot:', error);
      // Continue without the screenshot
    }
  }

  // Step 2: Generate CSS with Gemini 2.0 Flash
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

  // Create a simplified version of the tree for the LLM
  const simplifiedTree = JSON.stringify(portalClassTree, null, 2);

  // Create a simplified version of the styles
  const simplifiedStyles = JSON.stringify(portalClassStyles, null, 2);

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

DOM STRUCTURE (focusing on portal classes):
${simplifiedTree}

CURRENT STYLES FOR PORTAL CLASSES:
${simplifiedStyles}

Your task:
1. Generate CSS code that fulfills the user's design request
2. ONLY use selectors that target the portal-prefixed classes shown above
3. Do not use element selectors, IDs, or non-portal classes
4. Create clean, efficient CSS that implements the user's design intent
5. Include !important where necessary to override existing styles
6. Include comments explaining your styling choices

Format your response as a CSS code block only, without any additional text.
Start with a comment block explaining the overall approach.`
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1024
    }
  };

  try {
    if (DEBUG) {
      console.log('API URL:', url);
      console.log('API Key (first 3 chars):', apiKey.substring(0, 3) + '...');
      console.log('Payload preview (text part):', payload.contents[0].parts[payload.contents[0].parts.length - 1].text.substring(0, 100) + '...');
      console.log('File URI included:', !!fileUri);
    }

    const response = await fetch(`${url}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (DEBUG && response) {
      console.log('API Response status:', response.status, response.statusText);
    }

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Full API error:', errorData);
      throw new Error(`API Error: ${errorData.error?.message || response.statusText || 'Unknown error'}`);
    }

    const data = await response.json();
    if (DEBUG) {
      console.log('API Response data preview:', JSON.stringify(data).substring(0, 100) + '...');
    }

    // Extract the CSS from the response
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

// When popup is opened, request portal class tree from content script
document.addEventListener('DOMContentLoaded', () => {
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

  // Create a container for the tree
  const treeContainer = document.getElementById('tree-container');

  // Store all portal classes and tree for CSS generation
  let allPortalClasses = [];
  let portalClassTree = null;
  let generatedCSS = '';

  // Load API key from storage
  chrome.storage.local.get(['geminiApiKey'], (result) => {
    if (result.geminiApiKey) {
      document.getElementById('api-key').value = result.geminiApiKey;
    }
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
      // First, make sure we have the tree data
      if (!portalClassTree) {
        // Request portal class tree if not already loaded
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
          chrome.tabs.sendMessage(tabs[0].id, {action: 'getPortalClassTree'}, async (response) => {
            if (chrome.runtime.lastError || !response || !response.success) {
              showStatus('Failed to get portal class data. Please try again.', 'error');
              document.getElementById('loading-spinner').style.display = 'none';
              return;
            }

            portalClassTree = response.data;
            allPortalClasses = [...new Set(extractPortalClasses(response.data))];

            // Now generate the CSS
            await generateAndApplyCSS(apiKey, prompt);
          });
        });
      } else {
        // We already have the tree data, so generate CSS directly
        await generateAndApplyCSS(apiKey, prompt);
      }
    } catch (error) {
      console.error('Error generating CSS:', error);
      showStatus(`Error: ${error.message}`, 'error');
      document.getElementById('loading-spinner').style.display = 'none';
    }
  });

  // Add event listener for the Apply CSS button
  document.getElementById('apply-css-btn').addEventListener('click', () => {
    const css = document.getElementById('css-code').textContent;
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

  // Helper function to generate and apply CSS
  async function generateAndApplyCSS(apiKey, prompt) {
    try {
      // First analyze the DOM structure with Gemini
      const domAnalysis = await analyzeDOM(apiKey, prompt, portalClassTree);

      // Then generate CSS based on the analysis
      const css = await generateCSS(apiKey, prompt, domAnalysis, allPortalClasses);

      // Display the generated CSS
      document.getElementById('css-code').textContent = css;
      generatedCSS = css;

      showStatus('CSS generated successfully!', 'success');
    } catch (error) {
      console.error('Error in CSS generation:', error);
      showStatus(`Error: ${error.message}`, 'error');
    } finally {
      document.getElementById('loading-spinner').style.display = 'none';
    }
  }

  // Function to load tree data
  function loadTreeData() {
    // Request portal class tree from content script
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (!tabs[0]) {
        treeContainer.textContent = 'Unable to access the current tab.';
        return;
      }
      chrome.tabs.sendMessage(tabs[0].id, {action: 'getPortalClassTree'}, (response) => {
        if (chrome.runtime.lastError) {
          treeContainer.textContent = 'Could not establish connection with the page. Please refresh and try again.';
          return;
        }
        if (!response) {
          treeContainer.textContent = 'No response received from the page.';
          return;
        }
        if (!response.success) {
          treeContainer.textContent = `Error: ${response.error || 'Unknown error occurred'}`;
          return;
        }
        if (response.data) {
          portalClassTree = response.data;

          // Use the HTML tree renderer instead of text
          treeContainer.innerHTML = '';
          const treeHTML = createTreeNodeHTML(response.data);
          treeContainer.appendChild(treeHTML);

          // Extract all portal classes for CSS generation
          allPortalClasses = extractPortalClasses(response.data);
          // Remove duplicates
          allPortalClasses = [...new Set(allPortalClasses)];
        } else {
          treeContainer.textContent = 'No portal classes found on this page.';
        }
      });
    });
  }
});
