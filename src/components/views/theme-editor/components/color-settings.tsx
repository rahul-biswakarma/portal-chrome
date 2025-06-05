import { Label } from '@/components/ui/label';

interface ColorSettingsProps {
  accentColor: string;
  accentLabelColor: string;
  neutralColor: string;
  onAccentColorChange: (color: string) => void;
  onAccentLabelColorChange: (color: string) => void;
  onNeutralColorChange: (color: string) => void;
}

export const ColorSettings = ({
  accentColor,
  accentLabelColor,
  neutralColor,
  onAccentColorChange,
  onAccentLabelColorChange,
  onNeutralColorChange,
}: ColorSettingsProps) => {
  const ColorInputRow = ({
    label,
    id,
    value,
    onChange,
  }: {
    label: string;
    id: string;
    value: string;
    onChange: (value: string) => void;
  }) => {
    const isValidHex = /^#([0-9A-F]{3}){1,2}$/i.test(value);

    return (
      <div className="flex items-center justify-between w-full gap-3">
        <Label
          htmlFor={id}
          className="text-sm font-medium text-foreground min-w-0 flex-shrink"
        >
          {label}
        </Label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={isValidHex ? value : '#000000'}
            onChange={(e) => onChange(e.target.value)}
            className="w-12 h-12 rounded-md border-2 border-border hover:border-primary transition-colors shadow-sm cursor-pointer bg-transparent"
            aria-label={`Pick color for ${label}`}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 border-b border-border pb-4">
      <h2 className="text-lg font-semibold text-foreground">Color Settings</h2>
      <div className="space-y-4">
        <ColorInputRow
          label="Accent Color (Primary)"
          id="accent-color"
          value={accentColor}
          onChange={onAccentColorChange}
        />
        <ColorInputRow
          label="Accent Label Color (Button Text)"
          id="accent-label-color"
          value={accentLabelColor}
          onChange={onAccentLabelColorChange}
        />
        <ColorInputRow
          label="Neutral Color (Background)"
          id="neutral-color"
          value={neutralColor}
          onChange={onNeutralColorChange}
        />
      </div>
    </div>
  );
};
