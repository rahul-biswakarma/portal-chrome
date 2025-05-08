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

// When popup is opened, request portal class tree from content script
document.addEventListener('DOMContentLoaded', () => {
  // Set up tab switching
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active class from all tabs and content
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      // Add active class to clicked tab and corresponding content
      tab.classList.add('active');
      const tabName = tab.getAttribute('data-tab');
      document.getElementById(`${tabName}-tab`).classList.add('active');
    });
  });

  // Create a pre element for text display
  const pre = document.createElement('pre');
  pre.style.whiteSpace = 'pre';
  pre.style.margin = '0';
  pre.style.fontFamily = 'monospace';
  document.getElementById('tree-container').appendChild(pre);

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

  // Save API key
  document.getElementById('save-key-btn').addEventListener('click', () => {
    const apiKey = document.getElementById('api-key').value.trim();
    if (apiKey) {
      chrome.storage.local.set({ geminiApiKey: apiKey }, () => {
        showStatus('API key saved successfully!', 'success');
      });
    } else {
      showStatus('Please enter a valid API key', 'error');
    }
  });

  // Set up CSS generation button
  const generateBtn = document.getElementById('generate-btn');
  generateBtn.addEventListener('click', async () => {
    const userPrompt = document.getElementById('user-prompt').value;
    if (userPrompt.trim() === '') {
      showStatus('Please enter a prompt to generate CSS', 'error');
      return;
    }

    // Get API key
    const apiKey = document.getElementById('api-key').value.trim();
    if (!apiKey) {
      showStatus('Please enter your Gemini API key in the Settings tab', 'error');
      return;
    }

    // Show loading spinner
    const spinner = document.getElementById('loading-spinner');
    spinner.style.display = 'inline-block';
    document.getElementById('css-code').textContent = 'Generating CSS...';

    try {
      // First LLM call: Analyze DOM and extract relevant information
      const domAnalysis = await analyzeDOM(apiKey, userPrompt, portalClassTree);

      // Second LLM call: Generate CSS based on the analysis
      generatedCSS = await generateCSS(apiKey, userPrompt, domAnalysis, allPortalClasses);

      // Display the generated CSS
      document.getElementById('css-code').textContent = generatedCSS;
      showStatus('CSS generated successfully!', 'success');
    } catch (error) {
      document.getElementById('css-code').textContent = '/* Error generating CSS */';
      showStatus(`Error: ${error.message}`, 'error');
    } finally {
      // Hide loading spinner
      spinner.style.display = 'none';
    }
  });

  // Set up Apply CSS button
  document.getElementById('apply-css-btn').addEventListener('click', () => {
    const css = document.getElementById('css-code').textContent;
    if (css && css !== '/* CSS will appear here after generation */' && css !== '/* Error generating CSS */') {
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'applyCSS',
          css: css
        }, (response) => {
          if (chrome.runtime.lastError) {
            showStatus('Error applying CSS: ' + chrome.runtime.lastError.message, 'error');
            return;
          }
          if (response && response.success) {
            showStatus('CSS applied successfully!', 'success');
          } else {
            showStatus('Error applying CSS to the page', 'error');
          }
        });
      });
    } else {
      showStatus('Please generate CSS first', 'error');
    }
  });

  // Request portal class tree from content script
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (!tabs[0]) {
      pre.textContent = 'Unable to access the current tab.';
      return;
    }
    chrome.tabs.sendMessage(tabs[0].id, {action: 'getPortalClassTree'}, (response) => {
      if (chrome.runtime.lastError) {
        pre.textContent = 'Could not establish connection with the page. Please refresh and try again.';
        return;
      }
      if (!response) {
        pre.textContent = 'No response received from the page.';
        return;
      }
      if (!response.success) {
        pre.textContent = `Error: ${response.error || 'Unknown error occurred'}`;
        return;
      }
      if (response.data) {
        portalClassTree = response.data;
        pre.textContent = createTreeNode(response.data);
        // Extract all portal classes for CSS generation
        allPortalClasses = extractPortalClasses(response.data);
        // Remove duplicates
        allPortalClasses = [...new Set(allPortalClasses)];
      } else {
        pre.textContent = 'No portal classes found on this page.';
      }
    });
  });
});
