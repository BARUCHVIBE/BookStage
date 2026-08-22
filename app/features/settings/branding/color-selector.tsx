export function ColorSelector({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const valid = /^#[0-9a-f]{6}$/i.test(value);
  return (
    <label className="branding-color-field">
      <span>{label}</span>
      <div>
        <input
          type="color"
          aria-label={`Selecionar ${label.toLowerCase()}`}
          value={valid ? value : "#111827"}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
        />
        <input
          value={value}
          maxLength={7}
          spellCheck={false}
          aria-invalid={!valid}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
        />
      </div>
    </label>
  );
}
