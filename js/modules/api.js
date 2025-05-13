import { showStatus } from './ui.js';
import { simplifyTree } from './tree.js';
import { dataURLtoBlob, captureScreenshot } from './screenshot.js';

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

  // Get the screenshot if possible
  let screenshot = await captureScreenshot();

  // Show a new status before uploading
  if (screenshot) {
    showStatus('Preparing screenshot for AI analysis...', 'info');
  }

  // Prepare for file upload if we have a screenshot
  let fileUri = null;
  if (screenshot) {
    try {
      // Convert base64 to blob
      const blob = dataURLtoBlob(screenshot);

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
      showStatus('Uploading screenshot to AI...', 'info');
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
      showStatus('Screenshot uploaded successfully!', 'success');
    } catch (error) {
      console.error('Error uploading screenshot:', error);
      showStatus('Error uploading screenshot. Proceeding without it.', 'info');
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
8. Include comprehensive comments explaining your styling approach`
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
