import {
  BRANDING_FONTS,
  type BrandingFont,
} from "@/app/lib/organization-branding";

export function FontSelector({
  label,
  value,
  onChange,
}: {
  label: string;
  value: BrandingFont;
  onChange: (value: BrandingFont) => void;
}) {
  return (
    <label>
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as BrandingFont)}
      >
        {BRANDING_FONTS.map((font) => (
          <option value={font} key={font}>
            {font}
          </option>
        ))}
      </select>
    </label>
  );
}
