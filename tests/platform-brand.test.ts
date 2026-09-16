import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("marca da plataforma usa somente os assets oficiais centralizados", async () => {
  const [source, favicon, officialIcon] = await Promise.all([
    readFile(
      new URL("../app/components/platform-brand.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../public/favicon.svg", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../public/brand/book_business_app_icon_light.svg",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  assert.match(source, /book_business_logo_primary\.svg/);
  assert.match(source, /book_business_logo_white_gold\.svg/);
  assert.match(source, /book_business_symbol_color\.svg/);
  assert.match(source, /book_business_logo_with_tagline\.svg/);
  assert.doesNotMatch(source, />\s*B\s*</);
  assert.equal(favicon, officialIcon);
});

test("marca com slogan é a marca-d'água das telas internas", async () => {
  const [shell, login, styles] = await Promise.all([
    readFile(new URL("../app/bookstage-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/login-form.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(shell, /<PlatformWatermark \/>/);
  assert.match(login, /<PlatformWatermark className="login-watermark" \/>/);
  assert.match(styles, /\.platform-watermark/);
  assert.match(styles, /pointer-events: none/);
});

test("mensagem específica sobre links do Discord não aparece no catálogo", async () => {
  const source = await readFile(
    new URL("../app/components/catalog-manager.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /Links do Discord/);
});
