import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("assets importados continuam autorizados pela referência tenant-safe do banco", async () => {
  const [artist, branding, transfer] = await Promise.all([
    readFile(
      new URL("../app/api/public/artist-assets/[token]/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/api/public/branding-assets/[token]/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../scripts/data-transfer.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(artist, /artist\.photo_url=\? OR artist\.cover_url=\?/);
  assert.match(artist, /organization\.status='ACTIVE'/);
  assert.match(artist, /membership\.organization_id=artist\.organization_id/);
  assert.match(branding, /organization\.logo=\?/);
  assert.match(branding, /organization\.status='ACTIVE'/);
  assert.doesNotMatch(transfer, /validateR2Transport/);
  assert.match(transfer, /--content-type/);
});

test("novas referências internas continuam exigindo metadados do próprio tenant", async () => {
  const [helper, branding, organization] = await Promise.all([
    readFile(new URL("../app/lib/branding-assets.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/organization-branding/route.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/api/organizations/[id]/route.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(helper, /customMetadata\?\.organizationId === organizationId/);
  assert.match(helper, /customMetadata\?\.kind === kind/);
  assert.match(helper, /value === existingValue/);
  assert.match(branding, /brandingAssetBelongsToOrganization/);
  assert.match(organization, /brandingAssetBelongsToOrganization/);
});
