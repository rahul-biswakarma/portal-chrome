import { Button } from '@/components/ui/button';
import { ErrorModal } from '@/components/ui/error-modal';
import { useAppContext } from '@/contexts/app-context';
import { useLogger } from '@/services/logger';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { CssEditor } from '../customize-view/css-editor';
import { FetchCssModal } from '../customize-view/fetch-css-modal';

export const CssEditorView = () => {
  const [showFetchModal, setShowFetchModal] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [errorModal, setErrorModal] = useState({
    isOpen: false,
    title: '',
    error: new Error(''),
    details: undefined as string | undefined,
  });

  const { setCssContent } = useAppContext();
  const { addLog } = useLogger();

  const cleanCSSResponse = (css: string): string => {
    return css
      .replace(/```css\s*/g, '')
      .replace(/```\s*/g, '')
      .replace(/^\s*CSS:\s*/gm, '')
      .trim();
  };

  const fetchCssFromDevRev = async (): Promise<string> => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) throw new Error('No active tab found');

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const cssRules: string[] = [];

        for (const stylesheet of document.styleSheets) {
          try {
            if (stylesheet.href && stylesheet.href.includes('devrev')) {
              for (const rule of stylesheet.cssRules) {
                cssRules.push(rule.cssText);
              }
            }
          } catch (e) {
            console.warn('Could not access stylesheet:', stylesheet.href);
          }
        }

        return cssRules.join('\n');
      },
    });

    return results[0]?.result || '';
  };

  const handleFetchFromDevRev = () => {
    setShowFetchModal(true);
  };

  const handleConfirmFetch = async () => {
    try {
      setIsFetching(true);
      addLog('Fetching CSS from DevRev...', 'info');

      const css = await fetchCssFromDevRev();

      if (css) {
        const cleanedContent = cleanCSSResponse(css);
        setCssContent(cleanedContent);
        addLog('CSS fetched from DevRev successfully', 'success');
      } else {
        addLog('No CSS content returned from DevRev', 'warning');
      }
    } catch (error) {
      addLog(
        `Error fetching CSS from DevRev: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error'
      );

      setErrorModal({
        isOpen: true,
        title: 'DevRev CSS Fetch Error',
        error: error instanceof Error ? error : new Error(String(error)),
        details: error instanceof Error ? error.stack : undefined,
      });
    } finally {
      setIsFetching(false);
      setShowFetchModal(false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold mb-1">CSS Editor</h2>
          <p className="text-sm text-muted-foreground">
            Edit and apply CSS directly to your portal
          </p>
        </div>

        <Button
          size="sm"
          variant="outline"
          className="flex items-center gap-2"
          onClick={handleFetchFromDevRev}
          disabled={isFetching}
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          {isFetching ? 'Fetching...' : 'Fetch CSS'}
        </Button>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <CssEditor />
      </div>

      {/* Modal for fetching CSS from DevRev */}
      <FetchCssModal
        isOpen={showFetchModal}
        onClose={() => setShowFetchModal(false)}
        onConfirm={handleConfirmFetch}
        isLoading={isFetching}
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
