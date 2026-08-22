import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  appearanceStorageKey,
  appearanceBootScript,
  nextAppearancePreference,
  normalizeAppearancePreference,
} from "../app/lib/appearance";

test("preferência de aparência aceita claro, escuro e sistema", () => {
  assert.equal(normalizeAppearancePreference("light"), "light");
  assert.equal(normalizeAppearancePreference("dark"), "dark");
  assert.equal(normalizeAppearancePreference("system"), "system");
  assert.equal(normalizeAppearancePreference("invalid"), "system");
  assert.equal(nextAppearancePreference("light"), "dark");
  assert.equal(nextAppearancePreference("dark"), "system");
  assert.equal(nextAppearancePreference("system"), "light");
});

test("preferência é isolada por usuário", () => {
  assert.equal(appearanceStorageKey("user-a"), "bookstage:appearance:user-a");
  assert.notEqual(
    appearanceStorageKey("user-a"),
    appearanceStorageKey("user-b"),
  );
});

test("bootstrap aplica a preferência antes da hidratação", () => {
  const script = appearanceBootScript("user-a");
  assert.match(script, /bookstage:appearance:user-a/);
  assert.match(script, /prefers-color-scheme: dark/);
  assert.match(script, /dataset\.adminTheme/);
  assert.doesNotMatch(script, /<\/script/i);
});

test("layout reconhece os atributos de tema aplicados antes da hidratação", async () => {
  const layout = await readFile(
    new URL("../app/layout.tsx", import.meta.url),
    "utf8",
  );
  assert.match(layout, /<html lang="pt-BR" suppressHydrationWarning>/);
});

test("provider sincroniza sistema, storage e tema resolvido", async () => {
  const source = await readFile(
    new URL(
      "../app/components/organization-theme-provider.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /prefers-color-scheme: dark/);
  assert.match(source, /addEventListener\("storage"/);
  assert.match(source, /localStorage\.setItem/);
  assert.match(source, /data-theme=\{resolved\}/);
  assert.match(source, /dataset\.adminTheme = resolved/);
  assert.match(source, /appearanceStorageKey\(userId\)/);
});

test("modo escuro usa superfícies semânticas sem alterar componentes públicos", async () => {
  const css = await readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  assert.match(css, /\.organization-theme\[data-theme="dark"\]/);
  assert.match(css, /--card: #121722/);
  assert.match(css, /--border: #2b3546/);
  assert.match(css, /--success-bg: #0d2a20/);
  assert.match(css, /--danger-bg: #321716/);
  assert.match(css, /--brand-admin-background/);
  assert.match(css, /background: var\(--surface\)/);
  assert.doesNotMatch(css, /background: #fff;/);
  assert.doesNotMatch(css, /html\[data-theme/);
});

test("seletor de aparência fica disponível no shell autenticado", async () => {
  const shell = await readFile(
      new URL("../app/bookstage-app.tsx", import.meta.url),
      "utf8",
    ),
    selector = await readFile(
      new URL("../app/components/appearance-selector.tsx", import.meta.url),
      "utf8",
    );
  assert.match(shell, /<AppearanceSelector \/>/);
  assert.match(shell, /userId=\{user\.id\}/);
  assert.match(selector, /Aparência:/);
  assert.match(selector, /nextAppearancePreference/);
});
