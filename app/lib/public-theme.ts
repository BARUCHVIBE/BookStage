import type { CSSProperties } from "react";
import {
  BRANDING_FONT_STACKS,
  contrastRatio,
  readableForeground,
  type OrganizationBranding,
} from "./organization-branding";

type PublicThemeStyle = CSSProperties & Record<`--public-${string}`, string>;

export function publicThemeStyle(
  branding: OrganizationBranding,
): PublicThemeStyle {
  const backgroundForeground = readableForeground(branding.backgroundColor),
    primaryInk =
      contrastRatio(branding.primaryColor, branding.backgroundColor) >= 4.5
        ? branding.primaryColor
        : backgroundForeground,
    accentInk =
      contrastRatio(branding.accentColor, branding.backgroundColor) >= 4.5
        ? branding.accentColor
        : backgroundForeground;
  return {
    "--public-primary": branding.primaryColor,
    "--public-primary-foreground": branding.primaryForeground,
    "--public-primary-ink": primaryInk,
    "--public-secondary": branding.secondaryColor,
    "--public-accent": branding.accentColor,
    "--public-accent-foreground": branding.accentForeground,
    "--public-accent-ink": accentInk,
    "--public-background": branding.backgroundColor,
    "--public-background-foreground": backgroundForeground,
    "--public-cover-foreground": "#F8FAFC",
    "--public-heading-font": BRANDING_FONT_STACKS[branding.headingFont],
    "--public-body-font": BRANDING_FONT_STACKS[branding.bodyFont],
  };
}

export function publicCatalogPresentation(
  organization: { name: string; description: string | null },
  branding: OrganizationBranding,
) {
  return {
    coverUrl: branding.catalogCoverUrl,
    title: branding.catalogTitle || organization.name,
    description:
      branding.catalogDescription ||
      organization.description ||
      "Artistas, projetos e experiências ao vivo para o seu evento.",
  };
}
