import { useState, useEffect } from 'react';
import { PromptInput } from './prompt-input';
import { CssEditor } from './css-editor';
import { useAppContext } from '@/contexts';
import { getEnvVariable } from '@/utils/environment';
import { AlertCircle } from 'lucide-react';

export const CustomizeView = () => {
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  const { setApiKey, apiKey } = useAppContext();

  // Check if API key is set whenever this component is shown or apiKey context changes
  useEffect(() => {
    const checkApiKey = async () => {
      const key = await getEnvVariable('OPENAI_API_KEY');
      if (!key) {
        setApiKeyMissing(true);
      } else {
        setApiKeyMissing(false);
        setApiKey(key);
      }
    };

    checkApiKey();
  }, [setApiKey, apiKey]);

  return (
    <div className="pb-4 h-full flex flex-col gap-2">
      {apiKeyMissing && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-2 mb-2 flex items-center gap-2">
          <AlertCircle size={16} className="text-amber-500" />
          <span className="text-sm text-amber-800">
            OpenAI API key not found. Please set it in the Settings tab.
          </span>
        </div>
      )}
      <PromptInput />
      <CssEditor />
    </div>
  );
};
