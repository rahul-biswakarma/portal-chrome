import { ThemeVariablesGenerator } from '../css-editor-view/theme-variables-generator';

export const ThemeEditorView = () => {
  return (
    <div className="h-full flex flex-col overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="px-6 py-5 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
          Theme Editor
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Customize colors, typography, and spacing for your portal
        </p>
      </div>

      <div className="flex-1 p-6">
        <ThemeVariablesGenerator forceShow={true} />
      </div>
    </div>
  );
};
