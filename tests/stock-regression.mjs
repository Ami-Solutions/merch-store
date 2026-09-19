// Uses ONLY the local Firestore emulator and synthetic documents.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const project = "demo-merch-stock-tests";
const emulator = "http://127.0.0.1:18080";
const output = new URL("../output/stock-regression/", import.meta.url);
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
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [],
  pageErrors = [],
  blocked = [];
const date = "2026-09-16T10:00:00.000Z";
const product = (stock = 1, extra = {}) => ({
  name: "Тестовый товар",
  size: "XL",
  cost: 100,
  price: 200,
  stock,
  ...extra,
});
const receipt = (quantity = 1, productId = "P") => ({
  productId,
  productName: "Тестовый товар (XL)",
  quantity,
  cost: 100,
  totalAmount: quantity * 100,
  date,
});
const sale = (quantity = 1, productId = "P") => ({
  items: [
    {
      productId,
      productName: "Тестовый товар (XL)",
      quantity,
      price: 200,
      priceType: "original",
      total: quantity * 200,
    },
  ],
  totalAmount: quantity * 200,
  seller: "Тест",
  date,
  excludeFromStats: false,
});

async function pageFor(width) {
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
  for (const file of ["stock-operations", "database", "ui", "app"])
    await page.addScriptTag({ url: `${base}/js/${file}.js` });
  await page.evaluate(() => {
    window.testErrors = [];
    window.testPending = 0;
    for (const name of [
      "saveProduct",
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
    updateDashboard = () => {};
    document.getElementById("auth-screen").classList.remove("active");
    document.getElementById("app-screen").classList.add("active");
  });
  return page;
}

async function reset(page, docs) {
  // This deletion is explicitly limited to a demo project on loopback.
  const response = await fetch(
    `${emulator}/emulator/v1/projects/${project}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  assert.ok(response.ok);
  await page.evaluate((docs) => testSeed(docs), docs);
  await page.evaluate(async () => {
    closeModal();
    window.testErrors = [];
    window.testButton = null;
    await loadProducts();
    await loadIncome();
    await loadSales();
  });
}
const read = (page, collection = "products", id = "P") =>
  page.evaluate(([c, id]) => testRead(c, id), [collection, id]);
const list = (page, c) => page.evaluate((c) => testList(c), c);
const op = (page, collection, next, previous = null, reuse = false) =>
  page.evaluate((value) => testOperation(value), {
    collection,
    next,
    previous,
    reuse,
  });
async function check(name, fn) {
  await fn();
  results.push(name);
  console.log("PASS " + name);
}
async function submit(page) {
  const button = await page
    .locator("#modal-body button.btn-primary")
    .elementHandle();
  await button.click();
  await page.waitForFunction(
    (button) =>
      window.testPending === 0 &&
      (!button.isConnected ||
        !document
          .getElementById("modal-overlay")
          .classList.contains("active") ||
        window.testErrors.length > 0),
    button,
  );
  assert.deepEqual(await page.evaluate(() => window.testErrors), []);
}

try {
  const page = await pageFor(1440),
    other = await pageFor(390);
  for (const [label, current] of [
    ["desktop", page],
    ["mobile", other],
  ]) {
    await check(
      `${label}: unchanged/date-only receipt saves preserve stock`,
      async () => {
        await reset(current, {
          "products/P": product(),
          "income/I": receipt(),
        });
        for (let i = 0; i < 3; i++) {
          await current.evaluate(() => editIncome("I"));
          if (i === 2)
            await current.locator("#income-date").fill("2026-09-17T12:00");
          await submit(current);
          assert.equal((await read(current)).stock, 1);
          assert.equal((await read(current, "income", "I")).quantity, 1);
        }
      },
    );
    await check(`${label}: receipt quantity changes by delta`, async () => {
      await current.evaluate(() => editIncome("I"));
      await current.locator("#income-quantity").fill("2");
      await submit(current);
      assert.equal((await read(current)).stock, 2);
    });
    await check(
      `${label}: history editor uses the same transaction`,
      async () => {
        await current.evaluate(() => editIncomeRecord("I", "P"));
        await current.locator("#edit-income-quantity").fill("3");
        await submit(current);
        assert.equal((await read(current)).stock, 3);
        const doc = await read(current, "income", "I");
        assert.equal(doc.quantity, 3);
        assert.equal(doc.totalAmount, 300);
        await current.screenshot({
          path: new URL(`${label}-history.png`, output).pathname.replace(
            /^\/(\w:)/,
            "$1",
          ),
        });
      },
    );
    await check(
      `${label}: quick receipt and zero-stock cart validation`,
      async () => {
        await reset(current, { "products/P": product(0) });
        await current.evaluate(() => showQuickIncome("P"));
        await submit(current);
        assert.equal((await read(current)).stock, 1);
        assert.equal((await list(current, "income")).length, 1);
        await reset(current, { "products/P": product(0) });
        await current.locator("#add-sale-btn").dispatchEvent("click");
        await current.evaluate(() => {
          document.getElementById("sale-product-id").value = "P";
          addSaleItem();
        });
        assert.equal(await current.evaluate("currentSaleItems.length"), 0);
        assert.equal((await current.evaluate(() => testErrors)).length, 1);
        assert.equal((await list(current, "sales")).length, 0);
      },
    );
    await check(
      `${label}: catalog form creates product and opening receipt together`,
      async () => {
        await reset(current, {});
        await current.locator("#add-product-btn").dispatchEvent("click");
        await current.locator("#product-name").fill("Новый тестовый товар");
        await current.locator("#product-cost").fill("100");
        await current.locator("#product-price").fill("200");
        await current.locator('[onclick="toggleInitialIncomeForm()"]').click();
        await current.locator("#initial-income-quantity").fill("2");
        await submit(current);
        const products = await list(current, "products"),
          receipts = await list(current, "income");
        assert.equal(products.length, 1);
        assert.equal(products[0].stock, 2);
        assert.equal(receipts.length, 1);
        assert.equal(receipts[0].productId, products[0].id);
        assert.equal(receipts[0].quantity, 2);
      },
    );
    await check(
      `${label}: normal receipt form and history deletion maintain stock`,
      async () => {
        await reset(current, { "products/P": product(0) });
        await current.locator("#add-income-btn").dispatchEvent("click");
        await current.locator("#income-product-search").fill("Тестовый");
        await current
          .locator('#income-product-dropdown [data-product-id="P"]')
          .click();
        await current.locator("#income-quantity").fill("2");
        await submit(current);
        assert.equal((await read(current)).stock, 2);
        await current.evaluate(() => showIncomeHistory("P"));
        await current.locator("#modal-body button.ih-delete").click();
        await current.waitForFunction(() => window.testPending === 0);
        assert.equal((await read(current)).stock, 0);
        assert.equal((await list(current, "income")).length, 0);
      },
    );
    await check(
      `${label}: sale form, unchanged edit, quantity edit and deletion`,
      async () => {
        await reset(current, {
          "products/P": product(2),
          "income/I": receipt(2),
        });
        await current.locator("#add-sale-btn").dispatchEvent("click");
        await current.locator("#sale-product-search").fill("Тестовый");
        await current
          .locator('#sale-product-dropdown [data-product-id="P"]')
          .click();
        await current.locator('[onclick="addSaleItem()"]').click();
        await current.locator("#sale-exclude-stats").check();
        await submit(current);
        const sales = await list(current, "sales");
        assert.equal(sales.length, 1);
        assert.equal(sales[0].excludeFromStats, true);
        assert.equal((await read(current)).stock, 1);
        await current.evaluate((id) => editSale(id), sales[0].id);
        await submit(current);
        assert.equal((await read(current)).stock, 1);
        await current.evaluate((id) => {
          editSale(id);
          updateSaleItem(0, "quantity", "2");
        }, sales[0].id);
        await submit(current);
        assert.equal((await read(current)).stock, 0);
        await current.evaluate(
          (id) => deleteSale(id, document.createElement("button")),
          sales[0].id,
        );
        assert.equal((await read(current)).stock, 2);
        assert.equal((await list(current, "sales")).length, 0);
      },
    );
  }
  await check(
    "new product through receipt form commits its initial stock atomically",
    async () => {
      await reset(page, {});
      await page.locator("#add-income-btn").dispatchEvent("click");
      await page.evaluate(() => {
        document.getElementById("income-product-id").value = "new";
        document.getElementById("income-quantity-wrapper").style.display =
          "block";
        document.getElementById("new-product-form").style.display = "block";
      });
      await page.locator("#new-product-name").fill("Тестовый новый приход");
      await page.locator("#new-product-cost").fill("100");
      await page.locator("#new-product-price").fill("200");
      await page.locator("#income-quantity").fill("3");
      await submit(page);
      const products = await list(page, "products"),
        receipts = await list(page, "income");
      assert.equal(products.length, 1);
      assert.equal(products[0].stock, 3);
      assert.equal(receipts.length, 1);
      assert.equal(receipts[0].productId, products[0].id);
    },
  );
  await check(
    "same quantity on an already inflated legacy balance preserves that balance",
    async () => {
      await reset(page, { "products/P": product(4), "income/I": receipt(2) });
      assert.ok(
        (
          await op(
            page,
            "income",
            { ...receipt(2), date: "2026-09-18T10:00:00Z" },
            { id: "I", ...receipt(2) },
          )
        ).ok,
      );
      assert.equal((await read(page)).stock, 4);
    },
  );
  await check(
    "receipt reduction after partial sale uses net delta",
    async () => {
      await reset(page, {
        "products/P": product(1),
        "income/I": receipt(5),
        "sales/S": sale(4),
      });
      assert.ok(
        (await op(page, "income", receipt(4), { id: "I", ...receipt(5) })).ok,
      );
      assert.equal((await read(page)).stock, 0);
      assert.equal(
        (await op(page, "income", receipt(3), { id: "I", ...receipt(4) })).ok,
        false,
      );
      assert.equal((await read(page, "income", "I")).quantity, 4);
    },
  );
  await check(
    "changing receipt product updates both stocks atomically",
    async () => {
      await reset(page, {
        "products/P": product(2),
        "products/Q": product(0),
        "income/I": receipt(2),
      });
      assert.ok(
        (await op(page, "income", receipt(3, "Q"), { id: "I", ...receipt(2) }))
          .ok,
      );
      assert.equal((await read(page)).stock, 0);
      assert.equal((await read(page, "products", "Q")).stock, 3);
    },
  );
  await check(
    "receipt deletion cannot hide a shortage by clamping stock",
    async () => {
      await reset(page, {
        "products/P": product(0),
        "income/I": receipt(),
        "sales/S": sale(),
      });
      assert.equal(
        (await op(page, "income", null, { id: "I", ...receipt() })).ok,
        false,
      );
      assert.equal((await read(page)).stock, 0);
      assert.ok(await read(page, "income", "I"));
    },
  );
  await check(
    "two browser tabs receive concurrently without losing stock",
    async () => {
      await reset(page, { "products/P": product(0) });
      const results = await Promise.all([
        op(page, "income", receipt()),
        op(other, "income", receipt()),
      ]);
      assert.ok(results.every((r) => r.ok));
      assert.equal((await read(page)).stock, 2);
      assert.equal((await list(page, "income")).length, 2);
    },
  );
  await check("two browser tabs cannot sell the same last item", async () => {
    await reset(page, { "products/P": product(1) });
    const results = await Promise.all([
      op(page, "sales", sale()),
      op(other, "sales", sale()),
    ]);
    assert.equal(results.filter((r) => r.ok).length, 1);
    assert.equal((await read(page)).stock, 0);
    assert.equal((await list(page, "sales")).length, 1);
  });
  await check("stale receipt editor rejects concurrent changes", async () => {
    await reset(page, { "products/P": product(1), "income/I": receipt() });
    const previous = { id: "I", ...receipt() };
    const results = await Promise.all([
      op(page, "income", receipt(2), previous),
      op(other, "income", receipt(3), previous),
    ]);
    assert.equal(results.filter((r) => r.ok).length, 1);
    assert.equal(
      (await read(page)).stock,
      (await read(page, "income", "I")).quantity,
    );
  });
  await check("duplicate sale deletion restores stock once", async () => {
    await reset(page, { "products/P": product(0), "sales/S": sale() });
    const previous = { id: "S", ...sale() };
    const results = await Promise.all([
      op(page, "sales", null, previous),
      op(other, "sales", null, previous),
    ]);
    assert.ok(results.every((r) => r.ok));
    assert.equal((await read(page)).stock, 1);
  });
  await check(
    "multi-item sale rejects the entire basket when one item is short",
    async () => {
      await reset(page, { "products/P": product(2), "products/Q": product(0) });
      const next = {
        ...sale(),
        items: [...sale().items, ...sale(1, "Q").items],
        totalAmount: 400,
      };
      assert.equal((await op(page, "sales", next)).ok, false);
      assert.equal((await read(page)).stock, 2);
      assert.equal((await list(page, "sales")).length, 0);
    },
  );
  await check(
    "security-rule write failure rolls back every stock and document write",
    async () => {
      await reset(page, {
        "products/P": product(2),
        "products/Q": product(1, { rejectStockWrite: true }),
      });
      const next = {
        ...sale(),
        items: [...sale().items, ...sale(1, "Q").items],
        totalAmount: 400,
      };
      const result = await op(page, "sales", next);
      assert.equal(result.ok, false);
      assert.equal(result.code, "permission-denied");
      assert.equal((await read(page)).stock, 2);
      assert.equal((await read(page, "products", "Q")).stock, 1);
      assert.equal((await list(page, "sales")).length, 0);
    },
  );
  await check(
    "retry with the same request does not create a second receipt",
    async () => {
      await reset(page, { "products/P": product(0) });
      const first = await op(page, "income", receipt(), null, true),
        second = await op(page, "income", receipt(), null, true);
      assert.ok(first.ok && second.ok);
      assert.equal(first.id, second.id);
      assert.equal((await read(page)).stock, 1);
      assert.equal((await list(page, "income")).length, 1);
      assert.equal(
        (await op(page, "income", receipt(2), null, true)).ok,
        false,
      );
    },
  );
  await check(
    "invalid quantities and missing products cannot create partial operations",
    async () => {
      await reset(page, { "products/P": product(2) });
      for (const quantity of [0, -1, 1.5])
        assert.equal((await op(page, "income", receipt(quantity))).ok, false);
      assert.equal((await op(page, "sales", sale(1, "missing"))).ok, false);
      assert.equal((await list(page, "income")).length, 0);
      assert.equal((await list(page, "sales")).length, 0);
      assert.equal((await read(page)).stock, 2);
    },
  );
  await check(
    "old negative stock can improve but cannot be sold further",
    async () => {
      await reset(page, { "products/P": product(-2) });
      assert.ok((await op(page, "income", receipt())).ok);
      assert.equal((await read(page)).stock, -1);
      assert.equal((await op(page, "sales", sale())).ok, false);
      assert.equal((await read(page)).stock, -1);
    },
  );
  await check("sale edit applies delta and rejects stale version", async () => {
    await reset(page, { "products/P": product(2), "sales/S": sale() });
    const previous = { id: "S", ...sale() };
    assert.ok((await op(page, "sales", sale(2), previous)).ok);
    assert.equal((await read(page)).stock, 1);
    assert.equal((await op(page, "sales", sale(3), previous)).ok, false);
    assert.equal((await read(page)).stock, 1);
  });
  await check("new product and opening receipt commit together", async () => {
    await reset(page, {});
    const id = await page.evaluate(
      async ({ product, receipt }) =>
        stockOperations.createProduct(product, receipt, {}),
      { product: product(2), receipt: receipt(2) },
    );
    assert.equal((await read(page, "products", id)).stock, 2);
    const income = await list(page, "income");
    assert.equal(income.length, 1);
    assert.equal(income[0].productId, id);
    assert.equal(income[0].quantity, 2);
  });
  await check(
    "product creation retry keeps one product and rejects changed opening receipt",
    async () => {
      await reset(page, {});
      const result = await page.evaluate(
        async ({ product, receipt }) => {
          const button = {};
          const first = await stockOperations.createProduct(
            {
              ...product,
              article: "100001",
              createdAt: "2026-09-16T10:00:00Z",
            },
            receipt,
            button,
          );
          const second = await stockOperations.createProduct(
            {
              ...product,
              article: "100002",
              createdAt: "2026-09-16T10:00:05Z",
            },
            receipt,
            button,
          );
          let rejected = false;
          try {
            await stockOperations.createProduct(
              product,
              { ...receipt, date: "2026-09-17T10:00:00Z" },
              button,
            );
          } catch {
            rejected = true;
          }
          return { first, second, rejected };
        },
        { product: product(2), receipt: receipt(2) },
      );
      assert.equal(result.first, result.second);
      assert.equal(result.rejected, true);
      assert.equal((await list(page, "products")).length, 1);
      assert.equal((await list(page, "income")).length, 1);
    },
  );
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(blocked, []);
  await mkdir(output, { recursive: true });
  await writeFile(
    new URL("result.json", output),
    JSON.stringify(
      {
        passed: results.length,
        results,
        productionRequests: 0,
        project,
        checkedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(`PASS ${results.length} checks; no production requests`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
