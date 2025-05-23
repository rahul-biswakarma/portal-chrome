import { ThemeVariablesGenerator } from '../css-editor-view/theme-variables-generator';

export const ThemeEditorView = () => {
  return (
    <div
      className="h-full flex flex-col overflow-y-auto"
      style={{ backgroundColor: 'var(--color-background)' }}
    >
      {/* Header Section */}
      <div
        className="px-8 py-6 border-b shadow-sm"
        style={{
          backgroundColor: 'var(--color-card)',
          borderColor: 'var(--color-border)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div className="max-w-4xl mx-auto">
          <h1
            className="text-2xl font-semibold mb-2"
            style={{ color: 'var(--color-foreground)' }}
          >
            Theme Editor
          </h1>
          <p
            className="text-sm leading-relaxed"
            style={{ color: 'var(--color-muted-foreground)' }}
          >
            Customize colors, typography, and spacing to create your perfect
            portal theme. All changes are applied in real-time.
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 px-8 py-6">
        <div className="max-w-4xl mx-auto">
          <div
            className="rounded-lg p-6 shadow-sm border"
            style={{
              backgroundColor: 'var(--color-card)',
              borderColor: 'var(--color-border)',
              boxShadow: 'var(--shadow)',
            }}
          >
            <ThemeVariablesGenerator forceShow={true} />
          </div>
        </div>
      </div>
    </div>
  );
};
