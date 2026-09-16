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
  resolveAdminBrandingTheme,
  type OrganizationBranding,
} from "@/app/lib/organization-branding";
import {
  appearanceStorageKey,
  normalizeAppearancePreference,
  type AppearancePreference,
  type ResolvedAppearance,
} from "@/app/lib/appearance";
import { fetchJson } from "@/app/lib/http-client";

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
    return "light";
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
  fallback = null,
}: {
  organizationId: string | null;
  userId: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const storageKey = appearanceStorageKey(userId),
    [branding, setBranding] = useState(DEFAULT_BOOKSTAGE_THEME),
    [brandingReady, setBrandingReady] = useState(!organizationId),
    [preference, setPreferenceState] =
      useState<AppearancePreference>("light");
  useEffect(() => {
    let active = true;
    if (!organizationId) return () => void (active = false);
    const load = () =>
      fetchJson<{ branding?: OrganizationBranding }>("/api/organization-branding")
        .then((result) => {
          if (active && result.ok && result.data?.branding) setBranding(result.data.branding);
        })
        .catch(() => undefined);
    void load().finally(() => {
      if (active) setBrandingReady(true);
    });
    window.addEventListener("bookstage:branding-updated", load);
    return () => {
      active = false;
      window.removeEventListener("bookstage:branding-updated", load);
    };
  }, [organizationId]);
  useEffect(() => {
    const initialFrame = window.requestAnimationFrame(() => {
        setPreferenceState(storedPreference(storageKey));
      }),
      stored = (event: StorageEvent) => {
        if (event.key === storageKey)
          setPreferenceState(normalizeAppearancePreference(event.newValue));
      };
    window.addEventListener("storage", stored);
    return () => {
      window.cancelAnimationFrame(initialFrame);
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
  const resolved: ResolvedAppearance = preference,
    appearance = { preference, resolved, setPreference };
  useEffect(() => {
    document.documentElement.dataset.adminTheme = resolved;
    document.documentElement.dataset.adminAppearance = preference;
  }, [preference, resolved]);
  const style = useMemo(() => {
    const tokens = resolveAdminBrandingTheme(branding, resolved);
    return {
        "--brand-primary": branding.primaryColor,
        "--brand-primary-foreground": tokens.primaryButtonForeground,
        "--brand-primary-hover": tokens.primaryButtonHoverBackground,
        "--brand-primary-hover-foreground": tokens.primaryButtonHoverForeground,
        "--brand-secondary": branding.secondaryColor,
        "--brand-secondary-foreground": tokens.sidebarActiveForeground,
        "--brand-secondary-soft": tokens.secondaryButtonBackground,
        "--brand-secondary-ink": tokens.secondaryButtonForeground,
        "--brand-secondary-border": tokens.secondaryButtonBorder,
        "--brand-secondary-hover": tokens.secondaryButtonHoverBackground,
        "--brand-secondary-hover-foreground": tokens.secondaryButtonHoverForeground,
        "--brand-accent": branding.accentColor,
        "--brand-accent-foreground": branding.accentForeground,
        "--brand-background": branding.backgroundColor,
        "--brand-admin-background": tokens.pageBackground,
        "--brand-on-primary-muted": tokens.sidebarMutedForeground,
        "--brand-on-primary-soft": tokens.sidebarHoverBackground,
        "--brand-primary-border": tokens.sidebarBorder,
        "--brand-sidebar-hover-foreground": tokens.sidebarHoverForeground,
        "--brand-sidebar-active-hover": tokens.sidebarActiveHoverBackground,
        "--brand-sidebar-active-hover-foreground": tokens.sidebarActiveHoverForeground,
        "--brand-heading-font": BRANDING_FONT_STACKS[branding.headingFont],
        "--brand-body-font": BRANDING_FONT_STACKS[branding.bodyFont],
    } as ThemeStyle;
  }, [branding, resolved]);
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
        {brandingReady ? children : fallback}
      </div>
    </AppearanceContext.Provider>
  );
}
