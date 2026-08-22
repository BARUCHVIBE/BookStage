export const APPEARANCE_PREFERENCES = ["light", "dark", "system"] as const;
export type AppearancePreference = (typeof APPEARANCE_PREFERENCES)[number];
export type ResolvedAppearance = Exclude<AppearancePreference, "system">;

export function normalizeAppearancePreference(
  value: string | null | undefined,
): AppearancePreference {
  return APPEARANCE_PREFERENCES.includes(value as AppearancePreference)
    ? (value as AppearancePreference)
    : "system";
}

export function nextAppearancePreference(
  current: AppearancePreference,
): AppearancePreference {
  return current === "light" ? "dark" : current === "dark" ? "system" : "light";
}

export function appearanceStorageKey(userId: string) {
  return `bookstage:appearance:${userId}`;
}

export function appearanceBootScript(userId: string) {
  const key = JSON.stringify(appearanceStorageKey(userId)).replaceAll(
    "<",
    "\\u003c",
  );
  return `(function(){try{var p=localStorage.getItem(${key});if(p!=="light"&&p!=="dark"&&p!=="system")p="system";var d=p==="dark"||(p==="system"&&typeof matchMedia==="function"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.adminTheme=d?"dark":"light";document.documentElement.dataset.adminAppearance=p}catch(e){}})();`;
}
