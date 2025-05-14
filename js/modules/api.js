import { showStatus } from './ui.js';
import { simplifyTree } from './tree.js';
import { dataURLtoBlob, captureScreenshot, saveScreenshot, captureAndSaveScreenshot } from './screenshot.js';
import { safeSendMessage } from '../utils/chrome-utils.js';

/**
 * Validates if a string is a valid image data URL
 * @param {string} imageData - Data URL to validate
 * @returns {boolean} - Whether the string is a valid image data URL
 */
export function isValidImageData(imageData) {
  return typeof imageData === 'string' &&
         imageData.startsWith('data:image/') &&
         imageData.includes('base64,');
}

/**
 * Analyze a reference image to suggest CSS changes
 * @param {string} apiKey - The OpenAI API key
 * @param {string} referenceImage - Base64 encoded reference image
 * @param {string} pageScreenshot - Base64 encoded current page screenshot
 * @returns {Promise<string>} - Promise resolving to the suggested design changes
 */
export async function analyzeReferenceImage(apiKey, referenceImage, pageScreenshot = null) {
  try {
    const url = 'https://api.openai.com/v1/chat/completions';

    // Prepare the message content
    const messages = [
      {
        role: "system",
        content: "You are a visual design expert who analyzes web design references and produces detailed descriptions of their styling elements."
      }
    ];

    // Add reference image content
    if (isValidImageData(referenceImage)) {
      messages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: "This is reference image, i want to make my current page look like this."
          },
          {
            type: "image_url",
            image_url: {
              url: referenceImage
            }
          }
        ]
      });
    }

    // Add current page screenshot if available
    if (pageScreenshot && isValidImageData(pageScreenshot)) {
      messages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: "Here is what my current page looks like."
          },
          {
            type: "image_url",
            image_url: {
              url: pageScreenshot
            }
          }
        ]
      });
    }

    messages.push({
      role: "user",
      content: [
        {
          type: "text",
          text: "Please analyze the reference image and current page image and generate a prompt for another LLM to generate CSS. I will provide the LLM with the reference image, current image, our prompt, other info and rules likes use only specific classes along with list of all classes and pre-applied tailwind classes. Give me a prompt that will generate CSS that will make my current page look like the reference image. NOTE: do not include any CSS in the prompt, just the prompt for the other LLM."
        }
      ]
    });

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

    if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
      let content = data.choices[0].message.content;

      // Clean the response by removing markdown code blocks and formatting
      content = content
        // Remove ```text, ```prompt, or other language-specific code blocks
        .replace(/```(?:text|prompt|css|markdown|)\n/g, '')
        .replace(/```/g, '')
        // Remove any remaining markdown formatting if needed
        .replace(/\*\*/g, '')  // Bold
        .replace(/\*/g, '')    // Italic
        .replace(/\_\_/g, '')  // Bold
        .replace(/\_/g, '')    // Italic
        .trim();

      return content;
    } else {
      throw new Error('Invalid response format from API');
    }
  } catch (error) {
    console.error('Error analyzing reference image:', error);
    showStatus(`Error analyzing image: ${error.message}`, 'error');
    return "Could not analyze the image. Please try again or provide your own description.";
  }
}

/**
 * Generate CSS using OpenAI API
 * @param {string} apiKey - The OpenAI API key
 * @param {string} prompt - The user prompt
 * @param {Object} portalClassTree - The portal class tree
 * @param {Object} tailwindData - The tailwind class data
 * @param {string} currentCSS - The current CSS
 * @param {number} retryCount - The retry count
 * @returns {Promise<string>} Promise that resolves with the generated CSS
 */
export async function generateCSSWithAI(apiKey, prompt, portalClassTree, tailwindData, currentCSS = "", retryCount = 0) {
  const MAX_RETRIES = 5;
  const RETRY_DELAY = 2000; // 2 seconds
  const url = 'https://api.openai.com/v1/chat/completions';

  // Create a simplified version of the tree for the LLM
  const simplifiedTree = simplifyTree(portalClassTree);

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

  // --- Improved prompt for pixel-perfect matching and visual fidelity ---
  const improvedPrompt = `${prompt}\n\nIMPORTANT: The goal is to make the current design visually match the desired outcome. Focus on pixel-perfect matching of color, spacing, font, and layout. Do not ignore small differences. Only use the provided class names. If unsure, err on the side of making more changes.`;

  // Prepare the messages for OpenAI
  const messages = [
    {
      role: "system",
      content: "You are an expert CSS developer specializing in pixel-perfect visual implementation. Your task is to generate CSS that will transform a web page to match a target design."
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `USER REQUEST: "${improvedPrompt}"

DOM STRUCTURE:
The following is a tree of elements with their portal-* classes. Use these class names in your CSS selectors.
${retryCount === 0 ? JSON.stringify(simplifiedTree, null, 2) : JSON.stringify(simplifiedTree)}

TAILWIND DATA:
Some elements already have Tailwind classes applied. Your CSS needs to override these when necessary.
${Object.keys(simplifiedTailwindData).length > 0 ? JSON.stringify(simplifiedTailwindData, null, 2) : "No Tailwind data available."}

CURRENT CSS FILE:
${currentCSS}

INSTRUCTIONS:
1. Write CSS that will transform the current design to match the target design.
2. ONLY create selectors that target classes matching the pattern ^portal-.*$ (classes that start with "portal-")
3. Ensure your CSS is pixel-perfect and precisely matches the visual design.
4. Do not use element selectors, IDs, or non-portal- classes.
5. Include !important where necessary to override existing styles.
6. Your output must be a COMPLETE CSS file including:
   - All existing styles with your necessary modifications
   - New styles organized in logical sections
   - Comments explaining your styling approach and changes
7. Focus on ALL visual aspects:
   - Colors (backgrounds, text, borders, etc.)
   - Typography (size, weight, family, spacing)
   - Layout (positioning, margins, paddings)
   - Spacing (gaps between elements)
   - Borders and shapes (radius, width, style)

RETURN ONLY CSS CODE WITH NO ADDITIONAL TEXT OR EXPLANATIONS OUTSIDE OF CSS COMMENTS.`
        }
      ]
    }
  ];

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
    return generateCSSWithAI(apiKey, prompt, portalClassTree, tailwindData, currentCSS, retryCount + 1);
  }
}

