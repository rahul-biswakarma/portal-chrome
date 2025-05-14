import { showStatus } from './ui.js';
import { simplifyTree } from './tree.js';
import { dataURLtoBlob, captureScreenshot, saveScreenshot, captureAndSaveScreenshot } from './screenshot.js';

/**
 * Validate image data to ensure it's a valid base64 image
 * @param {string} imageData - The image data as a base64 string
 * @returns {boolean} Whether the image data is valid
 */
export function isValidImageData(imageData) {
  if (!imageData || typeof imageData !== 'string') {
    return false;
  }

  // Check format
  if (!imageData.startsWith('data:image')) {
    return false;
  }

  // Check if it has base64 data
  const parts = imageData.split(',');
  if (parts.length !== 2 || !parts[1] || parts[1].length < 10) {
    return false;
  }

  return true;
}

/**
 * Upload an image to Gemini API
 * @param {string} apiKey - The Gemini API key
 * @param {string} imageData - The image data as a base64 string
 * @param {string} displayName - The display name for the image
 * @returns {Promise<string|null>} Promise that resolves with the file URI or null if upload failed
 */
export async function uploadImageToGemini(apiKey, imageData, displayName = 'IMAGE') {
  if (!isValidImageData(imageData)) {
    console.error('Invalid image data provided for upload');
    return null;
  }

  try {
    // Convert base64 to blob
    const blob = dataURLtoBlob(imageData);

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
          display_name: displayName
        }
      })
    });

    // Extract upload URL from headers
    const uploadUrl = uploadUrlResponse.headers.get('X-Goog-Upload-URL');

    if (!uploadUrl) {
      throw new Error('Failed to get upload URL');
    }

    // Upload the file
    showStatus(`Uploading ${displayName.toLowerCase()} to AI...`, 'info');
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
      throw new Error(`Failed to upload ${displayName.toLowerCase()}`);
    }

    const fileInfo = await uploadResponse.json();
    return fileInfo.file.uri;
  } catch (error) {
    console.error(`Error uploading ${displayName.toLowerCase()}:`, error);
    showStatus(`Error uploading ${displayName.toLowerCase()}. Proceeding without it.`, 'info');
    return null;
  }
}

/**
 * Analyze reference image and current page screenshot to generate a description
 * @param {string} apiKey - The Gemini API key
 * @param {string} referenceImage - The reference image as a base64 string
 * @param {string|null} pageScreenshot - The current page screenshot as a base64 string (optional)
 * @returns {Promise<string>} Promise that resolves with the generated description
 */
