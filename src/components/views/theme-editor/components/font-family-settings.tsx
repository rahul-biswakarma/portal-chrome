import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const fontOptions = [
  { value: 'Inter', label: 'Inter' },
  { value: 'Roboto', label: 'Roboto' },
  { value: 'Open Sans', label: 'Open Sans' },
  { value: 'Lato', label: 'Lato' },
  { value: 'Montserrat', label: 'Montserrat' },
  // Removed monospace/code fonts
];

const fontSizeOptions = [
  { value: '12px', label: '12px' },
  { value: '14px', label: '14px' },
  { value: '16px', label: '16px' },
  { value: '18px', label: '18px' },
  { value: '20px', label: '20px' },
];

interface FontFamilySettingsProps {
  headingFont: string;
  paragraphFont: string;
  onHeadingFontChange: (font: string) => void;
  onParagraphFontChange: (font: string) => void;
  // headingFontSize: string;
  // paragraphFontSize: string;
  // onHeadingFontSizeChange: (size: string) => void;
  // onParagraphFontSizeChange: (size: string) => void;
}

export const FontFamilySettings = ({
  headingFont,
  paragraphFont,
  onHeadingFontChange,
  onParagraphFontChange,
}: // headingFontSize, // TODO: Uncomment when font size state is managed in parent
// paragraphFontSize,
// onHeadingFontSizeChange,
// onParagraphFontSizeChange,
FontFamilySettingsProps) => {
  // TODO: Manage font size state here or lift to parent (ThemeEditorControls)
  // For now, using a local placeholder. This should be controlled from parent for CSS generation.
  const handleHeadingFontSizeChange = (size: string) =>
    console.log('Heading font size:', size);
  const handleParagraphFontSizeChange = (size: string) =>
    console.log('Paragraph font size:', size);

  return (
    <div className="flex flex-col gap-2 border-b border-border pb-3">
      <h2 className="text-lg font-semibold text-foreground">Font Settings</h2>

      {/* Headings Font Section - Row Layout */}
      <div className="flex flex-col gap-2 w-full flex-1">
        <div className="flex-1">
          <Label
            htmlFor="heading-font"
            className="text-sm font-medium text-muted-foreground"
          >
            Headings Font Family
          </Label>
        </div>
        <div className="flex flex-1 gap-2 items-center w-full">
          <Select value={headingFont} onValueChange={onHeadingFontChange}>
            <SelectTrigger
              id="heading-font"
              className="w-full bg-background mt-1 text-foreground border-border"
            >
              <SelectValue placeholder="Select font" />
            </SelectTrigger>
            <SelectContent className="bg-popover text-popover-foreground">
              {fontOptions.map((font) => (
                <SelectItem key={font.value} value={font.value}>
                  {font.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            onValueChange={handleHeadingFontSizeChange}
            defaultValue="16px"
          >
            <SelectTrigger
              id="heading-font-size"
              className="w-full mt-1 bg-background text-foreground border-border"
            >
              <SelectValue placeholder="Select size" />
            </SelectTrigger>
            <SelectContent className="bg-popover text-popover-foreground">
              {fontSizeOptions.map((size) => (
                <SelectItem key={size.value} value={size.value}>
                  {size.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {/* Removed Preview for Heading */}

      {/* Paragraphs Font Section - Row Layout */}
      <div className="flex flex-col gap-2 w-full flex-1">
        <div className="flex-1">
          <Label
            htmlFor="paragraph-font"
            className="text-sm font-medium text-muted-foreground"
          >
            Paragraphs
          </Label>
        </div>

        <div className="flex flex-1 gap-2 items-center">
          <Select value={paragraphFont} onValueChange={onParagraphFontChange}>
            <SelectTrigger
              id="paragraph-font"
              className="w-full mt-1 bg-background text-foreground border-border"
            >
              <SelectValue placeholder="Select font" />
            </SelectTrigger>
            <SelectContent className="bg-popover text-popover-foreground">
              {fontOptions.map((font) => (
                <SelectItem key={font.value} value={font.value}>
                  {font.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            onValueChange={handleParagraphFontSizeChange}
            defaultValue="14px"
          >
            <SelectTrigger
              id="paragraph-font-size"
              className="w-full mt-1 bg-background text-foreground border-border"
            >
              <SelectValue placeholder="Select size" />
            </SelectTrigger>
            <SelectContent className="bg-popover text-popover-foreground">
              {fontSizeOptions.map((size) => (
                <SelectItem key={size.value} value={size.value}>
                  {size.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};
