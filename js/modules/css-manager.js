// CSS generation and management
import { safeSendMessage } from '../utils/chrome-utils.js';
import { showStatus } from '../utils/ui-utils.js';
import { simplifyTree } from './tree.js';

/**
 * Generate CSS with OpenAI directly from DOM structure and tailwind classes
 * @param {string} apiKey - The OpenAI API key
 * @param {string} prompt - The user prompt
 * @param {object} portalClassTree - The portal class tree
 * @param {object} tailwindData - The tailwind class data
 * @param {string} currentCSS - The current CSS
 * @param {number} retryCount - The number of retries
 * @returns {Promise} - Promise that resolves with the generated CSS
 */
export async function generateCSSDirectly(apiKey, prompt, portalClassTree, tailwindData, currentCSS = "", retryCount = 0) {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 2000; // 2 seconds
  const url = 'https://api.openai.com/v1/chat/completions';

  const simplifiedTree = simplifyTree(portalClassTree);

  // Get the screenshot if possible
  let screenshot = null;
  showStatus('Capturing page screenshot... This may take a moment.', 'info');

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
        }, 10000); // 10 seconds timeout

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

  // Show status before generating CSS
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

  // Prepare the messages for OpenAI
  const messages = [
    {
      role: "system",
      content: "You are a CSS expert specializing in creating styles for web applications. Your job is to generate CSS code based on user requests that will help them achieve their desired design."
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `USER PROMPT: "${prompt}"

DOM STRUCTURE (focusing on classes matching pattern ^portal-.*$):
${retryCount === 0 ? JSON.stringify(simplifiedTree, null, 2) : JSON.stringify(simplifiedTree)}

CURRENT CSS FILE:
${currentCSS}

Your task:
1. Generate or modify the CSS code that fulfills the user's design request
2. ONLY use selectors that target classes matching the pattern ^portal-.*$ (classes that start with "portal-")
3. Do not use element selectors, IDs, or non-portal- classes or other tags like body, html, etc.
4. The final output should be a COMPLETE CSS file that includes all existing styles with your modifications
5. Include !important where necessary to override tailwind styles
6. Do NOT include comments in the CSS.

IMPORTANT: Return ONLY CSS code with no additional text.`
        }
      ]
    }
  ];

  // Add screenshot if available
  if (screenshot && retryCount === 0) {
    messages[1].content.push({
      type: "image_url",
      image_url: {
        url: screenshot
      }
    });
  }

  // Add reference images if available
  if (window.referenceImages && window.referenceImages.length > 0 && retryCount === 0) {
    const referenceContent = {
      role: "user",
      content: [
        {
          type: "text",
          text: `I'm providing ${window.referenceImages.length} reference image${window.referenceImages.length > 1 ? 's' : ''} showing the desired design. Please use ${window.referenceImages.length > 1 ? 'these' : 'this'} as the target visual style for the CSS you generate.`
        }
      ]
    };

    // Add each reference image to the content array
    window.referenceImages.forEach(img => {
      referenceContent.content.push({
        type: "image_url",
        image_url: {
          url: img.data
        }
      });
    });

    messages.push(referenceContent);
  }

  try {
    // Make the API request
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "o4-mini-2025-04-16",
        messages: messages,
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();

    // Extract CSS from the response
    if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
      const content = data.choices[0].message.content;

      // Extract CSS if it's wrapped in code blocks
      const cssMatch = content.match(/```css\n([\s\S]*?)\n```/) ||
                      content.match(/```\n([\s\S]*?)\n```/);

      if (cssMatch && cssMatch[1]) {
        showStatus('CSS generated successfully!', 'success');
        return cssMatch[1];
      }

      // If no code block but looks like CSS, return as is
      if (content.includes('{') && content.includes('}')) {
        showStatus('CSS generated successfully!', 'success');
        return content;
      }

      throw new Error('No CSS found in the response');
    } else {
      throw new Error('Invalid response format from API');
    }
  } catch (error) {
    console.error('Error generating CSS:', error);

    // If we've exceeded retries or the error isn't retryable, propagate it
    if (retryCount >= MAX_RETRIES ||
        !error.message.includes('overloaded') && !error.message.includes('rate limit')) {
      showStatus(`Error: ${error.message}`, 'error');
      throw error;
    }

    // Otherwise retry with a delay and simplified payload
    showStatus(`API busy (attempt ${retryCount + 1}/${MAX_RETRIES + 1}). Retrying...`, 'info');
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
    return generateCSSDirectly(apiKey, prompt, portalClassTree, tailwindData, currentCSS, retryCount + 1);
  }
}
