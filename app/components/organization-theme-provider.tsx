"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  BRANDING_FONT_STACKS,
  DEFAULT_BOOKSTAGE_THEME,
  interactiveHoverColor,
  type OrganizationBranding,
} from "@/app/lib/organization-branding";
import {
  appearanceStorageKey,
  normalizeAppearancePreference,
  type AppearancePreference,
  type ResolvedAppearance,
} from "@/app/lib/appearance";

type ThemeStyle = CSSProperties & Record<`--brand-${string}`, string>;
const AppearanceContext = createContext<{
  preference: AppearancePreference;
  resolved: ResolvedAppearance;
  setPreference: (preference: AppearancePreference) => void;
} | null>(null);

function storedPreference(key: string) {
  try {
    return normalizeAppearancePreference(window.localStorage.getItem(key));
  } catch {
    return "system";
  }
}

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context)
    throw new Error("useAppearance deve ser usado dentro do tema da empresa.");
  return context;
}

export function OrganizationThemeProvider({
  organizationId,
  userId,
  children,
}: {
  organizationId: string | null;
  userId: string;
  children: ReactNode;
}) {
  const storageKey = appearanceStorageKey(userId),
    [branding, setBranding] = useState(DEFAULT_BOOKSTAGE_THEME),
    [preference, setPreferenceState] =
      useState<AppearancePreference>("system"),
    [systemDark, setSystemDark] = useState(false);
  useEffect(() => {
    let active = true;
    if (!organizationId) return () => void (active = false);
    const load = () =>
      fetch("/api/organization-branding")
        .then(
          (response) =>
            response.json() as Promise<{ branding?: OrganizationBranding }>,
        )
        .then((data) => {
          if (active && data.branding) setBranding(data.branding);
        })
        .catch(() => undefined);
    void load();
    window.addEventListener("bookstage:branding-updated", load);
    return () => {
      active = false;
      window.removeEventListener("bookstage:branding-updated", load);
    };
  }, [organizationId]);
  useEffect(() => {
    const media =
        typeof window.matchMedia === "function"
          ? window.matchMedia("(prefers-color-scheme: dark)")
          : null,
      initialFrame = window.requestAnimationFrame(() => {
        setPreferenceState(storedPreference(storageKey));
        setSystemDark(media?.matches ?? false);
      }),
      changed = (event: MediaQueryListEvent) => setSystemDark(event.matches),
      stored = (event: StorageEvent) => {
        if (event.key === storageKey)
          setPreferenceState(normalizeAppearancePreference(event.newValue));
      };
    media?.addEventListener("change", changed);
    window.addEventListener("storage", stored);
    return () => {
      window.cancelAnimationFrame(initialFrame);
      media?.removeEventListener("change", changed);
      window.removeEventListener("storage", stored);
    };
  }, [storageKey]);
  function setPreference(next: AppearancePreference) {
    try {
      window.localStorage.setItem(storageKey, next);
    } catch {
      // A aparência ainda funciona na sessão quando o storage está bloqueado.
    }
    setPreferenceState(next);
  }
  const resolved: ResolvedAppearance =
      preference === "system" ? (systemDark ? "dark" : "light") : preference,
    appearance = { preference, resolved, setPreference };
  useEffect(() => {
    document.documentElement.dataset.adminTheme = resolved;
    document.documentElement.dataset.adminAppearance = preference;
  }, [preference, resolved]);
  const style = useMemo(
    () =>
      ({
        "--brand-primary": branding.primaryColor,
        "--brand-primary-foreground": branding.primaryForeground,
        "--brand-primary-hover": interactiveHoverColor(
          branding.primaryColor,
        ),
        "--brand-secondary": branding.secondaryColor,
        "--brand-secondary-foreground": branding.secondaryForeground,
        "--brand-accent": branding.accentColor,
        "--brand-accent-foreground": branding.accentForeground,
        "--brand-background": branding.backgroundColor,
        "--brand-heading-font": BRANDING_FONT_STACKS[branding.headingFont],
        "--brand-body-font": BRANDING_FONT_STACKS[branding.bodyFont],
      }) as ThemeStyle,
    [branding],
  );
  useEffect(() => {
    const existing = document.querySelector<HTMLLinkElement>(
      'link[data-bookstage-favicon="organization"]',
    );
    if (!branding.faviconUrl) {
      existing?.remove();
      return;
    }
    const link = existing ?? document.createElement("link");
    link.rel = "icon";
    link.href = branding.faviconUrl;
    link.dataset.bookstageFavicon = "organization";
    if (!existing) document.head.appendChild(link);
  }, [branding.faviconUrl]);
  return (
    <AppearanceContext.Provider value={appearance}>
      <div
        className="organization-theme"
        data-theme={resolved}
        data-appearance={preference}
        style={style}
      >
        {children}
      </div>
    </AppearanceContext.Provider>
  );
}
