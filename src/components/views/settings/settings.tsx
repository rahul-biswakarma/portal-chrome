import { useState, useEffect } from 'react';
import { getEnvVariable, setEnvVariable } from '../../../utils/environment';
import { useAppContext } from '@/contexts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const Settings = () => {
  const [apiKey, setApiKey] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { setApiKey: setContextApiKey } = useAppContext();

  useEffect(() => {
    // Load the API key on component mount
    const loadApiKey = async () => {
      try {
        const storedKey = await getEnvVariable('OPENAI_API_KEY');
        if (storedKey) {
          setApiKey(storedKey);
        }
      } catch (error) {
        console.error('Error loading API key:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadApiKey();
  }, []);

  const handleSaveApiKey = async () => {
    try {
      const trimmedKey = apiKey.trim();
      if (!trimmedKey) {
        alert('Please enter a valid API key');
        return;
      }

      // Store in chrome.storage.local (persists between sessions)
      await setEnvVariable('OPENAI_API_KEY', trimmedKey);

      // Also update React context (for current session)
      setContextApiKey(trimmedKey);

      setIsSaved(true);

      // Reset the saved indicator after 3 seconds
      setTimeout(() => {
        setIsSaved(false);
      }, 3000);
    } catch (error) {
      console.error('Error saving API key:', error);
    }
  };

  if (isLoading) {
    return <div className="p-4">Loading settings...</div>;
  }

  return (
    <div className="rounded-lg p-2">
      <h3 className="text-lg font-medium mb-2">Settings</h3>

      <div className="mb-4">
        <label
          htmlFor="apiKey"
          className="block text-sm font-medium text-foreground mb-1"
        >
          OpenAI API Key
        </label>
        <div className="flex gap-1">
          <Input
            type="password"
            id="apiKey"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
          />
          <Button onClick={handleSaveApiKey}>Save</Button>
        </div>
        <p className="mt-1 text-sm text-secondary-foreground">
          Your API key is stored securely in your browser's local storage and
          in-memory during the current session. It is never sent to our servers
          or stored elsewhere.
        </p>
        {isSaved && (
          <p className="mt-2 text-sm text-green-600">
            API key saved successfully!
          </p>
        )}
      </div>
    </div>
  );
};
