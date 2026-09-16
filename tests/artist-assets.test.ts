import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  ARTIST_ASSET_LIMITS,
  ARTIST_ASSET_ASPECT_RATIOS,
  artistAssetHint,
  artistAssetKey,
  artistAssetToken,
  artistAssetUrl,
  artistImageSources,
  normalizeArtistImageUrl,
} from "../app/lib/artist-assets";
import { isDiscordArtistAssetUrl } from "../app/lib/remote-artist-assets";

const token = "123e4567-e89b-12d3-a456-426614174000";

test("resolução de imagem prioriza capa, usa foto e termina em fallback", () => {
  assert.deepEqual(
    artistImageSources("https://cdn.example.com/cover.webp", "https://cdn.example.com/photo.jpg"),
    ["https://cdn.example.com/cover.webp", "https://cdn.example.com/photo.jpg"],
  );
  assert.deepEqual(
    artistImageSources(null, "https://cdn.example.com/photo.jpg"),
    ["https://cdn.example.com/photo.jpg"],
  );
  assert.deepEqual(artistImageSources(null, null), []);
  assert.deepEqual(
    artistImageSources("https://cdn.example.com/same.jpg", "https://cdn.example.com/same.jpg"),
    ["https://cdn.example.com/same.jpg"],
  );
});

test("URLs HTTPS legadas continuam válidas e caminhos locais são rejeitados", () => {
  assert.equal(
    normalizeArtistImageUrl("https://legacy.example.com/artist.jpg", "Foto"),
    "https://legacy.example.com/artist.jpg",
  );
  assert.throws(() => normalizeArtistImageUrl("C:\\temp\\artist.jpg", "Foto"));
  assert.throws(() => normalizeArtistImageUrl("/tmp/artist.jpg", "Foto"));
  assert.throws(() => normalizeArtistImageUrl("/public/artist.jpg", "Foto"));
  assert.throws(() =>
    normalizeArtistImageUrl("http://localhost:3000/artist.jpg", "Foto"),
  );
});

test("uploads novos usam token opaco e chave R2 independente da organização ativa", () => {
  assert.equal(artistAssetUrl(token), `/api/public/artist-assets/${token}`);
  assert.equal(artistAssetToken(artistAssetUrl(token)), token);
  assert.equal(artistAssetKey(token), `public-artists/${token}`);
  assert.equal(ARTIST_ASSET_LIMITS.photo, 5_000_000);
  assert.equal(ARTIST_ASSET_LIMITS.cover, 8_000_000);
  assert.equal(
    normalizeArtistImageUrl(artistAssetUrl(token), "Capa"),
    artistAssetUrl(token),
  );
});

test("orientações de imagens de artista informam proporção e limite", () => {
  assert.equal(ARTIST_ASSET_ASPECT_RATIOS.photo, "1:1 (quadrada)");
  assert.equal(ARTIST_ASSET_ASPECT_RATIOS.cover, "2:3 (vertical)");
  assert.match(artistAssetHint("photo"), /1:1 \(quadrada\).*5 MB/);
  assert.match(artistAssetHint("cover"), /2:3 \(vertical\).*8 MB/);
});

