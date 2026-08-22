import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DEFAULT_BOOKSTAGE_THEME,
  contrastRatio,
  interactiveHoverColor,
  normalizeOrganizationBranding,
  readableForeground,
  resolveOrganizationBranding,
} from "../app/lib/organization-branding";
import {
  BRANDING_ASSET_LIMITS,
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
  assert.equal(readableForeground("#FFFFFF"), "#111827");
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
  assert.match(nextConfig, /bodySizeLimit: "6mb"/);
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
  assert.match(route, /public-branding/);
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

test("sidebar usa logo da organização sem remover a marca BookStage", async () => {
  const source = await readFile(
    new URL("../app/bookstage-app.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /active\?\.logo/);
  assert.match(source, /Logo de \$\{active\.name\}/);
  assert.match(source, /<b>BookStage<\/b>/);
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
});
