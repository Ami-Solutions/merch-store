// Uses ONLY the local Firestore emulator and synthetic documents.
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fixture } from "./condition-fixture.mjs";

const root = new URL("../", import.meta.url);
const project = "demo-merch-stock-tests";
const emulator = "http://127.0.0.1:18080";
const output = new URL("../output/condition/", import.meta.url);
const html = (await readFile(new URL("index.html", root), "utf8"))
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
  .replace(/<link\b[^>]*href="https:[^"]*"[^>]*>/gi, "");
const server = createServer(async (req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  try {
    if (path === "/") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.end(html);
    }
    if (!/^\/(js|css|imgs)\/[\w./-]+$/.test(path) || path.includes("..")) {
      res.writeHead(404);
      return res.end();
    }
    const body = await readFile(new URL(path.slice(1), root));
    if (path.endsWith(".js"))
      res.setHeader("Content-Type", "text/javascript; charset=utf-8");
    if (path.endsWith(".css"))
      res.setHeader("Content-Type", "text/css; charset=utf-8");
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [],
  pageErrors = [],
  blocked = [];
async function pageFor(width, theme) {
  const context = await browser.newContext({
    viewport: { width, height: 950 },
  });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (
      url.origin === base ||
      url.origin === emulator ||
      url.hostname === "www.gstatic.com"
    )
      return route.continue();
    blocked.push(url.origin);
    return route.abort();
  });
  await context.addInitScript(
    (theme) => localStorage.setItem("theme", theme),
    theme,
  );
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(base);
  await page.evaluate(
    async ({ project }) => {
      const { initializeApp } =
        await import("https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js");
      const sdk =
        await import("https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js");
      const db = sdk.getFirestore(
        initializeApp({ projectId: project, apiKey: "synthetic-emulator-key" }),
      );
      sdk.connectFirestoreEmulator(db, "127.0.0.1", 18080, {
        mockUserToken: { sub: "synthetic-owner" },
      });
      window.firebaseDb = db;
      window.firebaseFunctions = sdk;
      window.currentUser = { role: "owner", name: "Тест" };
      window.testRead = async (collection, id) => {
        const snap = await sdk.getDocFromServer(sdk.doc(db, collection, id));
        return snap.exists() ? { id: snap.id, ...snap.data() } : null;
      };
      window.testList = async (collection) =>
        (await sdk.getDocsFromServer(sdk.collection(db, collection))).docs.map(
          (s) => ({
            id: s.id,
            ...s.data(),
          }),
        );
      window.testSeed = async (docs) => {
        for (const [path, data] of Object.entries(docs))
          await sdk.setDoc(sdk.doc(db, path), data);
      };
      window.testOperation = async ({
        collection,
        next,
        previous = null,
        reuse = false,
      }) => {
        try {
          const button = reuse ? (window.testButton ??= {}) : {};
          const id = await window.stockOperations.save(
            collection,
            next,
            previous,
            button,
          );
          return { ok: true, id };
        } catch (error) {
          return { ok: false, code: error.code, message: error.message };
        }
      };
    },
    { project },
  );
  await page.addScriptTag({ path: "node_modules/chart.js/dist/chart.umd.js" });
  await page.evaluate(() => {
    Chart.defaults.animation = false;
  });
  for (const file of ["product-lifecycle", "archive-operations", "stock-operations", "database", "ui", "app"])
    await page.addScriptTag({ url: `${base}/js/${file}.js` });
  await page.evaluate(() => {
    window.testErrors = [];
    window.testPending = 0;
    for (const name of [
      "saveProduct",
      "updateProduct",
      "saveIncome",
      "saveQuickIncome",
      "updateIncome",
      "saveEditedIncomeRecord",
      "deleteIncomeRecord",
      "saveSale",
      "updateSale",
      "deleteSale",
      "deleteIncome",
    ]) {
      const handler = window[name];
      window[name] = async (...args) => {
        window.testPending++;
        try {
          return await handler(...args);
        } finally {
          window.testPending--;
        }
      };
    }
    showError = (message) => {
      window.testErrors.push(message);
    };
    hideLoader();
    initTheme();
    initMobileMenu();
    document
      .querySelector(".modal-close")
      .addEventListener("click", closeModal);
    document.getElementById("auth-screen").classList.remove("active");
    document.getElementById("app-screen").classList.add("active");
  });
  return page;
}

