"use client";

import { Moon, Sun } from "lucide-react";
import { useAppearance } from "@/app/components/organization-theme-provider";
import { nextAppearancePreference } from "@/app/lib/appearance";

const labels = {
  light: "Claro",
  dark: "Escuro",
} as const;

export function AppearanceSelector() {
  const { preference, setPreference } = useAppearance();
  const next = nextAppearancePreference(preference),
    Icon = preference === "dark" ? Moon : Sun;
  return (
    <button
      type="button"
      className="button button-secondary appearance-toggle"
      onClick={() => setPreference(next)}
      aria-label={`Aparência: ${labels[preference]}. Alterar para ${labels[next]}.`}
      title={`Aparência: ${labels[preference]}`}
    >
      <Icon aria-hidden="true" />
      <span>{labels[preference]}</span>
    </button>
  );
}
