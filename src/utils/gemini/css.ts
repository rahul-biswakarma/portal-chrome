import type { TreeNode } from '../../types';
import { makeGeminiRequest } from './client';
import type { GeminiMessage } from './types';

// Constants for prompts
const EVALUATION_PROMPT = `I've applied CSS to transform a page to match a reference design. I need you to evaluate the results and provide specific improvements if needed.

CURRENT CSS:
\`\`\`css
{currentCSS}
\`\`\`

EVALUATION INSTRUCTIONS:
1. Compare the visual appearance of both images with pixel-perfect precision
2. Focus on these key aspects that may need improvement:
   - Colors (backgrounds, text, borders)
   - Typography (size, weight, family, spacing)
   - Layout & Spacing (padding, margins, positioning)
   - Visual Effects (shadows, borders, border-radius)
   - Overall fidelity to the reference design

RESPONSE FORMAT:
- If the current state matches the reference design well (90%+ accuracy), respond with ONLY the word "DONE"
- If improvements are needed, respond with COMPLETE, VALID CSS that incorporates ALL existing styles plus your changes.
- YOU MUST ALWAYS RETURN THE FULL CSS FILE, not just the changes or additions.
- Do not include any explanations, just the CSS code.

IMPORTANT CSS GUIDELINES:
1. Your CSS must ONLY use selectors targeting classes starting with "portal-"
2. Do NOT include any comments in the CSS.
3. Include precise values (exact colors, measurements) to achieve a pixel-perfect match
4. Use proper CSS specificity (e.g., .portal-card.portal-card) instead of !important when possible
5. Only use !important for critical overrides that cannot be achieved with specificity

NOTE: The FIRST image is the REFERENCE design, the SECOND image is the CURRENT state.

RESPOND ONLY WITH VALID CSS CODE OR THE SINGLE WORD "DONE".`;

const PROMPT_GENERATION_PROMPT = `Please analyze these images and generate a detailed prompt for CSS styling. The first image is the reference design, and the second is the current state. Focus on specific visual differences and provide clear instructions for CSS changes needed.`;

/**
 * Generate CSS using Gemini API
 */
export const generateCSSWithGemini = async (
  apiKey: string,
  prompt: string,
  tree: TreeNode,
  tailwindData: Record<string, string[]>,
  currentCSS: string,
  referenceImage?: string | null,
  currentScreenshot?: string,
  computedStyles?: Record<string, Record<string, string>>,
  sessionId?: string
): Promise<string> => {
  // Create the message parts with tree and tailwind data
  const parts: GeminiMessage['parts'] = [
    {
      text: `${prompt}\n\nTree Structure:\n${JSON.stringify(tree, null, 2)}\n\nTailwind Data:\n${JSON.stringify(tailwindData, null, 2)}\n\nCurrent CSS:\n${currentCSS}\n\nComputed Styles:\n${JSON.stringify(computedStyles, null, 2)}`,
    },
  ];

  // Add reference image if available
  if (referenceImage) {
    parts.push({
      inline_data: {
        mime_type: 'image/png',
        data: referenceImage.split(',')[1],
      },
    });
  }

  // Add current screenshot if available
  if (currentScreenshot) {
    parts.push({
      inline_data: {
        mime_type: 'image/png',
        data: currentScreenshot.split(',')[1],
      },
    });
  }

  // Create the message
  const message: GeminiMessage = {
    role: 'user',
    parts,
  };

  // Make the request
  const response = await makeGeminiRequest({
    apiKey,
    messages: [message],
    modelName: 'gemini-pro-vision',
    sessionId,
    temperature: 0.2,
  });

  return response;
};

/**
 * Evaluate CSS results using Gemini API
 */
export const evaluateCSSResultWithGemini = async (
  apiKey: string,
  referenceImage: string,
  resultScreenshot: string,
  currentCSS: string,
  tree: TreeNode,
  tailwindData: Record<string, string[]>,
  computedStyles?: Record<string, Record<string, string>>,
  sessionId?: string
): Promise<{ isMatch: boolean; feedback: string }> => {
  // Create the message parts with tree and tailwind data
  const parts: GeminiMessage['parts'] = [
    {
      text: `${EVALUATION_PROMPT.replace('{currentCSS}', currentCSS)}\n\nTree Structure:\n${JSON.stringify(tree, null, 2)}\n\nTailwind Data:\n${JSON.stringify(tailwindData, null, 2)}\n\nComputed Styles:\n${JSON.stringify(computedStyles, null, 2)}`,
    },
  ];

  // Add reference image
  parts.push({
    inline_data: {
      mime_type: 'image/png',
      data: referenceImage.split(',')[1],
    },
  });

  // Add result screenshot
  parts.push({
    inline_data: {
      mime_type: 'image/png',
      data: resultScreenshot.split(',')[1],
    },
  });

  // Create the message
  const message: GeminiMessage = {
    role: 'user',
    parts,
  };

  // Make the request
  const response = await makeGeminiRequest({
    apiKey,
    messages: [message],
    modelName: 'gemini-pro-vision',
    sessionId,
    temperature: 0.2,
  });

  if (response.trim() === 'DONE') {
    return {
      isMatch: true,
      feedback: 'CSS matches reference design',
    };
  }

  return {
    isMatch: false,
    feedback: response,
  };
};

/**
 * Generate a prompt using Gemini API based on reference image and current screenshot
 */
export const generatePromptWithGemini = async (
  apiKey: string,
  referenceImage: string | null,
  currentScreenshot: string,
  currentCSS: string = '',
  computedStyles?: Record<string, Record<string, string>>,
  sessionId?: string
): Promise<string> => {
  // Create the message parts
  const parts: GeminiMessage['parts'] = [
    {
      text: `${PROMPT_GENERATION_PROMPT}\n\nCurrent CSS:\n${currentCSS}\n\nComputed Styles:\n${JSON.stringify(computedStyles, null, 2)}`,
    },
  ];

  // Add reference image if available
  if (referenceImage) {
    parts.push({
      inline_data: {
        mime_type: 'image/png',
        data: referenceImage.split(',')[1],
      },
    });
  }

  // Add current screenshot
  parts.push({
    inline_data: {
      mime_type: 'image/png',
      data: currentScreenshot.split(',')[1],
    },
  });

  // Create the message
  const message: GeminiMessage = {
    role: 'user',
    parts,
  };

  // Make the request
  const response = await makeGeminiRequest({
    apiKey,
    messages: [message],
    modelName: 'gemini-pro-vision',
    sessionId,
    temperature: 0.2,
  });

  return response;
};