test("upload autentica, escopa artista e grava metadados multiempresa no R2", async () => {
  const route = await readFile(
    new URL("../app/api/artists/[id]/assets/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /requireActiveMembership/);
  assert.match(route, /canManageArtistAssignments/);
  assert.match(route, /WHERE id=\? AND organization_id=\?/);
  assert.match(route, /organizationId: context\.organizationId/);
  assert.match(route, /artistId: id/);
  assert.match(route, /env\.FILES\.put/);
  assert.match(route, /hasValidImageSignature/);
  assert.doesNotMatch(route, /organizationId.*form\.get/);
});

test("referência R2 não pode ser vinculada a outro artista ou empresa", async () => {
  const route = await readFile(
    new URL("../app/api/artists/[id]/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /customMetadata\?\.organizationId !== context\.organizationId/);
  assert.match(route, /customMetadata\?\.artistId !== id/);
  assert.match(route, /customMetadata\?\.kind !== kind/);
  assert.match(route, /alreadyOwned/);
  assert.match(route, /não pertence a este artista e organização/);
});

test("rota pública entrega imagem autorizada com cache revogável, CORS e token opaco", async () => {
  const route = await readFile(
    new URL("../app/api/public/artist-assets/[token]/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /\[a-f0-9-\]\{36\}/i);
  assert.match(route, /object\.writeHttpMetadata/);
  assert.match(route, /access-control-allow-origin/);
  assert.match(route, /max-age=3600/);
  assert.match(route, /artist\.photo_url=\?/);
  assert.match(route, /artist\.is_public=1/);
  assert.match(route, /membership\.artist_access_scope='ALL'/);
  assert.match(route, /booking_collaborator_artist_access/);
  assert.match(route, /artist_sales_assignments/);
  assert.match(route, /private, no-store/);
  assert.match(route, /x-content-type-options/);
  assert.match(route, /currentUser/);
  assert.match(route, /LIMIT 1/);
  assert.doesNotMatch(route, /object\.customMetadata/);
});

test("SQL do asset privado respeita escopo do artista e distingue cache público", async () => {
  const route = await readFile(
    new URL("../app/api/public/artist-assets/[token]/route.ts", import.meta.url),
    "utf8",
  );
  const sql = route.match(/`(SELECT CASE WHEN artist\.is_public[\s\S]+?LIMIT 1)`/)?.[1];
  assert.ok(sql);
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE organizations(id TEXT PRIMARY KEY,status TEXT);
      CREATE TABLE artists(id TEXT PRIMARY KEY,organization_id TEXT,status TEXT,is_public INTEGER,photo_url TEXT,cover_url TEXT);
      CREATE TABLE memberships(organization_id TEXT,user_id TEXT,status TEXT,role TEXT,professional_role TEXT,artist_access_scope TEXT);
      CREATE TABLE booking_collaborator_artist_access(organization_id TEXT,artist_id TEXT,user_id TEXT,status TEXT);
      CREATE TABLE artist_sales_assignments(organization_id TEXT,artist_id TEXT,user_id TEXT);
      INSERT INTO organizations VALUES ('a','ACTIVE'),('b','ACTIVE');
      INSERT INTO artists VALUES ('public','a','ACTIVE',1,'/public',NULL),('private','a','ACTIVE',0,'/private',NULL);
      INSERT INTO memberships VALUES ('a','owner','ACTIVE','OWNER',NULL,'ALL'),('a','sales','ACTIVE','SALES',NULL,'ASSIGNED'),('a','booking','ACTIVE','SALES','BOOKING_AGENT','ASSIGNED'),('b','outsider','ACTIVE','OWNER',NULL,'ALL');
      INSERT INTO artist_sales_assignments VALUES ('a','private','sales');
      INSERT INTO booking_collaborator_artist_access VALUES ('a','private','booking','ACTIVE');
    `);
    const statement = db.prepare(sql);
    assert.equal(statement.get("/public", "/public", "")?.isPublic, 1);
    assert.equal(statement.get("/private", "/private", "owner")?.isPublic, 0);
    assert.equal(statement.get("/private", "/private", "sales")?.isPublic, 0);
    assert.equal(statement.get("/private", "/private", "booking")?.isPublic, 0);
    assert.equal(statement.get("/private", "/private", "outsider"), undefined);
  } finally {
    db.close();
  }
});

test("catálogos autenticado e compartilhável usam fallback sem alterar o layout", async () => {
  const [authenticated, shared, publicCatalog, publicArtist, resilient, css] =
    await Promise.all([
      readFile(
        new URL("../app/components/commercial-catalog.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../app/bookings/[code]/page.tsx", import.meta.url), "utf8"),
      readFile(
        new URL("../app/catalogo/[organizationSlug]/page.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../app/catalogo/[organizationSlug]/[artistSlug]/page.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL("../app/components/resilient-image.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    ]);
  for (const source of [authenticated, shared, publicCatalog, publicArtist])
    assert.match(source, /ResilientImage/);
  assert.match(authenticated, /artistImageSources\(artist\.coverUrl, artist\.photoUrl\)/);
  assert.match(shared, /artistImageSources\(artist\.coverUrl, artist\.photoUrl\)/);
  assert.match(authenticated, /sources=\{\[organization\.logo\]\}/);
  assert.match(shared, /sources=\{\[organization\.logo\]\}/);
  assert.match(resilient, /onError/);
  assert.match(resilient, /image\?\.complete/);
  assert.match(resilient, /image\.naturalWidth === 0/);
  assert.match(resilient, /fallback/);
  assert.match(css, /\.commercial-artist-media \{[^}]*height: 180px;/);
  assert.match(css, /\.commercial-artist-media img \{[\s\S]*?object-fit: cover;/);
  assert.match(css, /\.artist-card-media \{[^}]*aspect-ratio: 2\/3;/);
});

test("gestão permite reenviar foto e capa sem persistir caminho do navegador", async () => {
  const manager = await readFile(
    new URL("../app/components/catalog-manager.tsx", import.meta.url),
    "utf8",
  );
  assert.match(manager, /\/api\/artists\/\$\{selectedId\}\/assets/);
  assert.match(manager, /data\.set\("asset", asset\)/);
  assert.match(manager, /uploadAsset\("photo", photoFile\)/);
  assert.match(manager, /uploadAsset\("cover", coverFile\)/);
  assert.doesNotMatch(manager, /files\?\[0\]\.path/);
});

test("links do Discord são reconhecidos sem liberar hosts arbitrários", () => {
  assert.equal(
    isDiscordArtistAssetUrl("https://cdn.discordapp.com/attachments/1/2/image.png"),
    true,
  );
  assert.equal(
    isDiscordArtistAssetUrl("https://media.discordapp.net/attachments/1/2/image.jpg"),
    true,
  );
  assert.equal(isDiscordArtistAssetUrl("https://example.com/image.jpg"), false);
  assert.equal(isDiscordArtistAssetUrl("http://cdn.discordapp.com/image.jpg"), false);
});

test("salvar artista internaliza Discord no R2 e limpa upload em falha", async () => {
  const [route, importer] = await Promise.all([
    readFile(new URL("../app/api/artists/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/remote-artist-assets.ts", import.meta.url), "utf8"),
  ]);
  assert.match(route, /importDiscordArtistAsset/);
  assert.match(route, /importedKeys/);
  assert.match(route, /env\.FILES\.delete/);
  assert.match(importer, /redirect: "error"/);
  assert.match(importer, /hasValidImageSignature/);
  assert.match(importer, /ARTIST_ASSET_LIMITS\[kind\]/);
  assert.match(importer, /importedFrom: "discord"/);
});
