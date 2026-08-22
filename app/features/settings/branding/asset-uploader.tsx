import { ImagePlus } from "lucide-react";
import { useEffect, useState } from "react";

export function AssetUploader({
  label,
  value,
  hint,
  onChange,
  onPreview,
  maxBytes,
  onValidationError,
  compact = false,
}: {
  label: string;
  value: string | null;
  hint: string;
  onChange: (file: File | null) => void;
  onPreview?: (url: string | null) => void;
  maxBytes: number;
  onValidationError?: (message: string) => void;
  compact?: boolean;
}) {
  const [preview, setPreview] = useState(value),
    [objectUrl, setObjectUrl] = useState<string | null>(null);
  useEffect(
    () => () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    },
    [objectUrl],
  );
  function selected(file: File | null) {
    if (file && file.size > maxBytes) {
      onValidationError?.(
        `A imagem excede o limite de ${(maxBytes / 1_000_000).toFixed(0)} MB. Comprima o arquivo e tente novamente.`,
      );
      return false;
    }
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    const next = file ? URL.createObjectURL(file) : null;
    setObjectUrl(next);
    setPreview(next ?? value);
    onPreview?.(next ?? value);
    onChange(file);
    onValidationError?.("");
    return true;
  }
  return (
    <div className={`branding-asset-field ${compact ? "is-compact" : ""}`}>
      <span>{label}</span>
      <div className="branding-asset-preview">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- URLs may be R2 or user-configured remote assets.
          <img src={preview} alt={`Prévia de ${label.toLowerCase()}`} />
        ) : (
          <ImagePlus aria-hidden="true" />
        )}
      </div>
      <label className="button button-secondary branding-file-button">
        Alterar
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => {
            if (!selected(event.target.files?.[0] ?? null))
              event.currentTarget.value = "";
          }}
        />
      </label>
      <small>{hint}</small>
    </div>
  );
}
