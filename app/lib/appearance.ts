export const APPEARANCE_PREFERENCES = ["light", "dark"] as const;
export type AppearancePreference = (typeof APPEARANCE_PREFERENCES)[number];
export type ResolvedAppearance = AppearancePreference;

export function normalizeAppearancePreference(
  value: string | null | undefined,
): AppearancePreference {
  return APPEARANCE_PREFERENCES.includes(value as AppearancePreference)
    ? (value as AppearancePreference)
    : "light";
}

export function nextAppearancePreference(
  current: AppearancePreference,
): AppearancePreference {
  return current === "light" ? "dark" : "light";
}

export function appearanceStorageKey(userId: string) {
  return `bookstage:appearance:${userId}`;
}

export function appearanceBootScript(userId: string) {
  const key = JSON.stringify(appearanceStorageKey(userId)).replaceAll(
    "<",
    "\\u003c",
  );
  return `(function(){try{var p=localStorage.getItem(${key});if(p!=="light"&&p!=="dark")p="light";document.documentElement.dataset.adminTheme=p;document.documentElement.dataset.adminAppearance=p}catch(e){}})();`;
}
