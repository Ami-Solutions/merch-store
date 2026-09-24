import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { startServer } from "../tools/serve.mjs";

const published = process.argv.includes("--published");
const rows = [
  ["new-permanent", false, true, "Mixed"],
  ["used-permanent", true, true, "Mixed"],
  ["new-other", false, false, "Other"],
  ["used-other", true, false, "Other"],
  ["legacy-permanent", undefined, true, "Legacy"],
  ["legacy-other", undefined, false, "Legacy"],
  ["legacy-missing", undefined, undefined, "Legacy"],
].map(([id, condition, supplier, brand], i) => ({
  id,
  article: id,
  name: "Проверочный товар " + (i + 1),
  brand,
  category: "Одежда",
  size: "M",
  gender: "unisex",
  stock: i + 1,
  cost: 100,
  price: (i + 1) * 1000,
  discount: 0,
  ...(condition === undefined ? {} : { isSecondhand: condition }),
  ...(supplier === undefined ? {} : { isPermanentSupplier: supplier }),
}));
const all = rows.map((p) => p.id);
const cases = [
  ["", "", all],
  ["new", "", ["new-permanent", "new-other", "legacy-permanent"]],
  [
    "secondhand",
    "",
    ["used-permanent", "used-other", "legacy-other", "legacy-missing"],
  ],
  ["", "permanent", ["new-permanent", "used-permanent", "legacy-permanent"]],
  ["", "other", ["new-other", "used-other", "legacy-other", "legacy-missing"]],
  ["new", "permanent", ["new-permanent", "legacy-permanent"]],
  ["new", "other", ["new-other"]],
  ["secondhand", "permanent", ["used-permanent"]],
  ["secondhand", "other", ["used-other", "legacy-other", "legacy-missing"]],
];
const html = (
  await readFile(new URL("../index.html", import.meta.url), "utf8")
).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
const server = published ? null : await startServer({ port: 0, html });
const base = published
  ? "https://ami-solutions.github.io/merch-store/"
  : "http://127.0.0.1:" + server.address().port + "/";
const output = new URL(
  "../output/filters/" + (published ? "published/" : "local/"),
  import.meta.url,
);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [],
  errors = [],
  blocked = [];
try {
  for (const width of [1440, 390])
    for (const theme of ["dark", "light"]) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        reducedMotion: "reduce",
      });
      await context.addInitScript(
        (theme) => localStorage.setItem("theme", theme),
        theme,
      );
      await context.route("**/*", (route) => {
        const url = new URL(route.request().url());
        if (
          url.hostname === "firestore.googleapis.com" ||
          (!published && url.origin !== new URL(base).origin)
        ) {
          blocked.push(url.origin);
          return route.abort();
        }
        return route.continue();
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(base);
      if (published) {
        await page.waitForFunction(() => window.firebaseAuth);
        await page.evaluate(() => firebaseAuth.authStateReady());
      } else {
        for (const name of ["database", "ui", "app"])
          await page.addScriptTag({ url: base + "js/" + name + ".js" });
        await page.evaluate(() => {
          initTheme();
          initTooltips();
          initMobileMenu();
          document
            .querySelector(".modal-close")
            .addEventListener("click", closeModal);
        });
      }
      await page.evaluate((rows) => {
        products = rows;
        window.currentUser = { role: "owner", name: "Тест" };
        document.getElementById("auth-screen").classList.remove("active");
        document.getElementById("app-screen").classList.add("active");
        hideLoader();
        switchSection("products");
        renderProducts();
      }, rows);
      const condition = page.getByLabel("Состояние товара", { exact: true });
      const supplier = page.getByLabel("Поставщик", { exact: true });
      const articles = () =>
        page.locator("#products-tbody tr td:first-child").allTextContents();
      async function expectRows(ids) {
        await expect
          .poll(async () => (await articles()).sort())
          .toEqual([...ids].sort());
      }
      for (const [state, source, ids] of cases) {
        await condition.selectOption(state);
        await supplier.selectOption(source);
        await expectRows(ids);
      }
      await condition.selectOption("secondhand");
      await supplier.selectOption("permanent");
      await page.locator("#product-brand-filter").fill("Mixed");
      await expectRows(["used-permanent"]);
      await page.locator("#product-search").fill("Несуществующий товар");
      await expectRows([]);
      await page
        .locator("#products-section")
        .getByRole("button", { name: "Сбросить", exact: true })
        .click();
      await expect(condition).toHaveValue("");
      await expect(supplier).toHaveValue("");
      await expectRows(all);
      await condition.selectOption("secondhand");
      await supplier.selectOption("permanent");
      await page.getByRole("button", { name: "Изменить", exact: true }).click();
      await page.locator(".modal-close").click();
      await expect(condition).toHaveValue("secondhand");
      await expect(supplier).toHaveValue("permanent");
      await expectRows(["used-permanent"]);
      for (const viewport of [width, 320]) {
        await page.setViewportSize({ width: viewport, height: 1000 });
        for (const field of [condition, supplier]) {
          const box = await field.boundingBox();
          assert.ok(box.x >= 0 && box.x + box.width <= viewport + 1);
        }
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          true,
        );
      }
      await page.setViewportSize({ width, height: 1000 });
      await page
        .locator("#products-section .filters-container")
        .screenshot({
          path: new URL(
            `filters-${width}-${theme}.png`,
            output,
          ).pathname.replace(/^\/(\w:)/, "$1"),
        });
      assert.deepEqual(
        await page.evaluate(() => products),
        rows,
        "Filtering must never alter documents",
      );
      results.push({
        width,
        theme,
        combinations: cases.length,
        reset: true,
        search: true,
        editReturn: true,
        narrowScreen: true,
      });
      await context.close();
    }
  assert.deepEqual(errors, []);
  assert.deepEqual(blocked, []);
  await writeFile(
    new URL("results.json", output),
    JSON.stringify(
      { published, results, errors, databaseRequests: 0 },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      published,
      passed: results.length,
      combinations: cases.length,
      errors,
      databaseRequests: 0,
    }),
  );
} finally {
  await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
}
