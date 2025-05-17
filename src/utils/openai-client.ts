import type { TreeNode, TailwindClassData } from '../types';
import { getEnvVariable } from '../utils/environment';

/**
 * Get the stored OpenAI API key
 * @returns Promise resolving to the API key or null if not set
 */
export const getOpenAIApiKey = async (): Promise<string | null> => {
  try {
    // Use the environment variable function instead of direct storage access
    // to align with how the API key is handled throughout the application
    const apiKey = await getEnvVariable('OPENAI_API_KEY');
    return apiKey || null;
  } catch (error) {
    console.error('Error getting OpenAI API key:', error);
    return null;
  }
};

/**
 * Check if an image data URL is valid
 * @param imageData The image data URL
 * @returns Whether the data URL is valid
 */
export const isValidImageData = (imageData: string): boolean => {
  return (
    typeof imageData === 'string' &&
    imageData.startsWith('data:image/') &&
    imageData.includes('base64,')
  );
};

/**
 * Generate a prompt using OpenAI API based on reference image and current screenshot
 * @param apiKey The OpenAI API key
 * @param referenceImage The reference image data URL
 * @param currentScreenshot The current screenshot data URL
 * @returns Promise resolving to the generated prompt
 */
export const generatePromptWithAI = async (
  apiKey: string,
  referenceImage: string,
  currentScreenshot: string,
): Promise<string> => {
  const url = 'https://api.openai.com/v1/chat/completions';

  // Prepare the messages for OpenAI
  const messages = [
    {
      role: 'system',
      content:
        'You are an expert in visual design analysis. Your task is to analyze two images - a reference design and the current state - and create a detailed prompt for a CSS generator that will help transform the current state to match the reference design.',
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `I need you to analyze these two images and create a detailed prompt that will be used by another AI to generate CSS.

INSTRUCTIONS:
1. The FIRST image is the REFERENCE design (what we want to achieve)
2. The SECOND image is the CURRENT state (what we need to transform)
3. Create a detailed, specific prompt that describes all the visual changes needed to make the current design match the reference.
4. Focus on ALL visual aspects: colors, typography, spacing, alignment, effects, borders, etc.
5. Be precise with colors (suggest hex values when possible), sizes, and specific visual details
6. Remember that the CSS generator will ONLY be able to use class selectors that start with "portal-"
7. The prompt should be clear, specific, and actionable - enabling the CSS generator to create pixel-perfect matching CSS
8. The prompt should acknowledge that the CSS generator will have access to:
   - A tree structure of all portal-* classes
   - Existing Tailwind classes applied to these elements
   - Both images (reference and current)

GENERATE ONLY THE PROMPT TEXT with no additional explanations or markdown formatting.`,
        },
        {
          type: 'image_url',
          image_url: {
            url: referenceImage,
          },
        },
        {
          type: 'image_url',
          image_url: {
            url: currentScreenshot,
          },
        },
      ],
    },
  ];

  try {
    // Make the API request
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: messages,
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `API error: ${errorData.error?.message || response.statusText}`,
      );
    }

    const data = await response.json();

    if (
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content
    ) {
      return data.choices[0].message.content.trim();
    } else {
      throw new Error('Invalid response format from API');
    }
  } catch (error) {
    console.error('Error generating prompt:', error);
    throw error;
  }
};

// Define types for OpenAI message content
type TextContent = {
  type: 'text';
  text: string;
};

type ImageContent = {
  type: 'image_url';
  image_url: {
    url: string;
  };
};

type MessageContent = TextContent | ImageContent;

/**
 * Generate CSS using OpenAI API
 * @param apiKey The OpenAI API key
 * @param prompt The user prompt
 * @param portalClassTree The portal class tree
 * @param tailwindData The tailwind class data
 * @param currentCSS The current CSS
 * @param retryCount The retry count (default 0)
 * @returns Promise resolving to the generated CSS
 */
