import { makeGeminiRequest } from '@/utils/gemini';
import type { GeminiMessage } from '@/utils/gemini';

export async function generateEvaluationWithGemini(
  apiKey: string,
  prompt: string,
  _currentCSS: string,
  _referenceImageUrl: string | undefined,
  currentScreenshot: string,
  _computedStyles: Record<string, Record<string, string>>
): Promise<string | null> {
  try {
    // Create the message parts
    const parts: GeminiMessage['parts'] = [{ text: prompt }];

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
      temperature: 0.2,
    });

    return response;
  } catch (error) {
    console.error('Error generating evaluation with Gemini:', error);
    return null;
  }
}
