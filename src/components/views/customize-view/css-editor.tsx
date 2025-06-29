import { useEffect, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import {
  defaultKeymap,
  history,
  historyKeymap,
  insertNewlineAndIndent,
} from '@codemirror/commands';
import { css } from '@codemirror/lang-css';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import { AppContext } from '@/contexts/app-context';
import { useContext } from 'react';
import { Button } from '@/components/ui/button';
import { getActiveTab } from '@/utils/chrome-utils';
import { Play, RotateCcw, RotateCw, Copy, CheckIcon, Download, Save, X } from 'lucide-react';
import { useLogger } from '@/services/logger';
import { FetchCssModal } from './fetch-css-modal';

export const CssEditor = () => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [currentEditorContent, setCurrentEditorContent] = useState<string>('');
  const [isCopied, setIsCopied] = useState(false);
  const [showFetchModal, setShowFetchModal] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const appContext = useContext(AppContext);
  const { addLog } = useLogger();

  if (!appContext) {
    throw new Error('CssEditor must be used within an AppProvider');
  }

  const { cssContent, setCssContent, generationStage, devRevCssStage, fetchCssFromDevRev } =
    appContext;

  // Function to clean CSS response (remove markdown)
  const cleanCSSResponse = (css: string): string => {
    return css
      .replace(/```css\s*/g, '')
      .replace(/```\s*$/g, '')
      .replace(/```/g, '')
      .trim();
  };

  // Function to apply CSS to the page
  const applyCSS = async (css: string): Promise<void> => {
    const tab = await getActiveTab();
    if (!tab.id) {
      console.error('No active tab found');
      return;
    }

    // Clean CSS before applying
    const cleanedCSS = cleanCSSResponse(css);

    return new Promise(resolve => {
      chrome.scripting.executeScript(
        {
          target: { tabId: tab.id as number },
          func: cssContent => {
            // Remove existing style if it exists
            const existingStyle = document.getElementById('portal-generated-css');
            if (existingStyle) {
              existingStyle.remove();
            }

            // Create and add new style element
            const styleEl = document.createElement('style');
            styleEl.id = 'portal-generated-css';
            styleEl.textContent = cssContent;
            document.head.appendChild(styleEl);
          },
          args: [cleanedCSS],
        },
        () => {
          resolve();
        }
      );
    });
  };

  const handleApplyCss = async () => {
    if (viewRef.current) {
      const content = viewRef.current.state.doc.toString();

      if (
        !content ||
        content.trim() === '' ||
        content.trim() === '/* CSS will appear here when generated */'
      ) {
        addLog('No CSS content to apply', 'error');
        return;
      }

      addLog('Applying CSS...', 'info');
      await applyCSS(content);
      addLog('CSS applied successfully', 'success');
    }
  };

  // Auto-apply CSS when editor content changes
  useEffect(() => {
    // Skip initial empty content
    if (
      currentEditorContent &&
      currentEditorContent.trim() !== '' &&
      currentEditorContent.trim() !== '/* CSS will appear here when generated */'
    ) {
      // Apply the CSS automatically with a slight debounce
      const timer = setTimeout(() => {
        applyCSS(currentEditorContent);
      }, 500); // Delay to avoid excessive updates while typing

      return () => clearTimeout(timer);
    }
  }, [currentEditorContent]);

  const handleSave = async () => {
    if (viewRef.current) {
      const content = viewRef.current.state.doc.toString();

      if (
        !content ||
        content.trim() === '' ||
        content.trim() === '/* CSS will appear here when generated */'
      ) {
        addLog('No CSS content to save', 'error');
        return;
      }

      setIsSaving(true);
      try {
        // Update the context with current editor content
        setCssContent(content);
        addLog('CSS saved successfully', 'success');
      } catch (error) {
        addLog('Failed to save CSS', 'error');
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleRemoveStyles = async () => {
    const tab = await getActiveTab();
    if (!tab.id) {
      console.error('No active tab found');
      return;
    }

    chrome.scripting.executeScript(
      {
        target: { tabId: tab.id as number },
        func: () => {
          // Remove the applied style element
          const existingStyle = document.getElementById('portal-generated-css');
          if (existingStyle) {
            existingStyle.remove();
          }
        },
      },
      () => {
        addLog('Applied styles removed from page', 'success');
      }
    );
  };

  const handleFetchFromDevRev = async () => {
    setShowFetchModal(true);
  };

  const handleConfirmFetch = async () => {
    try {
      setIsFetching(true);
      addLog('Fetching CSS from DevRev...', 'info');

      const css = await fetchCssFromDevRev();

      if (css) {
        // Update the editor content with the fetched CSS
        setCssContent(css);
        addLog('CSS fetched from DevRev successfully', 'success');
      } else {
        throw new Error(
          'Could not retrieve CSS from DevRev preferences. Check the console for details.'
        );
      }
    } catch (error) {
      console.error('Error fetching CSS from DevRev:', error);
      addLog(
        `Error fetching CSS from DevRev: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error'
      );
    } finally {
      setIsFetching(false);
      setShowFetchModal(false);
    }
  };

  const handleUndo = () => {
    if (viewRef.current) {
      // Execute undo command through the editor's command system
      viewRef.current.dispatch({
        effects: EditorView.scrollIntoView(0),
      });
      // Attempt to trigger undo command
      const command = historyKeymap.find(k => k.key === 'Mod-z')?.run;
      if (command) {
        command(viewRef.current);
      }
    }
  };

  const handleRedo = () => {
    if (viewRef.current) {
      // Execute redo command through the editor's command system
      const command = historyKeymap.find(k => k.key === 'Mod-y' || k.key === 'Mod-Shift-z')?.run;
      if (command) {
        command(viewRef.current);
      }
    }
  };

  const handleCopy = async () => {
    if (viewRef.current) {
      const content = viewRef.current.state.doc.toString();
      try {
        await navigator.clipboard.writeText(content);
        setIsCopied(true);
        addLog('CSS copied to clipboard', 'success');
        setTimeout(() => setIsCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy text: ', err);
        addLog('Failed to copy CSS to clipboard', 'error');
      }
    }
  };

  useEffect(() => {
    if (editorRef.current && !viewRef.current) {
      const startingDoc = '/* CSS will appear here when generated */';

      const state = EditorState.create({
        doc: startingDoc,
        extensions: [
          lineNumbers(),
          keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
            { key: 'Enter', run: insertNewlineAndIndent },
          ]),
          css(),
          vscodeDark,
          history(),
          EditorView.theme({
            '&': {
              fontSize: '0.875rem',
              fontFamily: 'var(--font-mono)',
              height: '100%',
              borderRadius: 'var(--radius)',
              backgroundColor: 'hsl(var(--background))',
              color: 'hsl(var(--foreground))',
            },
            '.cm-content': {
              minHeight: '16rem',
              height: '100%',
              padding: '0.75rem',
            },
            '.cm-gutters': {
              backgroundColor: 'hsl(var(--muted))',
              borderRight: '1px solid hsl(var(--border))',
            },
            '.cm-lineNumbers': {
              color: 'hsl(var(--muted-foreground))',
            },
            '.cm-activeLineGutter': {
              backgroundColor: 'hsl(var(--accent))',
            },
            '.cm-activeLine': {
              backgroundColor: 'hsl(var(--accent) / 0.1)',
            },
            '&.cm-focused': {
              outline: 'none',
            },
            '.cm-scroller': {
              overflow: 'auto',
            },
            '.cm-editor.cm-focused': {
              outline: '2px solid hsl(var(--ring))',
              outlineOffset: '2px',
            },
          }),
          EditorView.lineWrapping,
          EditorView.updateListener.of(update => {
            if (update.docChanged) {
              const content = update.state.doc.toString();
              setCurrentEditorContent(content);
            }
          }),
        ],
      });

      viewRef.current = new EditorView({
        state,
        parent: editorRef.current,
      });
    }

    return () => {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, []);

  // Update editor content when cssContent changes
  useEffect(() => {
    if (viewRef.current && cssContent) {
      // Clean the CSS before updating the editor
      const cleanedContent = cleanCSSResponse(cssContent);
      const currentContent = viewRef.current.state.doc.toString();

      if (currentContent !== cleanedContent) {
        viewRef.current.dispatch({
          changes: {
            from: 0,
            to: currentContent.length,
            insert: cleanedContent,
          },
        });
        setCurrentEditorContent(cleanedContent);
      }
    }
  }, [cssContent]);

  // Determine if buttons should be disabled
  const isLoading = generationStage === 'generating' || devRevCssStage === 'loading' || isFetching;

  const isEditorEmpty = !currentEditorContent;

  return (
    <div className="flex flex-col w-full h-full gap-4">
      <div
        ref={editorRef}
        className="w-full flex-1 rounded-lg border border-border shadow-sm overflow-y-auto bg-background"
      />

      <div className="flex justify-between items-center pt-1">
        <div className="flex gap-2">
          <Button
            size="icon"
            variant="outline"
            className="flex items-center gap-1.5 w-9 h-9"
            onClick={handleUndo}
            title="Undo"
            disabled={isLoading}
          >
            <RotateCcw size={15} />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="flex items-center gap-1.5 w-9 h-9"
            onClick={handleRedo}
            title="Redo"
            disabled={isLoading}
          >
            <RotateCw size={15} />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="flex items-center gap-1.5 h-9 w-9"
            onClick={handleCopy}
            title="Copy CSS"
            disabled={isLoading || isEditorEmpty}
          >
            {isCopied ? <CheckIcon size={15} /> : <Copy size={15} />}
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="flex items-center gap-1.5 h-9 w-9"
            onClick={handleFetchFromDevRev}
            title="Fetch CSS from DevRev"
            disabled={isLoading}
          >
            <Download size={15} />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="flex items-center gap-1.5 h-9 w-9"
            onClick={handleRemoveStyles}
            title="Remove applied styles"
            disabled={isLoading}
          >
            <X size={15} />
          </Button>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex items-center gap-1.5 h-9 px-3"
            onClick={handleSave}
            disabled={isLoading || isEditorEmpty || isSaving}
          >
            <Save size={14} className="mr-1" />
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
          <Button
            size="sm"
            className="flex items-center gap-1.5 h-9 px-3"
            onClick={handleApplyCss}
            disabled={isLoading || isEditorEmpty}
          >
            <Play size={14} className="mr-1" />
            Apply CSS
          </Button>
        </div>
      </div>

      {/* Modal for fetching CSS from DevRev */}
      <FetchCssModal
        isOpen={showFetchModal}
        onClose={() => setShowFetchModal(false)}
        onConfirm={handleConfirmFetch}
        isLoading={isFetching}
      />
    </div>
  );
};
