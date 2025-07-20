import { makeGeminiRequest } from '@/utils/gemini';
import type { GeminiMessage } from '@/utils/gemini';

export async function generateEvaluationWithGemini(
  apiKey: string,
  prompt: string,
  currentCSS: string,
  referenceImageUrl: string | undefined,
  currentScreenshot: string,
  computedStyles: Record<string, Record<string, string>>
): Promise<string | null> {
  try {
    const parts: GeminiMessage['parts'] = [
      {
        text: `${prompt}

CURRENT CSS:
${currentCSS}

COMPUTED STYLES:
${JSON.stringify(computedStyles, null, 2)}`,
      },
    ];

    if (referenceImageUrl) {
      const referenceImageData = referenceImageUrl.split(',')[1];
      if (referenceImageData) {
        parts.push({
          inline_data: {
            mime_type: 'image/png',
            data: referenceImageData,
          },
        });
      }
    }

    if (currentScreenshot) {
      const currentImageData = currentScreenshot.split(',')[1];
      if (currentImageData) {
        parts.push({
          inline_data: {
            mime_type: 'image/png',
            data: currentImageData,
          },
        });
      }
    }

    const message: GeminiMessage = {
      role: 'user',
      parts,
    };

    const response = await makeGeminiRequest({
      apiKey,
      messages: [message],
      modelName: 'gemini-1.5-pro',
      temperature: 0.2,
    });

    return response;
  } catch (error) {
    console.error('Error generating evaluation with Gemini:', error);
    return null;
  }
}