/**
 * Analyze CSS and get feedback for improvements
 * @param {string} apiKey - The OpenAI API key
 * @param {string} generatedCSS - The generated CSS
 * @param {string} prompt - The original user prompt
 * @param {string} screenshot - Optional screenshot of the current page
 * @returns {Promise<string|null>} - Promise resolving to improved CSS or null if no improvements needed
 */
export async function analyzeCSSAndGetFeedback(apiKey, generatedCSS, prompt, screenshot = null) {
  try {
    const url = 'https://api.openai.com/v1/chat/completions';

    // Prepare the messages for OpenAI
    const messages = [
      {
        role: "system",
        content: "You are a CSS expert evaluating a web page styling. Your job is to improve CSS code to better match a target design."
      },
      {
        role: "user",
        content: [{
          type: "text",
          text: `ORIGINAL REQUEST: "${prompt}"

CURRENT CSS IMPLEMENTATION:
\`\`\`css
${generatedCSS}
\`\`\`

TASK:
1. ${screenshot ? "I've applied the CSS above to the page and taken a screenshot of the result." : "I've applied the CSS above to the page but couldn't capture a screenshot."}
2. ${screenshot ? `Compare this result against the intended design described in the original request.` : "Analyze the CSS code quality and make improvements where needed."}
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
        }]
      }
    ];

    // Add screenshot if available
    if (screenshot && isValidImageData(screenshot)) {
      messages[1].content.push({
        type: "image_url",
        image_url: {
          url: screenshot
        }
      });
    }

    // Add reference images if available
    if (window.referenceImages && window.referenceImages.length > 0) {
      const referenceContent = {
        role: "user",
        content: [
          {
            type: "text",
            text: `These are the reference images showing the target design. Compare with my current result and improve the CSS to match these better.`
          }
        ]
      };

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

    if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
      const feedbackText = data.choices[0].message.content.trim();

      // Process the response
      if (feedbackText === "No" || feedbackText.toLowerCase() === "no.") {
        showStatus('AI review: No improvements needed! The CSS looks good.', 'success');
        return null; // No improvements needed
      } else if (feedbackText.includes('{') && feedbackText.includes('}')) {
        showStatus('AI suggested CSS improvements! Applying updated styles...', 'info');

        // Extract CSS if it's wrapped in code blocks
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
    } else {
      throw new Error('Invalid response format from API');
    }
  } catch (error) {
    console.error('Error in feedback process:', error);
    showStatus(`Error getting feedback: ${error.message}`, 'error');
    return null; // Return null to indicate no changes
  }
}

/**
 * Generate CSS directly from DOM structure and tailwind classes
 * @param {string} apiKey - The API key
 * @param {string} prompt - The user prompt
 * @param {Object} portalClassTree - The portal class tree
 * @param {Object} tailwindData - The tailwind class data
 * @param {string} currentCSS - The current CSS
 * @param {number} retryCount - The retry count
 * @returns {Promise<string>} Promise that resolves with the generated CSS
 */
export async function generateCSSDirectly(apiKey, prompt, portalClassTree, tailwindData, currentCSS = "", retryCount = 0) {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 2000; // 2 seconds
  const url = 'https://api.openai.com/v1/chat/completions';

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

        // Use safeSendMessage to communicate with the content script
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

  // Prepare the messages for OpenAI
  const messages = [
    {
      role: "system",
      content: "You are an expert CSS developer specializing in pixel-perfect visual implementation. Your task is to generate CSS that will transform DevRev Help Center page to match a specific design request. NOTE: 'portal-public' is a special class that is only present if user is not logged in. So only use this class if mentioned in user prompt"
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `USER REQUEST: "${prompt}"

DOM STRUCTURE (focusing on classes matching pattern ^portal-.*$):
${retryCount === 0 ? JSON.stringify(simplifiedTree, null, 2) : JSON.stringify(simplifiedTree)}

TAILWIND DATA:
Some elements already have Tailwind classes applied. Your CSS needs to override these when necessary.
${Object.keys(simplifiedTailwindData).length > 0 ? JSON.stringify(simplifiedTailwindData, null, 2) : "No Tailwind data available."}

CURRENT CSS FILE:
${currentCSS}

Your task:
1. Generate or modify the CSS code that fulfills the user's design request
2. ONLY use selectors that target classes matching the pattern ^portal-.*$ (classes that start with "portal-")
3. Do not use element selectors, IDs, or non-portal- classes or other tags like body, html, etc.,
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
      const errorMessage = errorData.error?.message || response.statusText || 'Unknown error';
      throw new Error(`API error: ${errorMessage}`);
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
