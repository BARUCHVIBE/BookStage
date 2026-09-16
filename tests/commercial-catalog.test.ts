import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("catálogo autenticado agrega apenas memberships Booking ativas", async () => {
  const route = await readFile(
    new URL("../app/api/commercial-catalog/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /membership\.user_id=\?/);
  assert.match(route, /membership\.status='ACTIVE'/);
  assert.match(route, /membership\.professional_role='BOOKING_AGENT'/);
  assert.match(route, /booking_collaborator_artist_access/);
  assert.match(route, /access\.status='ACTIVE'/);
  assert.match(route, /artist\.organization_id=membership\.organization_id/);
  assert.doesNotMatch(route, /bookstage_active_organization/);
});

test("carteira mantém organização em cada artista e oferece filtro simples", async () => {
  const component = await readFile(
    new URL("../app/components/commercial-catalog.tsx", import.meta.url),
    "utf8",
  );
  assert.match(component, /Meu Catálogo Comercial/);
  assert.match(component, /Todas as empresas/);
  assert.match(component, /organizationId: string/);
  assert.match(component, /artistId: string/);
  assert.match(component, /Criar proposta comercial/);
  assert.match(component, /onCreateNegotiation\(artist\.organizationId, artist\.artistId\)/);
});

test("shell usa catálogo comercial somente para Booking", async () => {
  const shell = await readFile(
    new URL("../app/bookstage-app.tsx", import.meta.url),
    "utf8",
  );
  assert.match(shell, /active\.role === "BOOKING_AGENT"/);
  assert.match(shell, /<CommercialCatalog/);
  assert.match(shell, /openCommercialNegotiation/);
  assert.match(shell, /initialArtistId=\{crmInitialArtistId\}/);
});

test("link pessoal é opaco, estável e revalida a carteira atual", async () => {
  const [profileRoute, portfolio, schema, migration] = await Promise.all([
    readFile(
      new URL("../app/api/commercial-profile/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/lib/booking-commercial.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../drizzle/0018_lyrical_iron_lad.sql", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(profileRoute, /randomToken\(18\)/);
  assert.match(profileRoute, /ON CONFLICT\(user_id\)/);
  assert.match(profileRoute, /professional_role='BOOKING_AGENT'/);
  assert.match(profileRoute, /JOIN organizations organization/);
  assert.match(profileRoute, /organization\.status='ACTIVE'/);
  assert.equal(
    profileRoute.match(/await activeBooking\(user\.id\)/g)?.length,
    3,
    "GET, POST e PATCH devem revalidar um vínculo Booking ativo",
  );
  assert.match(portfolio, /membership\.status='ACTIVE'/);
  assert.match(portfolio, /access\.status='ACTIVE'/);
  assert.match(portfolio, /artist\.is_public=1/);
  assert.match(schema, /bookingCommercialProfiles/);
  assert.match(migration, /booking_commercial_profiles/);
});

test("links pessoal, por empresa e por artista não são indexáveis", async () => {
  const [catalog, artist, component] = await Promise.all([
    readFile(new URL("../app/bookings/[code]/page.tsx", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../app/bookings/[code]/[organizationSlug]/[artistSlug]/page.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../app/components/commercial-catalog.tsx", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(catalog, /robots: \{ index: false, follow: false \}/);
  assert.match(artist, /robots: \{ index: false, follow: false \}/);
  assert.match(catalog, /empresa/);
  assert.match(component, /Copiar meu link/);
  assert.match(component, /Copiar link desta empresa/);
  assert.match(component, /copyLink\("artist", artist\)/);
});

test("caixa de solicitações deixa de expor empresas sem vínculo Booking ativo", async () => {
  const [list, mutation] = await Promise.all([
    readFile(
      new URL("../app/api/commercial-requests/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/api/commercial-requests/[id]/route.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(list, /active_booking\.organization_id=request\.organization_id/);
  assert.match(list, /active_booking\.status='ACTIVE'/);
  assert.match(list, /active_booking\.professional_role='BOOKING_AGENT'/);
  assert.match(mutation, /membership\.status !== "ACTIVE"/);
  assert.match(mutation, /activeOrganizationId\(\)/);
  assert.match(mutation, /intake\.organizationId/);
});

test("conversão de intake é idempotente mesmo sob repetição concorrente", async () => {
  const route = await readFile(
    new URL("../app/api/commercial-requests/[id]/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /opportunityId = crypto\.randomUUID\(\)/);
  assert.match(route, /guardedOpportunityInsertSql/);
  assert.match(route, /guardedRequestConversionSql/);
  assert.match(route, /status === "CONVERTED" && intake\.opportunityId/);
  assert.match(route, /WHERE id=\? AND organization_id=\? AND status='CONVERTED'/);
  assert.match(route, /converted\?\.opportunityId/);
});
