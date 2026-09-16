import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DEFAULT_BOOKSTAGE_THEME,
  contrastRatio,
  interactiveHoverColor,
  mixHexColor,
  normalizeOrganizationBranding,
  organizationBrandingContrastWarnings,
  readableForeground,
  resolveAdminBrandingTheme,
  resolveOrganizationBranding,
} from "../app/lib/organization-branding";
import {
  BRANDING_ASSET_LIMITS,
  BRANDING_ASSET_ASPECT_RATIOS,
  brandingAssetHint,
  hasValidImageSignature,
} from "../app/lib/branding-assets";
import {
  publicCatalogPresentation,
  publicThemeStyle,
} from "../app/lib/public-theme";

test("organização sem branding recebe fallback BookStage completo", () => {
  assert.deepEqual(resolveOrganizationBranding(null), DEFAULT_BOOKSTAGE_THEME);
  assert.equal(
    resolveOrganizationBranding({ primaryColor: "inválida" }).primaryColor,
    DEFAULT_BOOKSTAGE_THEME.primaryColor,
  );
});

test("branding normaliza cores, fontes e URLs controladas", () => {
  const branding = normalizeOrganizationBranding({
    logoUrl: "https://cdn.example.com/logo.png",
    faviconUrl: "https://cdn.example.com/favicon.png",
    primaryColor: "#123abc",
    secondaryColor: "#334455",
    accentColor: "#fedcba",
    backgroundColor: "#fafafa",
    headingFont: "Georgia",
    bodyFont: "Inter",
    catalogCoverUrl: "https://cdn.example.com/cover.webp",
    catalogTitle: "Nossa programação",
    catalogDescription: "Artistas para o seu evento.",
  });
  assert.equal(branding.primaryColor, "#123ABC");
  assert.equal(branding.headingFont, "Georgia");
  assert.equal(branding.logoUrl, "https://cdn.example.com/logo.png");
  assert.ok(branding.primaryForeground);
});

test("branding rejeita cores, fontes e protocolos inseguros", () => {
  const valid = {
    primaryColor: "#111827",
    secondaryColor: "#374151",
    accentColor: "#E2B002",
    backgroundColor: "#F8F8F8",
    headingFont: "Inter",
    bodyFont: "Inter",
  };
  assert.throws(() =>
    normalizeOrganizationBranding({ ...valid, primaryColor: "red" }),
  );
  assert.throws(() =>
    normalizeOrganizationBranding({ ...valid, headingFont: "Comic Sans" }),
  );
  assert.throws(() =>
    normalizeOrganizationBranding({
      ...valid,
      logoUrl: "javascript:alert(1)",
    }),
  );
});

test("contraste escolhe foreground legível", () => {
  assert.equal(readableForeground("#111827"), "#FFFFFF");
  assert.equal(readableForeground("#FFFFFF"), "#000000");
  assert.equal(readableForeground("#7D7878"), "#000000");
  assert.ok(contrastRatio("#7D7878", readableForeground("#7D7878")) >= 4.5);
  assert.ok(contrastRatio("#111827", "#FFFFFF") >= 4.5);
  assert.notEqual(interactiveHoverColor("#111827"), "#111827");
  assert.notEqual(interactiveHoverColor("#FDE047"), "#FDE047");
  assert.ok(
    contrastRatio(
      interactiveHoverColor("#FDE047"),
      readableForeground("#FDE047"),
    ) >= 4.5,
  );
});

test("avisos de contraste refletem os consumidores reais das cores", () => {
  const warnings = organizationBrandingContrastWarnings({
    primaryColor: "#7D7878",
    secondaryColor: "#FF0A0A",
    accentColor: "#148AFF",
    backgroundColor: "#148AFF",
  });
  assert.ok(
    warnings.some(
      (warning) =>
        warning.includes("Solicitar show") &&
        warning.includes("3:1") &&
        warning.includes("texto do botão será ajustado automaticamente"),
    ),
  );
  assert.deepEqual(
    organizationBrandingContrastWarnings({
      primaryColor: "#111827",
      secondaryColor: "#FFFFFF",
      accentColor: "#E2B002",
      backgroundColor: "#111827",
    }),
    [],
  );
});

