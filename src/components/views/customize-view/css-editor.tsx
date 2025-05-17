import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';
import { css } from '@codemirror/lang-css';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';

export const CssEditor = () => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (editorRef.current && !viewRef.current) {
      const state = EditorState.create({
        doc: '/* Enter your CSS here */\n.example {\n  color: red;\n}',
        extensions: [
          lineNumbers(),
          keymap.of(defaultKeymap),
          css(),
          vscodeDark,
          EditorView.theme({
            '&': {
              fontSize: '0.875rem', // text-sm
              fontFamily: 'monospace',
              height: '100%', // Take full available height
              borderRadius: '0.375rem', // rounded-md
            },
            '.cm-content': {
              minHeight: '16rem', // h-64, ensure a minimum height
              height: '100%',
            },
            '.cm-gutters': {
              // vscodeDark theme will style this, but you can override if needed
              // e.g., backgroundColor: '#2a2f3a',
            },
            '&.cm-focused': {
              outline: 'none', // Remove default focus outline
            },
            '.cm-scroller': {
              overflow: 'auto',
              // borderRadius is now handled by the '&' selector for the whole editor
              // border is handled by vscodeDark or can be set on '&' if needed
            },
          }),
          EditorView.lineWrapping,
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

  // Ensure the parent div can expand and has rounded corners
  return (
    <div
      ref={editorRef}
      className="w-full max-h-[calc(100%-20vh)] h-full rounded-md overflow-hidden"
    />
  );
};
