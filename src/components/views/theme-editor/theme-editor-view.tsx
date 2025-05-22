import { ThemeVariablesGenerator } from '../css-editor-view/theme-variables-generator';

export const ThemeEditorView = () => {
  return (
    <div className="pb-12 h-full flex flex-col gap-4 overflow-y-auto p-4">
      <div>
        <h2 className="text-xl font-semibold mb-1">Theme Editor</h2>
        <p className="text-sm text-muted-foreground">
          Customize CSS variables for your portal theme
        </p>
      </div>

      <div className="flex-1">
        <ThemeVariablesGenerator forceShow={true} />
      </div>
    </div>
  );
};