test("tokens administrativos mantêm contraste nos estados interativos", () => {
  for (const branding of [
    {
      primaryColor: "#111827",
      secondaryColor: "#FFFFFF",
      backgroundColor: "#148AFF",
    },
    {
      primaryColor: "#F8FAFC",
      secondaryColor: "#172033",
      backgroundColor: "#FDE68A",
    },
  ]) {
    for (const mode of ["light", "dark"] as const) {
      const tokens = resolveAdminBrandingTheme(branding, mode);
      for (const [background, foreground] of [
        [tokens.sidebarBackground, tokens.sidebarForeground],
        [tokens.sidebarHoverBackground, tokens.sidebarHoverForeground],
        [tokens.sidebarActiveBackground, tokens.sidebarActiveForeground],
        [
          tokens.sidebarActiveHoverBackground,
          tokens.sidebarActiveHoverForeground,
        ],
        [tokens.primaryButtonBackground, tokens.primaryButtonForeground],
        [
          tokens.primaryButtonHoverBackground,
          tokens.primaryButtonHoverForeground,
        ],
        [tokens.secondaryButtonBackground, tokens.secondaryButtonForeground],
        [
          tokens.secondaryButtonHoverBackground,
          tokens.secondaryButtonHoverForeground,
        ],
      ]) {
        assert.ok(
          contrastRatio(background, foreground) >= 4.5,
          `${mode}: ${background} / ${foreground}`,
        );
      }
      assert.equal(
        tokens.pageBackground,
        mixHexColor(
          mode === "dark" ? "#0B0F16" : "#F8F8F8",
          branding.backgroundColor,
          mode === "dark" ? 0.12 : 0.2,
        ),
      );
    }
  }
});