export const generateCSSWithAI = async (
  apiKey: string,
  prompt: string,
  portalClassTree: TreeNode,
  tailwindData: TailwindClassData,
  currentCSS: string = '',
  retryCount: number = 0,
  referenceImage?: string,
  currentScreenshot?: string,
): Promise<string> => {
  const url = 'https://api.openai.com/v1/chat/completions';

  // Simplify the tailwind data to only show essential information
  const simplifiedTailwindData: Record<string, string[]> = {};
  if (tailwindData) {
    Object.keys(tailwindData).forEach((selector) => {
      if (/^portal-.*$/.test(selector)) {
        simplifiedTailwindData[selector] = tailwindData[selector];
      }
    });
  }

  // Create a simplified version of the tree for the prompt
  const simplifiedTree = JSON.stringify(portalClassTree, null, 2);

  // Improved prompt for pixel-perfect matching and visual fidelity
  let improvedPrompt = `${prompt}\n\nIMPORTANT: The goal is to make the current design visually match the desired outcome. Focus on pixel-perfect matching of color, spacing, font, and layout. Do not ignore small differences. Only use the provided class names. If unsure, err on the side of making more changes.`;

  // Add iteration context if this isn't the first attempt
  if (retryCount > 0) {
    improvedPrompt += `\n\nThis is iteration ${retryCount + 1}. The previous CSS didn't fully match the reference image. Please make additional refinements to achieve better visual matching.`;
  }

  // Build the content array
  const contentArray: MessageContent[] = [
    {
      type: 'text',
      text: `USER REQUEST: "${improvedPrompt}"

DOM STRUCTURE:
The following is a tree of elements with their portal-* classes. Use these class names in your CSS selectors.
${simplifiedTree}

TAILWIND DATA:
Some elements already have Tailwind classes applied. Your CSS needs to override these when necessary.
${Object.keys(simplifiedTailwindData).length > 0 ? JSON.stringify(simplifiedTailwindData, null, 2) : 'No Tailwind data available.'}

CURRENT CSS FILE:
${currentCSS ? currentCSS : 'No CSS applied yet.'}

INSTRUCTIONS:
1. Write CSS that will transform the current design to match the target design.
2. ONLY create selectors that target classes matching the pattern ^portal-.*$ (classes that start with "portal-")
3. Ensure your CSS is pixel-perfect and precisely matches the visual design.
4. Do not use element selectors, IDs, or non-portal- classes.
5. Include !important where necessary to override existing styles.
6. Your output must be a COMPLETE CSS file including:
   - ${currentCSS ? 'All existing styles with your necessary modifications and improvements' : 'All necessary styles to match the reference design'}
   - New styles organized in logical sections
   - Comments explaining your styling approach and changes
7. Focus on ALL visual aspects:
   - Colors (backgrounds, text, borders, etc.)
   - Typography (size, weight, family, spacing)
   - Padding, margins, alignment
   - Shadows, effects, and transitions
   - Border radius and border styling
8. RESPOND ONLY WITH VALID CSS CODE. No explanations, no markdown, only the CSS code.
${retryCount > 0 ? '9. This is iteration ' + (retryCount + 1) + '. Improve upon the previous CSS to better match the reference image.' : ''}`,
    },
  ];

  // Add images if provided
  if (referenceImage && isValidImageData(referenceImage)) {
    contentArray.push({
      type: 'image_url',
      image_url: {
        url: referenceImage,
      },
    });
  }

  if (currentScreenshot && isValidImageData(currentScreenshot)) {
    contentArray.push({
      type: 'image_url',
      image_url: {
        url: currentScreenshot,
      },
    });
  }

  // Prepare the messages for OpenAI
  const messages = [
    {
      role: 'system',
      content:
        'You are an expert CSS developer specializing in pixel-perfect visual implementation. Your task is to generate CSS that will transform a web page to match a target design.',
    },
    {
      role: 'user',
      content: contentArray,
    },
  ];

  try {
    // Make the API request
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: messages,
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `API error: ${errorData.error?.message || response.statusText}`,
      );
    }

    const data = await response.json();

    if (
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content
    ) {
      let content = data.choices[0].message.content;

      // Clean the response by removing markdown code blocks if present
      content = content
        .replace(/```css\s*/g, '')
        .replace(/```\s*$/g, '')
        .replace(/```/g, '')
        .trim();

      return content;
    } else {
      throw new Error('Invalid response format from API');
    }
  } catch (error) {
    console.error('Error generating CSS:', error);
    throw error;
  }
};

/**
 * Evaluate CSS results using OpenAI API
 * @param apiKey The OpenAI API key
 * @param referenceImage The reference image data URL
 * @param resultScreenshot The screenshot with applied CSS
 * @param currentCSS The current applied CSS
 * @returns Promise resolving to evaluation results {isMatch: boolean, feedback: string}
 */
export const evaluateCSSResultWithAI = async (
  apiKey: string,
  referenceImage: string,
  resultScreenshot: string,
  currentCSS: string,
): Promise<{ isMatch: boolean; feedback: string }> => {
  const url = 'https://api.openai.com/v1/chat/completions';

  // Prepare the messages for OpenAI
  const messages = [
    {
      role: 'system',
      content:
        'You are an expert in visual design analysis and CSS. Your task is to evaluate if the applied CSS has successfully transformed the page to match the reference design. Be thorough in your analysis but constructive in your feedback for what needs improvement.',
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `I've applied CSS to a page to make it match a reference design. I need you to evaluate how well the transformation worked and provide feedback for any needed improvements.

INSTRUCTIONS:
1. The FIRST image is the REFERENCE design (what we want to achieve)
2. The SECOND image is the CURRENT state (with the applied CSS)
3. Analyze both images and determine if they visually match closely enough
4. Use a high standard for "match" - look for pixel-perfect matching of:
   - Colors (backgrounds, text, borders)
   - Typography (size, weight, family, spacing)
   - Spacing (padding, margins, alignment)
   - Size and position of elements
   - Visual effects (shadows, borders, etc.)
5. If they don't match well enough, provide specific, actionable feedback focusing on:
   - What elements need to be changed
   - What specific CSS properties need to be adjusted
   - How they need to be adjusted (be specific with color values, sizes, etc.)
6. Here is the CSS that was applied:

\`\`\`css
${currentCSS}
\`\`\`

RESPOND IN THE FOLLOWING JSON FORMAT:
{
  "isMatch": true/false,
  "feedback": "If isMatch is true, simply return 'DevRev'. If isMatch is false, provide specific, detailed feedback on what still needs to be improved."
}`,
        },
        {
          type: 'image_url',
          image_url: {
            url: referenceImage,
          },
        },
        {
          type: 'image_url',
          image_url: {
            url: resultScreenshot,
          },
        },
      ],
    },
  ];

  try {
    // Make the API request
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: messages,
        temperature: 0.5, // Lower temperature for more precise evaluation
        max_tokens: 1500, // Increased for more detailed feedback
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `API error: ${errorData.error?.message || response.statusText}`,
      );
    }

    const data = await response.json();

    if (
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content
    ) {
      try {
        const result = JSON.parse(data.choices[0].message.content);
        return {
          isMatch: result.isMatch,
          feedback: result.isMatch ? 'DevRev' : result.feedback,
        };
      } catch (error) {
        console.error('Error parsing JSON response:', error);
        return {
          isMatch: false,
          feedback: 'Error parsing evaluation result',
        };
      }
    } else {
      throw new Error('Invalid response format from API');
    }
  } catch (error) {
    console.error('Error evaluating CSS result:', error);
    throw error;
  }
};
