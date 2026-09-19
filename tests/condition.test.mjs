import { readFile } from "node:fs/promises";
import vm from "node:vm";
import assert from "node:assert/strict";
import { test } from "node:test";
const elements = new Map();
const context = vm.createContext({
  window: {},
  document: {
    getElementById: (id) => {
      if (!elements.has(id))
        elements.set(id, { innerHTML: "", addEventListener() {} });
      return elements.get(id);
    },
  },
  products: [],
  sales: [],
  income: [],
  plans: [],
  formatCurrency: (n) => String(n),
});
vm.runInContext(
  await readFile(new URL("../js/ui.js", import.meta.url), "utf8"),
  context,
);
test("Explicit condition overrides either supplier value, including false", () => {
  for (const supplier of [true, false, undefined])
    for (const secondhand of [true, false]) {
      const p = { isPermanentSupplier: supplier, isSecondhand: secondhand };
      assert.equal(context.isSecondhandProduct(p), secondhand);
      assert.equal(context.isReorderableProduct(p), !!supplier && !secondhand);
    }
});
test("Legacy cards retain their previous classification without modifying the card", () => {
  for (const supplier of [true, false, undefined])
    for (const flag of [undefined, null, "false"]) {
      const p = { isPermanentSupplier: supplier, isSecondhand: flag },
        before = structuredClone(p);
      assert.equal(context.isSecondhandProduct(p), !supplier);
      assert.deepEqual(p, before);
    }
});
test("Empty or zero-price groups never display NaN or Infinity", () => {
  for (const products of [
    [],
    [{ cost: 100, price: 300, isSecondhand: true }],
    [{ cost: 100, price: 0, isSecondhand: false }],
  ]) {
    context.products = products;
    context.renderMarkupCoefficient();
    assert.doesNotMatch(
      elements.get("markup-coefficient-container").innerHTML,
      /NaN|Infinity/,
    );
  }
});
