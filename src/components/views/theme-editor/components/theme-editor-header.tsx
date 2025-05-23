export const ThemeEditorHeader = () => {
  return (
    <div className=" flex flex-col gap-2 p-3 border-b border-border bg-card text-foreground">
      <h1 className="text-2xl font-semibold">Theme Editor</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Customize colors, typography, and spacing to create your perfect portal
        theme. All changes are applied in real-time.
      </p>
    </div>
  );
};
