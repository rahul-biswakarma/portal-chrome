import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ErrorModal } from '@/components/ui/error-modal';
import { useAppContext } from '@/contexts/app-context';
import { useLogger } from '@/services/logger';
import { getActiveTab } from '@/utils/chrome-utils';
import {
  defaultKeymap,
  history,
  historyKeymap,
  insertNewlineAndIndent,
} from '@codemirror/commands';
import { css } from '@codemirror/lang-css';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import { CheckIcon, Copy, Play, RotateCcw, RotateCw, Save, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export const CssEditor = () => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const [isCopied, setIsCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currentEditorContent, setCurrentEditorContent] = useState('');
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [errorModal, setErrorModal] = useState({
    isOpen: false,
    title: '',
    error: new Error(''),
    details: undefined as string | undefined,
  });

  const { cssContent, setCssContent, generationStage, devRevCssStage } = useAppContext();

  const { addLog } = useLogger();

  // Auto-save debounced CSS content
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      if (currentEditorContent !== cssContent) {
        setCssContent(currentEditorContent);
      }
    }, 500);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [currentEditorContent, setCssContent, cssContent]);

  // Auto-apply debounced CSS
  const applyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (applyTimeoutRef.current) {
      clearTimeout(applyTimeoutRef.current);
    }

    // Only auto-apply if content is not empty and different from what's saved
    if (currentEditorContent && currentEditorContent.trim()) {
      applyTimeoutRef.current = setTimeout(async () => {
        try {
          const tab = await getActiveTab();
          if (!tab?.id) return;

          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (cssContent: string) => {
              let styleEl = document.getElementById('portal-custom-styles') as HTMLStyleElement;

              if (!styleEl) {
                styleEl = document.createElement('style');
                styleEl.id = 'portal-custom-styles';
                document.head.appendChild(styleEl);
              }

              styleEl.textContent = cssContent;
            },
            args: [currentEditorContent],
          });

          addLog('CSS auto-applied successfully', 'success');
        } catch (error) {
          addLog('Auto-apply failed', 'error');
        }
      }, 500);
    }

    return () => {
      if (applyTimeoutRef.current) {
        clearTimeout(applyTimeoutRef.current);
      }
    };
  }, [currentEditorContent, addLog]);

  const handleApplyCss = async () => {
    if (!currentEditorContent) return;

    try {
      const tab = await getActiveTab();
      if (!tab?.id) {
        addLog('No active tab found', 'error');
        return;
      }

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (cssContent: string) => {
          let styleEl = document.getElementById('portal-custom-styles') as HTMLStyleElement;

          if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'portal-custom-styles';
            document.head.appendChild(styleEl);
          }

          styleEl.textContent = cssContent;
        },
        args: [currentEditorContent],
      });

      addLog('CSS applied successfully', 'success');
    } catch (error) {
      addLog(
        `Error applying CSS: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error'
      );
    }
  };

  const handleSave = async () => {
    setIsSaving(true);

    try {
      await new Promise(resolve => setTimeout(resolve, 100));
      setCssContent(currentEditorContent);
      addLog('CSS saved successfully', 'success');
    } catch (error) {
      addLog('Failed to save CSS', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearCss = () => {
    setShowClearDialog(true);
  };

  const handleConfirmClear = async () => {
    // Clear the editor
    if (viewRef.current) {
      const currentContent = viewRef.current.state.doc.toString();
      viewRef.current.dispatch({
        changes: {
          from: 0,
          to: currentContent.length,
          insert: '',
        },
      });
      setCurrentEditorContent('');
      setCssContent('');
    }

    // Also remove styles from the DOM
    try {
      const tab = await getActiveTab();
      if (tab?.id) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const styleEl = document.getElementById('portal-custom-styles');
            if (styleEl) {
              styleEl.remove();
            }
          },
        });
        addLog('CSS editor cleared and styles removed from page', 'success');
      } else {
        addLog('CSS editor cleared', 'info');
      }
    } catch (error) {
      addLog('CSS editor cleared, but failed to remove styles from page', 'warning');
    }

    setShowClearDialog(false);
  };

  // Clean CSS response from API
  const cleanCSSResponse = (css: string): string => {
    return css
      .replace(/```css\s*/g, '')
      .replace(/```\s*/g, '')
      .replace(/^\s*CSS:\s*/gm, '')
      .trim();
  };

  // Update editor content when cssContent changes
  useEffect(() => {
    if (viewRef.current && cssContent !== currentEditorContent) {
      const cleanedContent = cleanCSSResponse(cssContent || '');

      if (cleanedContent !== currentEditorContent) {
        const currentContent = viewRef.current.state.doc.toString();

        viewRef.current.dispatch({
          changes: {
            from: 0,
            to: currentContent.length,
            insert: cleanedContent,
          },
        });

        // IMPORTANT: Update currentEditorContent to trigger auto-apply
        // This ensures that when CSS is updated programmatically (like from visual preferences),
        // it also gets applied to the page automatically
        setCurrentEditorContent(cleanedContent);
      }
    }
  }, [cssContent]);

  // Determine if buttons should be disabled
  const isLoading = generationStage === 'generating' || devRevCssStage === 'loading';

  const isEditorEmpty = !currentEditorContent;

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
      const startingDoc = '/* CSS will appear here when generated or fetched */';

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

      setCurrentEditorContent(startingDoc);
    }
  }, []);

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
            onClick={handleClearCss}
            title="Clear CSS editor and remove styles from page"
            disabled={isLoading}
          >
            <Trash2 size={15} />
          </Button>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex items-center gap-1.5 h-9 px-3"
            onClick={handleSave}
            disabled={isLoading || isEditorEmpty || isSaving}
            title="Auto-save is active (500ms debounce)"
          >
            <Save size={14} className="mr-1" />
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
          <Button
            size="sm"
            className="flex items-center gap-1.5 h-9 px-3"
            onClick={handleApplyCss}
            disabled={isLoading || isEditorEmpty}
            title="Auto-apply is active (500ms debounce)"
          >
            <Play size={14} className="mr-1" />
            Apply
          </Button>
        </div>
      </div>

      {/* Clear CSS Confirmation Dialog */}
      <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear CSS Editor?</DialogTitle>
            <DialogDescription>
              This will:
              <br />
              • Remove all content from the CSS editor
              <br />
              • Remove all applied styles from the current page
              <br />
              <br />
              <strong>This action cannot be undone.</strong>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmClear}>
              Clear All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
