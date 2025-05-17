import { useState, useEffect } from 'react';
import { getEnvVariable, setEnvVariable } from '../../../utils/environment';

export const Settings = () => {
  const [apiKey, setApiKey] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

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
      await setEnvVariable('OPENAI_API_KEY', apiKey.trim());
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
    <div className="mt-4 p-4 bg-gray-50 rounded-lg">
      <h3 className="text-lg font-medium mb-2">Settings</h3>

      <div className="mb-4">
        <label
          htmlFor="apiKey"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          OpenAI API Key
        </label>
        <div className="flex">
          <input
            type="password"
            id="apiKey"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            onClick={handleSaveApiKey}
            className="px-4 py-2 bg-blue-600 text-white font-medium rounded-r-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Save
          </button>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Your API key is stored locally and is never sent to our servers
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