export async function analyzeReferenceImage(apiKey, referenceImage, pageScreenshot = null) {
  try {
    // Validate images
    const isReferenceValid = isValidImageData(referenceImage);
    let isCurrentPageValid = pageScreenshot ? isValidImageData(pageScreenshot) : false;

    if (!isReferenceValid) {
      console.error('Reference image is invalid');
      throw new Error('Invalid reference image data');
    }

    if (pageScreenshot && !isCurrentPageValid) {
      console.warn('Current page screenshot is invalid - falling back to reference only');
      pageScreenshot = null;
      showStatus('Current page screenshot is invalid, using reference only', 'warning');
    }

    // Log if we have both images
    if (pageScreenshot) {
      console.log('Both images validated successfully');
      showStatus('Comparing reference design with current page...', 'info');
    } else {
      console.log('Only sending reference image to API - no current page screenshot');
      showStatus('Analyzing reference design only (no current page)...', 'info');
    }

    // Call the Gemini API
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

    // Prepare the payload
    const payload = {
      contents: [{
        parts: [
          // Image ordering is important - reference design FIRST, current page SECOND
          // Add reference image (ALWAYS first)
          {
            inline_data: {
              mime_type: referenceImage.split(';')[0].split(':')[1],
              data: referenceImage.split(',')[1]
            }
          },
          // Add current page screenshot if available (ALWAYS second)
          ...(pageScreenshot ? [{
            inline_data: {
              mime_type: pageScreenshot.split(';')[0].split(':')[1],
              data: pageScreenshot.split(',')[1]
            }
          }] : []),
          {
            text: `You are a world-class UI/UX design expert.

You have been given ${pageScreenshot ? "two screenshots" : "one screenshot"}:
- The target screenshot: This is the reference image showing the desired final appearance of the Help Center.
${pageScreenshot ? "- The current screenshot: This is how the Help Center currently looks." : ""}

${pageScreenshot ? "Your task:" : "Your task (with only the target screenshot available):"}
1. ${pageScreenshot ? "Carefully compare the target screenshot (reference) and the current screenshot." : "Analyze the target screenshot (reference) in detail."}
2. Identify and describe ${pageScreenshot ? "all visual differences between the two" : "key visual elements"}. Focus on:
   - Colors (backgrounds, text, buttons, etc.)
   - Spacing and alignment (margins, paddings, gaps)
   - Shapes and borders (rounded corners, outlines, etc.)
   - Typography (font size, weight, family, line height)
   - Layout and positioning of elements
   - Any other noticeable visual ${pageScreenshot ? "differences" : "characteristics"}
3. Do NOT mention or refer to CSS, HTML, DOM, class names, or any technical implementation details.
4. Use clear, simple, non-technical language that describes only what you see visually.
5. Prioritize the most noticeable ${pageScreenshot ? "differences" : "elements"} first.
6. Be as specific as possible (e.g., "${pageScreenshot ? "The button in the target screenshot is blue and larger, while in the current screenshot it is gray and smaller." : "The button is blue with white text and has rounded corners."}")

Output:
- Write a prompt that can be used for an LLM to generate CSS that will ${pageScreenshot ? "transform the current screenshot to match the target screenshot" : "implement the visual design shown in the target screenshot"}.
- The prompt should be a clear, structured description of the ${pageScreenshot ? "visual changes needed" : "visual design"}, referring to the ${pageScreenshot ? "screenshots as \"target screenshot\" and \"current screenshot\"" : "design as \"target screenshot\""} throughout.`
          }
        ]
      }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1024
      }
    };

    // Make the API request
    const response = await fetch(`${url}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'API request failed');
    }

    const data = await response.json();
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts) {
      throw new Error('Invalid response format from API');
    }

    // Get the generated prompt
    const generatedPrompt = data.candidates[0].content.parts[0].text;
    return generatedPrompt;
  } catch (error) {
    console.error('Error analyzing image:', error);
    throw error;
  }
}

/**
 * Generate CSS using Gemini API
 * @param {string} apiKey - The Gemini API key
 * @param {string} prompt - The user prompt
 * @param {Object} portalClassTree - The portal class tree
 * @param {Object} tailwindData - The tailwind class data
 * @param {string} currentCSS - The current CSS
 * @param {number} retryCount - The retry count
 * @returns {Promise<string>} Promise that resolves with the generated CSS
 */
export async function generateCSSWithAI(apiKey, prompt, portalClassTree, tailwindData, currentCSS = "", retryCount = 0) {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 2000; // 2 seconds
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

  // Create a simplified version of the tree for the LLM
  const simplifiedTree = simplifyTree(portalClassTree);

  // Get the screenshot if possible and save it automatically
  let screenshot = await captureAndSaveScreenshot('reference-analysis');

  // Show a new status before uploading
  if (screenshot) {
    showStatus('Preparing screenshot for AI analysis...', 'info');
  }

  // Prepare for file upload if we have a screenshot
  let fileUri = null;
  if (screenshot) {
    fileUri = await uploadImageToGemini(apiKey, screenshot, 'SCREENSHOT');
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

  // --- Improved prompt for pixel-perfect matching and visual fidelity ---
  const improvedPrompt = `${prompt}\n\nIMPORTANT: The goal is to make the current Help Center visually indistinguishable from the reference image(s). Focus on pixel-perfect matching of color, spacing, font, and layout. Do not ignore small differences. Only use the provided class names. If unsure, err on the side of making more changes.`;

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
            text: `You are an expert CSS developer specializing in pixel-perfect visual implementation.

${window.referenceImages.length > 0 ?
`I've provided ${window.referenceImages.length} target screenshot${window.referenceImages.length > 1 ? 's' : ''} showing the desired visual design.
These are your reference images - they show how the Help Center should look after your CSS changes.` : ""}

USER REQUEST: "${improvedPrompt}"

DOM STRUCTURE:
The following is a tree of elements with their portal-* classes. Use these class names in your CSS selectors.
${retryCount === 0 ? JSON.stringify(simplifiedTree, null, 2) : JSON.stringify(simplifiedTree)}

TAILWIND DATA:
Some elements already have Tailwind classes applied. Your CSS needs to override these when necessary.
${Object.keys(simplifiedTailwindData).length > 0 ? JSON.stringify(simplifiedTailwindData, null, 2) : "No Tailwind data available."}

CURRENT CSS FILE:
${currentCSS}

INSTRUCTIONS:
1. Write CSS that will transform the current design to match the target design (reference image).
2. ONLY create selectors that target classes matching the pattern ^portal-.*$ (classes that start with "portal-")
3. Ensure your CSS is pixel-perfect and precisely matches the visual design in the target screenshots.
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

FORMAT YOUR RESPONSE AS CSS CODE ONLY, NO EXPLANATIONS OUTSIDE THE CSS.`
          }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      topK: 32,
      topP: 0.95,
      maxOutputTokens: 8192,
    },
    safetySettings: [
      {
        category: "HARM_CATEGORY_HARASSMENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      },
      {
        category: "HARM_CATEGORY_HATE_SPEECH",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      },
      {
        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      },
      {
        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE"
      }
    ]
  };

  try {
    // Make the API request
    const response = await fetch(`${url}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();

    // Check if we have a valid response with text
    if (data.candidates &&
        data.candidates[0] &&
        data.candidates[0].content &&
        data.candidates[0].content.parts) {

      // Extract the CSS from the response
      const responseParts = data.candidates[0].content.parts;
      let cssText = '';

      // Look for the CSS in the response parts
      for (const part of responseParts) {
        if (part.text) {
          // Extract CSS code blocks from the text
          const cssMatches = part.text.match(/```css([\s\S]*?)```/g);
          if (cssMatches && cssMatches.length > 0) {
            // Use the first CSS block found
            cssText = cssMatches[0]
              .replace(/```css\n?/g, '') // Remove opening ```css
              .replace(/```$/g, '');     // Remove closing ```
            break;
          } else {
            // If no code blocks, use the entire text if it looks like CSS
            if (part.text.includes('{') && part.text.includes('}')) {
              cssText = part.text;
            }
          }
        }
      }

      if (cssText) {
        showStatus('CSS generated successfully!', 'success');
        return cssText;
      } else {
        throw new Error('No CSS found in the response');
      }
    } else {
      throw new Error('Invalid response format from API');
    }
  } catch (error) {
    console.error('Error generating CSS:', error);
    showStatus(`Error: ${error.message}`, 'error');

    // Retry with simplified payload if we haven't exceeded max retries
    if (retryCount < MAX_RETRIES) {
      showStatus(`Retrying with simplified request (${retryCount + 1}/${MAX_RETRIES})...`, 'info');
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return generateCSSWithAI(apiKey, prompt, portalClassTree, tailwindData, currentCSS, retryCount + 1);
    } else {
      throw new Error(`Failed after ${MAX_RETRIES} attempts: ${error.message}`);
    }
  }
}

/**
 * Analyze applied CSS and suggest improvements
 * @param {string} apiKey - The Gemini API key
 * @param {string} generatedCSS - The current CSS that was applied
 * @param {string} prompt - The original user prompt
 * @param {string|null} screenshot - Screenshot of the current page with CSS applied (optional)
 * @returns {Promise<string|null>} Promise that resolves with improved CSS or null if no improvements needed
 */
export async function analyzeCSSAndGetFeedback(apiKey, generatedCSS, prompt, screenshot = null) {
  try {
    // Apply CSS to the page
    const applyResponse = await new Promise((resolve, reject) => {
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (!tabs || !tabs[0]) {
          reject(new Error('No active tab found'));
          return;
        }

        chrome.tabs.sendMessage(tabs[0].id, {
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

    // Capture screenshot of the styled page and save it automatically
    showStatus('Capturing screenshot of the styled page for AI analysis...', 'info');
    screenshot = await captureAndSaveScreenshot('after-styling');

    // Prepare for file upload if we have a screenshot
    let fileUri = null;
    if (screenshot) {
      fileUri = await uploadImageToGemini(apiKey, screenshot, 'RESULT_SCREENSHOT');
    }

    // --- Improved feedback prompt for pixel-perfect matching and visual fidelity ---
    const improvedPrompt = `${prompt}\n\nIMPORTANT: The goal is to make the current Help Center visually indistinguishable from the reference image(s). Focus on pixel-perfect matching of color, spacing, font, and layout. Do not ignore small differences. Only use the provided class names. If unsure, err on the side of making more changes.`;

    // Create payload for feedback with clearer instructions
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

    showStatus(fileUri ?
      'Getting AI feedback on visual results...' :
      'Getting AI feedback on CSS code...', 'info');

    // Create another screenshot for feedback if we don't already have one
    if (!screenshot) {
      screenshot = await captureAndSaveScreenshot('for-feedback');
      if (screenshot) {
        // Try to upload this new screenshot
        fileUri = await uploadImageToGemini(apiKey, screenshot, 'FEEDBACK_SCREENSHOT');
      }
    }

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
            text: `You are a CSS expert evaluating the visual match between a target design and the current implementation.

ORIGINAL REQUEST: "${improvedPrompt}"

CURRENT CSS IMPLEMENTATION:
\`\`\`css
${generatedCSS}
\`\`\`

TASK:
1. ${fileUri ? "I've applied the CSS above to the page and taken a screenshot of the result (this is the CURRENT state)." : "I've applied the CSS above to the page but couldn't capture a screenshot."}
2. ${fileUri ? `Compare this CURRENT state against the TARGET design shown in the reference image(s).` : "Analyze the CSS code quality and make improvements where needed."}
3. Look for ANY visual discrepancies, no matter how small, between the CURRENT state and the TARGET design.

${fileUri ? `
EVALUATION INSTRUCTIONS:
1. Pixel-perfect matching: Compare every visual detail between the CURRENT state and TARGET design
2. Scrutinize: Colors, spacing, typography, borders, shadows, alignment, etc.
3. For each discrepancy, determine what CSS changes are needed to make the CURRENT match the TARGET
` : ""}

EXACTLY FOLLOW THIS RESPONSE FORMAT:
- If NO improvements are needed (the current state perfectly matches the target design), respond with ONLY the word "No".
- If ANY improvements ARE needed, respond with ONLY the complete improved CSS file, with no explanations or markdown formatting.

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
