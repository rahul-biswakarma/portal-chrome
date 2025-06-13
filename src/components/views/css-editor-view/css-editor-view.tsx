import { CssEditor } from '../customize-view/css-editor';
import { ThemeVariablesGenerator } from './theme-variables-generator';

export const CssEditorView = () => {
  return (
    <div className="h-full flex flex-col gap-4 p-4">
      <div>
        <h2 className="text-xl font-semibold mb-1">CSS Editor</h2>
        <p className="text-sm text-muted-foreground">Edit and apply CSS directly to your portal</p>
      </div>

      <ThemeVariablesGenerator />

      <div className="flex-1 flex flex-col min-h-0">
        <CssEditor />
      </div>
    </div>
  );
};
