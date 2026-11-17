/**
 * Tests for dataTasks.ts
 * Uses node:test and node:assert/strict only.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  mulberry32,
  generateSalesDataset,
  computeCheck,
  buildSalesChecks,
  describeTrends,
  isAnswerCorrect,
  generateFootingsDataset,
  buildFootingChecks,
  type Dataset,
  type DataRow,
  type CheckSpec,
  type DataCheck,
  type DatasetTheme,
  type TableData,
} from "./dataTasks.js";

describe("mulberry32", () => {
  test("same seed produces same sequence", () => {
    const r1 = mulberry32(42);
    const r2 = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      assert.equal(r1(), r2());
    }
  });

  test("different seeds produce different sequences", () => {
    const r1 = mulberry32(1);
    const r2 = mulberry32(2);
    let same = true;
    for (let i = 0; i < 10; i++) {
      if (r1() !== r2()) {
        same = false;
        break;
      }
    }
    assert.equal(same, false);
  });

  test("returns values in [0, 1)", () => {
    const r = mulberry32(123);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      assert.ok(v >= 0 && v < 1);
    }
  });
});

describe("generateSalesDataset", () => {
  test("same seed + theme gives identical datasets", () => {
    const d1 = generateSalesDataset(42, "retail");
    const d2 = generateSalesDataset(42, "retail");
    assert.deepEqual(d1, d2);
  });

  test("different seeds give different datasets", () => {
    const d1 = generateSalesDataset(1, "retail");
    const d2 = generateSalesDataset(2, "retail");
    assert.notDeepEqual(d1, d2);
  });

  for (const theme of ["retail", "building-materials"] as DatasetTheme[]) {
    test(`${theme}: 24 rows, correct columns, units >= 1, revenue integer divisible by units`, () => {
      const ds = generateSalesDataset(999, theme);

      // 24 rows
      assert.equal(ds.rows.length, 24);

      // columns exactly as specified
      assert.deepEqual(ds.columns, ["month", "product", "units", "revenue"]);

      // currency
      assert.equal(ds.currency, "INR");

      // units are integers >= 1, revenue is integer divisible by units
      for (const row of ds.rows) {
        const units = Number(row.units);
        const revenue = Number(row.revenue);
        assert.ok(Number.isInteger(units) && units >= 1);
        assert.ok(Number.isInteger(revenue));
        assert.equal(revenue % units, 0);
      }

      // months ordered 2026-01 to 2026-06
      const months = [...new Set(ds.rows.map((r) => r.month))];
      assert.deepEqual(months, ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]);

      // exactly 4 products per theme
      const products = [...new Set(ds.rows.map((r) => r.product))];
      assert.equal(products.length, 4);

      // ordered by month, then product list order
      const expectedProducts =
        theme === "retail"
          ? ["Notebooks", "Backpacks", "Water Bottles", "Desk Lamps"]
          : ["Cement (50kg bag)", "TMT Steel (kg)", "River Sand (tonne)", "Bricks (1000)"];

      for (let mIndex = 0; mIndex < months.length; mIndex++) {
        const monthRows = ds.rows.slice(mIndex * 4, (mIndex + 1) * 4);
        const monthProducts = monthRows.map((r) => r.product);
        assert.deepEqual(monthProducts, expectedProducts);
      }
    });
  }
});

describe("computeCheck", () => {
  const fixedRows: DataRow[] = [
    { month: "2026-01", product: "A", units: 2, revenue: 20 },
    { month: "2026-01", product: "B", units: 3, revenue: 60 },
    { month: "2026-02", product: "A", units: 4, revenue: 40 },
    { month: "2026-02", product: "B", units: 1, revenue: 20 },
  ];

  test("sum revenue = 140", () => {
    const spec: CheckSpec = { op: "sum", column: "revenue" };
    assert.equal(computeCheck(fixedRows, spec), 140);
  });

  test("mean units = 2.5", () => {
    const spec: CheckSpec = { op: "mean", column: "units" };
    assert.equal(computeCheck(fixedRows, spec), 2.5);
  });

  test("count where product='A' = 2", () => {
    const spec: CheckSpec = { op: "count", where: [{ column: "product", equals: "A" }] };
    assert.equal(computeCheck(fixedRows, spec), 2);
  });

  test("sum_product [units, revenue] = 400", () => {
    // (2*20) + (3*60) + (4*40) + (1*20) = 40 + 180 + 160 + 20 = 400
    const spec: CheckSpec = { op: "sum_product", columns: ["units", "revenue"] };
    assert.equal(computeCheck(fixedRows, spec), 400);
  });

  test("top_group product on revenue = 'B'", () => {
    // A total: 20 + 40 = 60, B total: 60 + 20 = 80
    const spec: CheckSpec = { op: "top_group", groupBy: "product", column: "revenue" };
    assert.equal(computeCheck(fixedRows, spec), "B");
  });

  test("pct_change revenue by month from 2026-01 to 2026-02 = -25", () => {
    // 2026-01 total: 80, 2026-02 total: 60
    // ((60 - 80) / 80) * 100 = -25
    const spec: CheckSpec = {
      op: "pct_change",
      column: "revenue",
      groupBy: "month",
      from: "2026-01",
      to: "2026-02",
    };
    assert.equal(computeCheck(fixedRows, spec), -25);
  });

  test("throws for unknown column", () => {
    const spec: CheckSpec = { op: "sum", column: "nonexistent" };
    assert.throws(() => computeCheck(fixedRows, spec), /Column "nonexistent" does not exist/);
  });

  test("throws for mean over zero matching rows", () => {
    const spec: CheckSpec = {
      op: "mean",
      column: "units",
      where: [{ column: "product", equals: "Z" }],
    };
    assert.throws(() => computeCheck(fixedRows, spec), /Cannot compute mean over zero matching rows/);
  });

  test("throws for pct_change when from total is zero", () => {
    const spec: CheckSpec = {
      op: "pct_change",
      column: "revenue",
      groupBy: "month",
      from: "2026-03",
      to: "2026-02",
    };
    assert.throws(() => computeCheck(fixedRows, spec), /Cannot compute pct_change: 'from' total is zero/);
  });
});

describe("isAnswerCorrect", () => {
  const numberCheck: DataCheck = {
    id: "test",
    label: "Test",
    question: "Test",
    spec: { op: "sum", column: "revenue" },
    answerType: "NUMBER",
    tolerance: 0,
    marks: 10,
  };

  const categoryCheck: DataCheck = {
    id: "test",
    label: "Test",
    question: "Test",
    spec: { op: "top_group", groupBy: "product", column: "revenue" },
    answerType: "CATEGORY",
    tolerance: 0,
    marks: 10,
  };

  test("₹1,23,456 is correct for 123456 (tolerance 0)", () => {
    assert.equal(isAnswerCorrect(numberCheck, 123456, "₹1,23,456"), true);
  });

  test("12.5% is correct for 12.5 (tolerance 0.1)", () => {
    const check = { ...numberCheck, tolerance: 0.1 };
    assert.equal(isAnswerCorrect(check, 12.5, "12.5%"), true);
  });

  test("12.7 is NOT correct for 12.5 (tolerance 0.1)", () => {
    const check = { ...numberCheck, tolerance: 0.1 };
    assert.equal(isAnswerCorrect(check, 12.5, "12.7"), false);
  });

  test("abc is false", () => {
    assert.equal(isAnswerCorrect(numberCheck, 100, "abc"), false);
  });

  test("'  cement (50kg bag) ' is correct for category 'Cement (50kg bag)'", () => {
    assert.equal(isAnswerCorrect(categoryCheck, "Cement (50kg bag)", "  cement (50kg bag) "), true);
  });

  test("removes INR, Rs, Rs., spaces, commas, %", () => {
    assert.equal(isAnswerCorrect(numberCheck, 1000, "INR 1,000"), true);
    assert.equal(isAnswerCorrect(numberCheck, 1000, "Rs 1,000"), true);
    assert.equal(isAnswerCorrect(numberCheck, 1000, "Rs. 1,000"), true);
    assert.equal(isAnswerCorrect(numberCheck, 1000, " 1 000 "), true);
    assert.equal(isAnswerCorrect(numberCheck, 50, "50%"), true);
  });
});

describe("buildSalesChecks", () => {
  for (const theme of ["retail", "building-materials"] as DatasetTheme[]) {
    test(`${theme}: returns 4 checks with expected = computeCheck`, () => {
      const ds = generateSalesDataset(123, theme);
      const checks = buildSalesChecks(ds);

      assert.equal(checks.length, 4);

      const ids = checks.map((c) => c.check.id).sort();
      assert.deepEqual(ids, ["avg_units_first_product", "growth_pct", "top_product", "total_revenue"]);

      for (const { check, expected } of checks) {
        const computed = computeCheck(ds.rows, check.spec);
        assert.deepEqual(expected, computed);
      }
    });

    test(`${theme}: expected top_product equals independently computed top product`, () => {
      const ds = generateSalesDataset(456, theme);
      const checks = buildSalesChecks(ds);
      const topCheck = checks.find((c) => c.check.id === "top_product")!;

      // Independently compute top product by summing revenue per product
      const sums = new Map<string, number>();
      for (const row of ds.rows) {
        const product = row.product as string;
        const revenue = Number(row.revenue);
        sums.set(product, (sums.get(product) || 0) + revenue);
      }
      let bestProduct = "";
      let bestRevenue = -1;
      for (const [product, revenue] of sums) {
        if (revenue > bestRevenue || (revenue === bestRevenue && product < bestProduct)) {
          bestRevenue = revenue;
          bestProduct = product;
        }
      }

      assert.equal(topCheck.expected, bestProduct);
    });
  }
});

describe("describeTrends", () => {
  for (const theme of ["retail", "building-materials"] as DatasetTheme[]) {
    test(`${theme}: seeds 1-20, decliningProduct has first-half units > second-half units`, () => {
      for (let seed = 1; seed <= 20; seed++) {
        const ds = generateSalesDataset(seed, theme);
        const { decliningProduct } = describeTrends(ds);

        // Verify decliningProduct actually has first-half > second-half
        const productRows = ds.rows.filter((r) => r.product === decliningProduct);
        const firstHalf = productRows.filter((r) => {
          const m = r.month as string;
          return m >= "2026-01" && m <= "2026-03";
        });
        const secondHalf = productRows.filter((r) => {
          const m = r.month as string;
          return m >= "2026-04" && m <= "2026-06";
        });

        const firstSum = firstHalf.reduce((acc, r) => acc + Number(r.units), 0);
        const secondSum = secondHalf.reduce((acc, r) => acc + Number(r.units), 0);

        // If this fails, we should reduce noise term to 0.97 + 0.06 * rand() in generator
        assert.ok(
          firstSum > secondSum,
          `Seed ${seed} theme ${theme}: decliningProduct "${decliningProduct}" has firstHalf=${firstSum}, secondHalf=${secondSum}`
        );
      }
    });
  }
});

describe("generateFootingsDataset", () => {
  test("deterministic per seed", () => {
    const d1 = generateFootingsDataset(42);
    const d2 = generateFootingsDataset(42);
    assert.deepEqual(d1, d2);
  });

  test("different seeds give different datasets", () => {
    const d1 = generateFootingsDataset(1);
    const d2 = generateFootingsDataset(2);
    assert.notDeepEqual(d1, d2);
  });

  test("has 5 rows F1..F5 with correct columns", () => {
    const ds = generateFootingsDataset(999);
    assert.equal(ds.rows.length, 5);
    assert.deepEqual(ds.columns, ["footing", "length_m", "width_m", "depth_m", "count"]);
    for (let i = 0; i < 5; i++) {
      assert.equal(ds.rows[i].footing, `F${i + 1}`);
    }
  });
});

describe("buildFootingChecks", () => {
  test("fixed data expected values are [14.76, 17, 5.76]", () => {
    const fixedData: TableData = {
      columns: ["footing", "length_m", "width_m", "depth_m", "count"],
      rows: [
        { footing: "F1", length_m: 2, width_m: 1.5, depth_m: 0.5, count: 4 },
        { footing: "F2", length_m: 1.2, width_m: 1.2, depth_m: 0.4, count: 10 },
        { footing: "F3", length_m: 1, width_m: 1, depth_m: 1, count: 1 },
        { footing: "F4", length_m: 1, width_m: 1, depth_m: 1, count: 1 },
        { footing: "F5", length_m: 1, width_m: 1, depth_m: 1, count: 1 },
      ],
    };
    const checks = buildFootingChecks(fixedData);
    assert.equal(checks.length, 3);
    // total_concrete_volume: 2*1.5*0.5*4 + 1.2*1.2*0.4*10 + 1*1*1*1 + 1*1*1*1 + 1*1*1*1 = 6 + 5.76 + 1 + 1 + 1 = 14.76
    // total_footings: 4 + 10 + 1 + 1 + 1 = 17
    // volume_f2: 1.2*1.2*0.4*10 = 5.76
    assert.deepEqual(checks.map((c) => c.expected), [14.76, 17, 5.76]);
  });
});