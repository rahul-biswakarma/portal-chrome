import { ThemeEditorControls } from './components/theme-editor-controls';

export const ThemeEditorView = () => {
  return (
    <div className="h-full flex flex-col gap-3 bg-background text-foreground overflow-y-auto p-3 pb-8 scrollbar-hide">
      <ThemeEditorControls />
    </div>
  );
};