test("tema público usa branding próprio sem herdar aparência administrativa", async () => {
  const style = publicThemeStyle(DEFAULT_BOOKSTAGE_THEME);
  assert.equal(style["--public-primary"], DEFAULT_BOOKSTAGE_THEME.primaryColor);
  assert.equal(
    style["--public-background-foreground"],
    readableForeground(DEFAULT_BOOKSTAGE_THEME.backgroundColor),
  );
  const lowContrast = publicThemeStyle({
    ...DEFAULT_BOOKSTAGE_THEME,
    primaryColor: "#3C2A34",
    backgroundColor: "#465462",
  });
  assert.equal(lowContrast["--public-primary-ink"], "#FFFFFF");
  const darkCatalogWithWhitePrimary = publicThemeStyle({
    ...DEFAULT_BOOKSTAGE_THEME,
    primaryColor: "#FFFFFF",
    primaryForeground: "#000000",
    backgroundColor: "#111827",
  });
  assert.equal(darkCatalogWithWhitePrimary["--public-primary-ink"], "#FFFFFF");
  assert.equal(
    darkCatalogWithWhitePrimary["--public-card-primary-ink"],
    "#000000",
  );
  assert.ok(
    contrastRatio(
      darkCatalogWithWhitePrimary["--public-card"]!,
      darkCatalogWithWhitePrimary["--public-card-primary-ink"]!,
    ) >= 4.5,
  );
  const catalog = await readFile(
    new URL("../app/catalogo/[organizationSlug]/page.tsx", import.meta.url),
    "utf8",
  );
  const artist = await readFile(
    new URL(
      "../app/catalogo/[organizationSlug]/[artistSlug]/page.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(catalog, /publicThemeStyle\(branding\)/);
  assert.match(artist, /publicThemeStyle\(branding\)/);
  assert.doesNotMatch(catalog + artist, /useAppearance|adminTheme|localStorage/);
  assert.match(catalog, /presentation\.coverUrl/);
  assert.match(catalog, /catalog-hero-cover/);
});

test("apresentação do catálogo prioriza capa e textos configurados", () => {
  const customized = publicCatalogPresentation(
    { name: "Escritório", description: "Descrição institucional" },
    {
      ...DEFAULT_BOOKSTAGE_THEME,
      catalogCoverUrl: "/api/public/branding-assets/capa",
      catalogTitle: "Nossa programação",
      catalogDescription: "Escolha o artista ideal.",
    },
  );
  assert.deepEqual(customized, {
    coverUrl: "/api/public/branding-assets/capa",
    title: "Nossa programação",
    description: "Escolha o artista ideal.",
  });

  const fallback = publicCatalogPresentation(
    { name: "Escritório", description: "Descrição institucional" },
    DEFAULT_BOOKSTAGE_THEME,
  );
  assert.equal(fallback.coverUrl, null);
  assert.equal(fallback.title, "Escritório");
  assert.equal(fallback.description, "Descrição institucional");
});

test("upload valida a assinatura real da imagem", () => {
  assert.equal(BRANDING_ASSET_LIMITS.logo, 2_000_000);
  assert.equal(BRANDING_ASSET_LIMITS["catalog-cover"], 5_000_000);
  assert.equal(
    hasValidImageSignature(
      "image/png",
      Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]),
    ),
    true,
  );
  assert.equal(
    hasValidImageSignature(
      "image/jpeg",
      Uint8Array.from([255, 216, 255, 224, 0, 0, 0, 0, 0, 0, 0, 0]),
    ),
    true,
  );
  assert.equal(
    hasValidImageSignature(
      "image/webp",
      Uint8Array.from([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]),
    ),
    true,
  );
  assert.equal(
    hasValidImageSignature(
      "image/png",
      Uint8Array.from([60, 115, 99, 114, 105, 112, 116, 62]),
    ),
    false,
  );
});

test("orientações de branding informam proporção e limite", () => {
  assert.equal(BRANDING_ASSET_ASPECT_RATIOS.logo, "1:1 (quadrada)");
  assert.equal(BRANDING_ASSET_ASPECT_RATIOS.favicon, "1:1 (quadrada)");
  assert.equal(
    BRANDING_ASSET_ASPECT_RATIOS["catalog-cover"],
    "16:5 (horizontal)",
  );
  assert.match(brandingAssetHint("logo"), /1:1 \(quadrada\).*2 MB/);
  assert.match(
    brandingAssetHint("catalog-cover"),
    /16:5 \(horizontal\).*5 MB/,
  );
});

