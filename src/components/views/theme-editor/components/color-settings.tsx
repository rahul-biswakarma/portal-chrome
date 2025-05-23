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
  }) => (
    <div className="flex items-center justify-between w-full">
      <Label htmlFor={id} className="text-sm font-medium text-muted-foreground">
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded border border-border cursor-pointer"
        />
        <span className="text-sm text-foreground min-w-[70px] text-right">
          {value.toUpperCase()}
        </span>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3 border-b border-border pb-3">
      <h2 className="text-lg font-semibold text-foreground">Color Settings</h2>
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
  );
};
