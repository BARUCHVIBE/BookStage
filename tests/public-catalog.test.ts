import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  publicArtistDto,
  publicCatalogDto,
} from "../app/lib/public-catalog-dto";

const organization = {
  slug: "label-x",
  name: "Label X",
  logo: null,
  description: "Casting oficial",
  instagram: "https://instagram.com/labelx",
  website: "https://labelx.test",
};
const artist = {
  slug: "artista-x",
  name: "Artista X",
  photoUrl: null,
  coverUrl: null,
  genre: "Pop",
  baseCity: "São Paulo",
  description: "Descrição pública",
  showFormats: ["Show completo"],
  videos: ["https://video.test"],
  instagram: null,
  spotify: null,
  youtube: null,
  materials: ["https://material.test"],
};

test("DTO da organização expõe somente campos autorizados", () => {
  const dto = publicCatalogDto(organization, [artist]);
  assert.deepEqual(Object.keys(dto.organization).sort(), [
    "description",
    "instagram",
    "logo",
    "name",
    "slug",
    "website",
  ]);
  assert.equal("email" in dto.organization, false);
  assert.equal("document" in dto.organization, false);
});

test("DTO do artista não expõe dados internos", () => {
  const dto = publicArtistDto(organization, artist, [
    { date: "2026-09-10", availability: "Indisponível" },
  ]);
  const serialized = JSON.stringify(dto);
  for (const privateField of [
    "internalNotes",
    "createdBy",
    "assignments",
    "organizationId",
    "document",
    "email",
    "phone",
    "CONFIRMED",
    "BLOCKED",
    "OPTION",
    "INQUIRY",
  ]) {
    assert.equal(serialized.includes(privateField), false);
  }
  assert.deepEqual(dto.availability, [
    { date: "2026-09-10", availability: "Indisponível" },
  ]);
});

test("consultas públicas exigem organização e publicação ativa", async () => {
  const source = await readFile(
    new URL("../app/lib/public-catalog.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /SELECT\s+\*/i);
  assert.match(source, /organization\.slug=\?/);
  assert.match(source, /artist\.is_public=1/);
  assert.match(source, /artist\.status='ACTIVE'/);
  assert.match(source, /organization\.status='ACTIVE'/);
  assert.match(
    source,
    /url\.protocol\s*===\s*"http:"\s*\|\|\s*url\.protocol\s*===\s*"https:"/,
  );
});

test("rotas públicas não exigem conta e usam DTOs restritos", async () => {
  const organizationRoute = await readFile(
    new URL(
      "../app/api/public/catalog/[organizationSlug]/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const artistRoute = await readFile(
    new URL(
      "../app/api/public/catalog/[organizationSlug]/[artistSlug]/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(organizationRoute, /currentUser|requireActiveMembership/);
  assert.doesNotMatch(artistRoute, /currentUser|requireActiveMembership/);
  assert.match(organizationRoute, /publicCatalogDto/);
  assert.match(artistRoute, /publicArtistDto/);
});

test("páginas públicas existem em URLs dedicadas", async () => {
  await readFile(
    new URL("../app/catalogo/[organizationSlug]/page.tsx", import.meta.url),
    "utf8",
  );
  await readFile(
    new URL(
      "../app/catalogo/[organizationSlug]/[artistSlug]/page.tsx",
      import.meta.url,
    ),
    "utf8",
  );
});

test("catálogo sobrepõe o header ao hero e padroniza somente o painel dos cards", async () => {
  const page = await readFile(
      new URL("../app/catalogo/[organizationSlug]/page.tsx", import.meta.url),
      "utf8",
    ),
    css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(page, /catalog-index-page/);
  assert.match(page, /has-catalog-cover/);
  assert.match(
    css,
    /\.catalog-index-page > \.public-header[\s\S]*?position: absolute;/,
  );
  assert.match(css, /\.artist-card-media \{[^}]*aspect-ratio: 2\/3;/);
  assert.match(css, /\.artist-card-media img \{[\s\S]*?object-fit: cover;/);
  assert.match(css, /\.public-artist-grid \{[^}]*align-items: stretch;/);
  assert.match(
    css,
    /\.public-artist-card > div:last-child \{[^}]*min-height: 140px;/,
  );
  assert.doesNotMatch(
    css,
    /\.public-artist-card \{[^}]*grid-template-rows:/,
  );
  assert.doesNotMatch(css, /maridao-70/i);
});