test("API deriva tenant ativo e permite escrita somente ao Owner", async () => {
  const route = await readFile(
    new URL("../app/api/organization-branding/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /requireActiveMembership/);
  assert.match(route, /membership\.role !== "OWNER"/);
  assert.match(route, /status: 403/);
  assert.doesNotMatch(route, /organizationId.*request\.json/);
  assert.match(route, /ON CONFLICT\(organization_id\)/);
});

test("upload de branding é Owner-only, limitado e armazenado fora do payload", async () => {
  const route = await readFile(
    new URL(
      "../app/api/organization-branding/assets/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(route, /requireActiveMembership/);
  assert.match(route, /membership\.role !== "OWNER"/);
  assert.match(route, /asset\.size > maxSize/);
  assert.match(route, /hasValidImageSignature/);
  assert.match(route, /env\.FILES\.put/);
  assert.match(route, /organizationId: context\.organizationId/);
  assert.doesNotMatch(route, /organizationId.*form\.get/);
  const nextConfig = await readFile(
      new URL("../next.config.ts", import.meta.url),
      "utf8",
    ),
    settings = await readFile(
      new URL(
        "../app/features/settings/branding/branding-settings.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    uploader = await readFile(
      new URL(
        "../app/features/settings/branding/asset-uploader.tsx",
        import.meta.url,
      ),
      "utf8",
    );
  assert.match(nextConfig, /bodySizeLimit: "12mb"/);
  assert.match(settings, /response\.status === 413/);
  assert.match(settings, /await response\.text\(\)/);
  assert.match(uploader, /file\.size > maxBytes/);
});

test("asset público aceita somente token opaco e envia cabeçalhos seguros", async () => {
  const route = await readFile(
    new URL(
      "../app/api/public/branding-assets/[token]/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(route, /\[a-f0-9-\]\{36\}/i);
  assert.match(route, /x-content-type-options/i);
  assert.match(route, /content-security-policy/i);
  assert.match(route, /brandingAssetKey/);
  assert.match(route, /organization\.status='ACTIVE'/);
  assert.match(route, /catalog_cover_url=\?/);
  assert.doesNotMatch(route, /object\?\.customMetadata/);
});

test("consulta pública entrega apenas branding de organização ativa", async () => {
  const source = await readFile(
    new URL("../app/lib/public-catalog.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /getPublicOrganizationBranding/);
  assert.match(source, /organization\.slug=\?/);
  assert.match(source, /organization\.status='ACTIVE'/);
  assert.doesNotMatch(source, /document|phone|email/);
});

test("tema administrativo usa tokens somente em pontos controlados", async () => {
  const css = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  assert.match(css, /\.organization-theme \.button-primary/);
  assert.match(css, /background: var\(--brand-primary\)/);
  assert.match(css, /color: var\(--brand-primary-foreground\)/);
  assert.match(css, /\.organization-theme \.sidebar nav \.nav-active/);
  assert.match(css, /var\(--brand-accent-soft\)/);
  assert.match(css, /font-family: var\(--brand-heading-font\)/);
  assert.match(css, /--brand-admin-background/);
  assert.doesNotMatch(css, /\.organization-theme \*\s*\{/);
});

test("sidebar usa logo da organização sem remover a marca BookBusiness", async () => {
  const source = await readFile(
    new URL("../app/bookstage-app.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /active\.logo/);
  assert.match(source, /Logo de \$\{active\.name\}/);
  assert.match(source, /<PlatformBrand \/>/);
});

test("preview de branding alterna Light e Dark sem trocar o tema global", async () => {
  const source = await readFile(
    new URL(
      "../app/features/settings/branding/brand-preview.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /data-preview-theme=\{previewTheme\}/);
  assert.match(source, /aria-pressed=\{previewTheme === theme\}/);
  assert.doesNotMatch(source, /setPreference|document\.documentElement/);
  assert.match(source, /resolveAdminBrandingTheme/);
  const provider = await readFile(
    new URL(
      "../app/components/organization-theme-provider.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(provider, /resolveAdminBrandingTheme/);
});

test("cores secundária e de fundo possuem consumidores visuais no painel", async () => {
  const preview = await readFile(
      new URL(
        "../app/features/settings/branding/brand-preview.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    css = await readFile(
      new URL("../app/globals.css", import.meta.url),
      "utf8",
    );
  assert.match(preview, /--preview-secondary/);
  assert.match(preview, /branding\.secondaryColor/);
  assert.match(css, /--brand-secondary-soft/);
  assert.match(css, /--brand-secondary-border/);
  assert.match(css, /\.organization-theme \.button-secondary/);
  assert.match(css, /\.organization-theme \.sidebar/);
  assert.match(css, /background: var\(--brand-primary\)/);
  assert.match(css, /--sidebar-foreground: var\(--brand-primary-foreground\)/);
  assert.match(css, /background: var\(--brand-secondary\)/);
  assert.match(css, /color: var\(--brand-secondary-foreground\)/);
  assert.match(css, /var\(--brand-admin-background\)/);
  assert.match(css, /var\(--brand-sidebar-active-hover\)/);
  assert.match(css, /var\(--brand-secondary-hover\)/);
});