async function reset(page) {
  const response = await fetch(
    `${emulator}/emulator/v1/projects/${project}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  assert.ok(response.ok);
  await page.evaluate((rows) => testSeed(rows), fixture());
  await page.evaluate(async () => {
    await Promise.all([loadProducts(), loadIncome(), loadSales(), loadPlans()]);
    switchSection("dashboard");
  });
  await flush(page);
}
async function flush(page) {
  await page.waitForFunction(() => testPending === 0);
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        updateDashboard();
        setTimeout(resolve, 200);
      }),
  );
}
async function texts(page, selector) {
  return page
    .locator(selector)
    .evaluateAll((nodes) =>
      nodes.map((n) => n.textContent.replace(/\s+/g, " ").trim()),
    );
}
async function snapshot(page) {
  return page.evaluate(() => ({
    values: [
      ...document.querySelectorAll(
        "#dashboard-section .stat-value, #dashboard-section .stat-value-small",
      ),
    ].map((n) => n.textContent),
    plan: [getFactForPlan(plans[0]), getProfitForPlan(plans[0])],
    averageTime: document.getElementById("avg-sale-time-container").innerHTML,
    charts: [salesChart, topProductsChart, distributionChart].map((c) => ({
      labels: c.data.labels,
      values: c.data.datasets[0].data,
    })),
    journals: JSON.stringify({ sales, income, plans }),
    cost: products.reduce((n, p) => n + p.cost * p.stock, 0),
    price: products.reduce((n, p) => n + p.price * p.stock, 0),
  }));
}
async function inspectForm(page, name, width, theme) {
  const checkbox = page
    .locator(".product-condition-label input")
    .filter({ visible: true });
  await checkbox.scrollIntoViewIfNeeded();
  const issues = await page.evaluate(() => {
    const modal = document.querySelector(".modal"),
      box = modal.getBoundingClientRect(),
      field = document
        .querySelector(".product-condition-field")
        .getBoundingClientRect();
    const issues = [];
    if (document.documentElement.scrollWidth > innerWidth + 1)
      issues.push("page overflow");
    if (box.left < 0 || box.right > innerWidth + 1)
      issues.push("modal overflow");
    if (field.left < box.left || field.right > box.right)
      issues.push("checkbox outside modal");
    return issues;
  });
  assert.deepEqual(issues, [], name + " " + width);
  await page.screenshot({
    path: new URL(`${name}-${width}-${theme}.png`, output).pathname.replace(
      /^\/(\w:)/,
      "$1",
    ),
  });
  const tip = page
    .locator("[data-tooltip=secondhand-product]")
    .filter({ visible: true });
  await tip.dispatchEvent("mouseenter");
  await expect(page.locator(".custom-tooltip")).toHaveClass(/show/);
  await expect(page.locator(".custom-tooltip")).toContainText(
    "только к этой карточке",
  );
  const tipBox = await page.locator(".custom-tooltip").boundingBox();
  assert.ok(tipBox.x >= 0 && tipBox.x + tipBox.width <= width + 1);
  await page.screenshot({
    path: new URL(
      `${name}-tooltip-${width}-${theme}.png`,
      output,
    ).pathname.replace(/^\/(\w:)/, "$1"),
  });
  await tip.dispatchEvent("mouseleave");
}
async function save(page, label) {
  await page
    .locator("#modal-body")
    .getByRole("button", { name: label, exact: true })
    .click();
  await page.waitForFunction(() => testPending === 0);
  assert.deepEqual(await page.evaluate(() => testErrors), []);
  await expect(page.locator("#modal-overlay")).not.toHaveClass(/active/);
  await flush(page);
}
async function edit(page, id) {
  await page.evaluate((id) => {
    switchSection("products");
    editProduct(id);
  }, id);
  await expect(page.locator("#modal-overlay")).toHaveClass(/active/);
}
await mkdir(output, { recursive: true });
try {
  for (const width of [1440, 390])
    for (const theme of ["dark", "light"]) {
      const page = await pageFor(width, theme);
      await reset(page);
      const baseline = await snapshot(page);
      assert.deepEqual(baseline.plan, [1300, 720]);
      assert.equal(baseline.cost, 970);
      assert.equal(baseline.price, 3250);
      assert.deepEqual(
        await texts(
          page,
          "#period-sales, #period-sales-count, #period-profit, #total-stock",
        ),
        ["1 050 ₽", "720 ₽", "3", "17"],
      );
      assert.deepEqual(
        await texts(page, ".margin-card.brand .margin-stat-value"),
        ["65.0%", "173,33 ₽", "520 ₽", "3"],
      );
      assert.deepEqual(
        await texts(page, ".margin-card.secondhand .margin-stat-value"),
        ["80.0%", "200 ₽", "200 ₽", "1"],
      );
      assert.deepEqual(await texts(page, ".markup-value"), ["2.88x", "4.25x"]);
      assert.deepEqual(await texts(page, ".sold-percent-value"), [
        "25.0%",
        "10.0%",
      ]);
      assert.deepEqual((await texts(page, ".size-name")).sort(), [
        "M",
        "S",
        "XS",
      ]);
      await expect(page.locator(".stale-list")).toContainText(
        "Новый товар 100 дней",
      );
      await expect(page.locator(".stale-list")).toContainText(
        "Секонд 130 дней",
      );
      await expect(page.locator(".stale-list")).not.toContainText(
        "Секонд 100 дней",
      );
      await page.locator(".abc-tab[data-type=brand]").click();
      await expect(page.locator("#abc-content")).toContainText(
        "Новая вещь бренда",
      );
      await expect(page.locator("#abc-content")).not.toContainText(
        "Бывшая в употреблении",
      );
      await page.locator(".abc-tab[data-type=secondhand]").click();
      await expect(page.locator("#abc-content")).toContainText(
        "Бывшая в употреблении",
      );
      await expect(page.locator("#abc-content")).not.toContainText(
        "Новая вещь бренда",
      );
      for (const [type, values] of [
        ["brand", ["60 дн.", "0.1", "4", "600 ₽"]],
        ["secondhand", ["90 дн.", "0.0", "3", "250 ₽"]],
      ]) {
        await page.locator(".turnover-tab[data-type=" + type + "]").click();
        assert.deepEqual(
          await texts(
            page,
            '.brand-card:has(.brand-name:text-is("Mixed")) .brand-stat-value',
          ),
          values,
        );
      }
      await page.evaluate(() => {
        switchABCType("all");
        switchTurnoverType("all");
      });
      const original = await page.evaluate(() => testList("products"));
      await edit(page, "new");
      await expect(page.locator("#product-permanent-supplier")).toBeChecked();
      await expect(page.locator("#product-secondhand")).not.toBeChecked();
      await page.locator("#product-secondhand").check();
      await inspectForm(page, "edit", width, theme);
      await save(page, "Сохранить изменения");
      const updated = await page.evaluate(() => testList("products"));
      assert.deepEqual(
        updated,
        original.map((p) =>
          p.id === "new" ? { ...p, isSecondhand: true } : p,
        ),
      );
      assert.deepEqual(
        await snapshot(page),
        baseline,
        "Condition must not change overall sales, profits, stock, charts, journals, plans or sale times",
      );
      await page.evaluate(() => switchSection("dashboard"));
      assert.deepEqual(
        await texts(page, ".margin-card.brand .margin-stat-value"),
        ["60.0%", "120 ₽", "120 ₽", "1"],
      );
      assert.deepEqual(
        await texts(page, ".margin-card.secondhand .margin-stat-value"),
        ["70.6%", "200 ₽", "600 ₽", "3"],
      );
      assert.deepEqual(await texts(page, ".markup-value"), ["2.83x", "4.00x"]);
      assert.deepEqual(await texts(page, ".sold-percent-value"), [
        "16.7%",
        "18.8%",
      ]);
      assert.deepEqual((await texts(page, ".size-name")).sort(), ["S", "XS"]);
      await page.locator(".abc-tab[data-type=secondhand]").click();
      await expect(page.locator("#abc-content")).toContainText(
        "Новая вещь бренда",
      );
      await page.locator(".turnover-tab[data-type=secondhand]").click();
      assert.deepEqual(
        await texts(
          page,
          '.brand-card:has(.brand-name:text-is("Mixed")) .brand-stat-value',
        ),
        ["70 дн.", "0.1", "7", "850 ₽"],
      );
      for (const key of [
        "margin-by-type",
        "markup-coefficient",
        "size-analysis",
        "brand-turnover",
        "sold-percentage",
        "stale-products",
      ]) {
        const block = page.locator("#" + key + "-container").locator("..");
        await block.screenshot({
          path: new URL(
            `${key}-${width}-${theme}.png`,
            output,
          ).pathname.replace(/^\/(\w:)/, "$1"),
        });
      }
      await edit(page, "new");
      await expect(page.locator("#product-secondhand")).toBeChecked();
      await page.locator("#product-secondhand").uncheck();
      await save(page, "Сохранить изменения");
      assert.deepEqual(await snapshot(page), baseline);
      await edit(page, "stale-new");
      await page.locator("#product-secondhand").check();
      await save(page, "Сохранить изменения");
      await expect(page.locator(".stale-list")).not.toContainText(
        "Новый товар 100 дней",
      );
      await edit(page, "legacy-used");
      await expect(page.locator("#product-secondhand")).toBeChecked();
      await save(page, "Сохранить изменения");
      assert.equal(
        (await page.evaluate(() => testRead("products", "legacy-used")))
          .isSecondhand,
        true,
      );
      await edit(page, "legacy-new");
      await expect(page.locator("#product-secondhand")).not.toBeChecked();
      await save(page, "Сохранить изменения");
      assert.equal(
        (await page.evaluate(() => testRead("products", "legacy-new")))
          .isSecondhand,
        false,
      );
      await page.evaluate(() => switchSection("products"));
      await page.locator("#add-product-btn").click();
      await expect(page.locator("#product-secondhand")).toBeEnabled();
      await expect(page.locator("#product-secondhand")).not.toBeChecked();
      await page.locator("#product-name").fill("Новый тестовый секонд");
      await page.locator("#product-secondhand").check();
      for (const brand of ["Mixed", "Other", "", "Mixed"]) {
        await page.locator("#product-brand").fill(brand);
        await expect(page.locator("#product-secondhand")).toBeChecked();
      }
      await expect(page.locator("#product-permanent-supplier")).toBeChecked();
      await page.locator("#product-permanent-supplier").uncheck();
      await expect(page.locator("#product-secondhand")).toBeChecked();
      await page.locator("#product-permanent-supplier").check();
      await inspectForm(page, "create", width, theme);
      await page.locator("#product-cost").fill("10");
      await page.locator("#product-price").fill("30");
      await page
        .locator("#modal-body")
        .getByRole("button", { name: "+ Приход", exact: true })
        .click();
      await page.locator("#initial-income-quantity").fill("2");
      await save(page, "Сохранить");
      const created = (await page.evaluate(() => testList("products"))).find(
        (p) => p.name === "Новый тестовый секонд",
      );
      assert.equal(created.isSecondhand, true);
      assert.equal(created.isPermanentSupplier, true);
      assert.equal(created.stock, 2);
      const receipts = await page.evaluate(() => testList("income"));
      assert.equal(
        receipts.find((i) => i.productId === created.id).quantity,
        2,
      );
      await page.evaluate(() => switchSection("income"));
      await page.locator("#add-income-btn").click();
      await page
        .locator("#modal-body")
        .getByRole("button", { name: "+ Новый товар", exact: true })
        .click();
      await page.locator("#new-product-name").fill("Секонд через поступление");
      await expect(page.locator("#new-product-secondhand")).not.toBeChecked();
      await page.locator("#new-product-secondhand").check();
      await page.locator("#new-product-brand").fill("Mixed");
      await expect(
        page.locator("#new-product-permanent-supplier"),
      ).toBeChecked();
      await page.locator("#new-product-cost").fill("10");
      await page.locator("#new-product-price").fill("30");
      await page.locator("#income-quantity").fill("3");
      await inspectForm(page, "receipt-create", width, theme);
      await save(page, "Сохранить поступление");
      const received = (await page.evaluate(() => testList("products"))).find(
        (p) => p.name === "Секонд через поступление",
      );
      assert.equal(received.isSecondhand, true);
      assert.equal(received.isPermanentSupplier, true);
      assert.equal(received.stock, 3);
      // Narrowest supported viewport: both long filter labels wrap within the dashboard.
      await page.setViewportSize({ width: 320, height: 950 });
      await page.evaluate(() => switchSection("dashboard"));
      await flush(page);
      const overflow = await page.evaluate(() => ({
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        offenders: [...document.querySelectorAll("#dashboard-section *")]
          .filter((e) => e.getBoundingClientRect().right > innerWidth + 1)
          .slice(0, 12)
          .map((e) => ({
            tag: e.tagName,
            class: e.className,
            width: e.getBoundingClientRect().width,
          })),
      }));
      assert.ok(
        overflow.scrollWidth <= overflow.width + 1,
        JSON.stringify(overflow),
      );
      results.push({
        width,
        theme,
        classification: true,
        metrics: 7,
        unchangedTotals: true,
        forms: 3,
        isolatedProduct: true,
        legacyCompatibility: true,
      });
      await page.context().close();
    }
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(blocked, []);
  await writeFile(
    new URL("results.json", output),
    JSON.stringify(
      { results, productionRequests: 0, errors: pageErrors },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ passed: results.length, results, productionRequests: 0 }),
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
