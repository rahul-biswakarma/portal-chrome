import { useState, useEffect } from 'react';
import { PromptInput } from './prompt-input';
import { useAppContext } from '@/contexts';
import { getEnvVariable } from '@/utils/environment';
import { AlertCircle } from 'lucide-react';

export const CustomizeView = () => {
  const [geminiKeyMissing, setGeminiKeyMissing] = useState(false);
  const { setGeminiKey, geminiKey } = useAppContext();

  // Check if API key is set whenever this component is shown or apiKey context changes
  useEffect(() => {
    const checkApiKey = async () => {
      const key = await getEnvVariable('GEMINI_API_KEY');
      if (!key) {
        setGeminiKeyMissing(true);
      } else {
        setGeminiKeyMissing(false);
        setGeminiKey(key);
      }
    };

    checkApiKey();
  }, [setGeminiKey, geminiKey]);

  return (
    <div className="pb-12 h-full flex flex-col gap-2 overflow-y-auto p-2">
      {geminiKeyMissing && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-2 mb-2 flex items-center gap-2">
          <AlertCircle size={16} className="text-amber-500" />
          <span className="text-sm text-amber-800">
            Gemini API key not found. Please set it in the Settings tab.
          </span>
        </div>
      )}
      <PromptInput />
      <div className="mt-4 text-center text-sm text-muted-foreground">
        CSS editor is now available in the "CSS Editor" tab
      </div>
    </div>
  );
};
