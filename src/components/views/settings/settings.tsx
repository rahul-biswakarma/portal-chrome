import { useState, useEffect, useContext } from 'react';
import { getEnvVariable, setEnvVariable } from '../../../utils/environment';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { uploadCssToDevRev } from '@/services/devrev-api';
import { AppContext } from '@/contexts/app-context';
import { useLogger } from '@/services/logger';
import { Loader2, Sparkles } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { ApplyCssWarningModal } from './apply-css-warning-modal';
import { ErrorModal } from '@/components/ui/error-modal';

export const Settings = () => {
  const [geminiKey, setGeminiKey] = useState('');
  const [devrevPat, setDevrevPat] = useState('');
  const [devrevOrgDonId, setDevrevOrgDonId] = useState('');
  const [devrevApiUrl, setDevrevApiUrl] = useState('https://api.dev.devrev-eng.ai');
  const [isSaved, setIsSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [showApplyCssWarning, setShowApplyCssWarning] = useState(false);
  const [errorModal, setErrorModal] = useState<{
    isOpen: boolean;
    title: string;
    error: string | Error;
    details?: string;
  }>({
    isOpen: false,
    title: '',
    error: '',
    details: undefined,
  });
  const appContext = useContext(AppContext);
  const { addLog } = useLogger();

  const isApplyButtonDisabled = !devrevPat || !devrevOrgDonId || isUploading;

  useEffect(() => {
    // Load settings on component mount
    const loadSettings = async () => {
      try {
        const storedGeminiKey = await getEnvVariable('GEMINI_API_KEY');
        const storedDevrevPat = await getEnvVariable('DEVREV_PAT');
        const storedDevrevOrgDonId = await getEnvVariable('DEVREV_ORG_DON_ID');
        const storedDevrevApiUrl = await getEnvVariable('DEVREV_API_URL');

        if (storedGeminiKey) {
          setGeminiKey(storedGeminiKey);
        }
        if (storedDevrevPat) {
          setDevrevPat(storedDevrevPat);
        }
        if (storedDevrevOrgDonId) {
          setDevrevOrgDonId(storedDevrevOrgDonId);
        }
        if (storedDevrevApiUrl) {
          setDevrevApiUrl(storedDevrevApiUrl);
        }
      } catch (error) {
        console.error('Error loading settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  const handleSaveGeminiKey = async () => {
    try {
      const trimmedKey = geminiKey.trim();
      if (!trimmedKey) {
        alert('Please enter a valid Gemini API key');
        return;
      }

      // Store in chrome.storage.local (persists between sessions)
      await setEnvVariable('GEMINI_API_KEY', trimmedKey);

      setIsSaved(true);

      // Reset the saved indicator after 3 seconds
      setTimeout(() => {
        setIsSaved(false);
      }, 3000);
    } catch (error) {
      console.error('Error saving Gemini API key:', error);
    }
  };

  const handleSaveDevRevSettings = async () => {
    try {
      const trimmedPat = devrevPat.trim();
      const trimmedDonId = devrevOrgDonId.trim();
      const trimmedApiUrl = devrevApiUrl.trim();

      // Validate inputs
      if (!trimmedPat || !trimmedDonId) {
        alert('Please enter both DevRev PAT and Org DON ID');
        return;
      }

      // Store in chrome.storage.local
      await setEnvVariable('DEVREV_PAT', trimmedPat);
      await setEnvVariable('DEVREV_ORG_DON_ID', trimmedDonId);
      await setEnvVariable('DEVREV_API_URL', trimmedApiUrl);

      setIsSaved(true);

      // Reset the saved indicator after 3 seconds
      setTimeout(() => {
        setIsSaved(false);
      }, 3000);
    } catch (error) {
      console.error('Error saving DevRev settings:', error);
    }
  };

  const handleApplyCssToPortal = () => {
    setShowApplyCssWarning(true);
  };

  const handleConfirmApplyCssToPortal = async () => {
    if (!appContext) return;

    try {
      setShowApplyCssWarning(false);
      setIsUploading(true);
      setUploadStatus('idle');
      addLog('Getting CSS from editor...', 'info');

      // Get current CSS from editor
      let cssContent = '';

      if (appContext.cssContent) {
        // Clean CSS (remove markdown if present)
        cssContent = appContext.cssContent
          .replace(/```css\s*/g, '')
          .replace(/```\s*$/g, '')
          .replace(/```/g, '')
          .trim();
      } else {
        console.error('No CSS content found in app context');
      }

      if (!cssContent) {
        throw new Error('No CSS content found in editor');
      }

      addLog('Uploading CSS to DevRev...', 'info');
      const success = await uploadCssToDevRev(cssContent);

      if (success) {
        addLog('CSS uploaded and applied to portal successfully', 'success');
        setUploadStatus('success');
      } else {
        throw new Error('Failed to upload CSS');
      }
    } catch (error) {
      console.error('Error applying CSS to portal:', error);
      addLog(
        `Error applying CSS to portal: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error'
      );
      setUploadStatus('error');

      // Show error modal with details
      setErrorModal({
        isOpen: true,
        title: 'DevRev API Error',
        error: error instanceof Error ? error : new Error(String(error)),
        details: error instanceof Error ? error.stack : undefined,
      });
    } finally {
      setIsUploading(false);

      // Reset the status indicator after 5 seconds
      setTimeout(() => {
        setUploadStatus('idle');
      }, 5000);
    }
  };

  if (isLoading) {
    return <div className="p-4">Loading settings...</div>;
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg p-4 pb-12">
      <h3 className="text-lg font-medium mb-2">Settings</h3>

      <div className="mb-6">
        <label
          htmlFor="geminiKey"
          className="block text-sm font-medium text-foreground mb-1 flex items-center"
        >
          <Sparkles size={16} className="text-purple-500 mr-1" />
          Gemini API Key
        </label>
        <div className="flex gap-1">
          <Input
            type="password"
            id="geminiKey"
            value={geminiKey}
            className="text-sm"
            onChange={e => setGeminiKey(e.target.value)}
            placeholder="AIza..."
          />
          <Button onClick={handleSaveGeminiKey}>Save</Button>
        </div>
        <p className="mt-1 text-sm text-secondary-foreground">
          Required for using Google's Gemini 2.5 Flash. Get your API key from{' '}
          <a
            href="https://ai.google.dev/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            Google AI Studio
          </a>
        </p>
      </div>

      <Separator />

      <div className="pt-4 mb-6">
        <h4 className="text-md font-medium mb-2">DevRev Integration</h4>

        <div className="mb-3">
          <label htmlFor="devrevPat" className="block text-sm font-medium text-foreground mb-1">
            DevRev PAT (Personal Access Token)
          </label>
          <div className="flex gap-1">
            <Input
              type="password"
              id="devrevPat"
              value={devrevPat}
              className="text-sm"
              onChange={e => setDevrevPat(e.target.value)}
              placeholder="Enter your DevRev PAT"
            />
          </div>
        </div>

        <div className="mb-3">
          <label
            htmlFor="devrevOrgDonId"
            className="block text-sm font-medium text-foreground mb-1"
          >
            DevRev Org DON ID
          </label>
          <div className="flex gap-1">
            <Input
              type="text"
              id="devrevOrgDonId"
              value={devrevOrgDonId}
              className="text-sm"
              onChange={e => setDevrevOrgDonId(e.target.value)}
              placeholder="e.g., don:identity:dvrv-us-1:devo/E9k6TwiY"
            />
          </div>
        </div>

        <div className="mb-3">
          <label htmlFor="devrevApiUrl" className="block text-sm font-medium text-foreground mb-1">
            DevRev API URL
          </label>
          <div className="flex gap-1">
            <Input
              className="text-sm"
              type="text"
              id="devrevApiUrl"
              value={devrevApiUrl}
              onChange={e => setDevrevApiUrl(e.target.value)}
              placeholder="https://api.dev.devrev-eng.ai"
            />
          </div>
          <p className="mt-1 text-xs text-secondary-foreground">
            Default is for dev environment (api.dev.devrev-eng.ai)
          </p>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSaveDevRevSettings}>Save DevRev Settings</Button>
        </div>

        {uploadStatus === 'success' && (
          <p className="mt-2 text-sm text-green-600">CSS applied to portal successfully!</p>
        )}

        {uploadStatus === 'error' && (
          <p className="mt-2 text-sm text-red-600">
            Failed to apply CSS to portal. Check console for details.
          </p>
        )}
      </div>

      <Separator />

      <Button
        onClick={handleApplyCssToPortal}
        className="w-full mt-2"
        disabled={isApplyButtonDisabled}
        variant={
          uploadStatus === 'success'
            ? 'success'
            : uploadStatus === 'error'
              ? 'destructive'
              : 'default'
        }
      >
        {isUploading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Uploading...
          </>
        ) : (
          'Apply CSS in Portal'
        )}
      </Button>

      {isSaved && <p className="mt-2 text-sm text-green-600">Settings saved successfully!</p>}

      {/* Apply CSS Warning Modal */}
      <ApplyCssWarningModal
        isOpen={showApplyCssWarning}
        onClose={() => setShowApplyCssWarning(false)}
        onConfirm={handleConfirmApplyCssToPortal}
        isLoading={isUploading}
      />

      {/* Error Modal */}
      <ErrorModal
        isOpen={errorModal.isOpen}
        onClose={() => setErrorModal(prev => ({ ...prev, isOpen: false }))}
        title={errorModal.title}
        error={errorModal.error}
        details={errorModal.details}
      />
    </div>
  );
};
