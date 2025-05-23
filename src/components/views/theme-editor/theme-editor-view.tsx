import { ThemeEditorHeader } from './components/theme-editor-header';
import { ThemeEditorControls } from './components/theme-editor-controls';

export const ThemeEditorView = () => {
  return (
    <div className="h-full flex flex-col gap-3 bg-background text-foreground overflow-y-auto">
      <ThemeEditorHeader />
      <div className="flex flex-col gap-3 p-3">
        <ThemeEditorControls />
      </div>
    </div>
  );
};
