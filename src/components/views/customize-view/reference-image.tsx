import { useState } from 'react';
import { getActiveTab } from '../../../utils/chrome-utils';
import { processReferenceImage } from '../../../utils/image-to-css';
import { getPageStructure } from '../../../utils/dom-utils';

// Define the message type
interface IterationMessage {
  action: string;
  iteration: number;
}

export const ReferenceImage = () => {
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [iterations, setIterations] = useState(0);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setReferenceImage(e.target.files[0]);
      setStatus('');
    }
  };

  const handleGenerateCSS = async () => {
    if (!referenceImage) {
      setStatus('Please upload a reference image first');
      return;
    }

    try {
      setIsLoading(true);
      setStatus('Processing reference image...');
      setIterations(0);

      // Get active tab
      const tab = await getActiveTab();
      if (!tab.id) {
        throw new Error('No active tab found');
      }

      // Extract the page structure
      setStatus('Analyzing page structure...');
      const classHierarchy = await getPageStructure(tab.id);

      // Set up a listener to track iterations
      const messageListener = (message: IterationMessage) => {
        if (message.action === 'iteration-update') {
          setIterations(message.iteration);
          setStatus(`Iteration ${message.iteration}/5: Refining CSS...`);
        }
      };
      chrome.runtime.onMessage.addListener(messageListener);

      // Process the reference image
      setStatus('Generating initial CSS...');
      const result = await processReferenceImage(
        referenceImage,
        tab.id,
        classHierarchy,
      );

      // Remove listener
      chrome.runtime.onMessage.removeListener(messageListener);

      setStatus(result.message);
    } catch (error) {
      console.error('Error generating CSS:', error);
      setStatus('Error generating CSS');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mt-4 p-4 bg-gray-50 rounded-lg">
      <h3 className="text-lg font-medium mb-2">Reference Image</h3>
      <p className="text-sm text-gray-600 mb-3">
        Upload a reference image to generate CSS that makes the current page
        look similar
      </p>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            disabled={isLoading}
          />
          {referenceImage && (
            <span className="text-sm text-gray-500">{referenceImage.name}</span>
          )}
        </div>

        <button
          onClick={handleGenerateCSS}
          disabled={!referenceImage || isLoading}
          className={`py-2 px-4 rounded-md text-white font-medium ${
            !referenceImage || isLoading
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {isLoading ? 'Generating...' : 'Generate CSS'}
        </button>

        {status && (
          <div
            className={`mt-2 p-2 rounded ${
              status === 'DevRev'
                ? 'bg-green-100 text-green-800'
                : status.includes('Failed') || status.includes('Error')
                  ? 'bg-red-100 text-red-800'
                  : 'bg-blue-100 text-blue-800'
            }`}
          >
            {status}
          </div>
        )}

        {isLoading && (
          <div className="mt-2">
            <p className="text-sm text-gray-600">Iteration: {iterations}/5</p>
            <div className="w-full bg-gray-200 rounded-full h-2.5 mt-1">
              <div
                className="bg-blue-600 h-2.5 rounded-full"
                style={{ width: `${Math.min((iterations / 5) * 100, 100)}%` }}
              ></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
