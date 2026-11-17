/**
 * Data-task engine: generates deterministic datasets from a seed and computes answer keys.
 * Pure TypeScript — no database, no routes, no new dependencies.
 * No Math.random, Date, or file/network access.
 */

export type DataRow = Record<string, string | number>;
export type Dataset = { columns: string[]; rows: DataRow[]; currency: "INR" };
export type DatasetTheme = "retail" | "building-materials";

export type Where = { column: string; equals: string | number }[];

export type CheckSpec =
  | { op: "sum"; column: string; where?: Where }
  | { op: "mean"; column: string; where?: Where }
  | { op: "count"; where?: Where }
  | { op: "sum_product"; columns: string[]; where?: Where }
  | { op: "top_group"; groupBy: string; column: string }
  | { op: "pct_change"; column: string; groupBy: string; from: string; to: string };

export type DataCheck = {
  id: string;
  label: string;
  question: string;
  spec: CheckSpec;
  answerType: "NUMBER" | "CATEGORY";
  tolerance: number;
  marks: number;
};

export type TableData = { columns: string[]; rows: DataRow[] }; // Dataset must stay assignable to it

/**
 * Standard mulberry32 PRNG returning floats in [0, 1).
 * Same seed always produces the same sequence.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate a sales dataset from a seed and theme.
 * Deterministic: same seed + theme always gives identical dataset.
 */
export function generateSalesDataset(seed: number, theme: DatasetTheme): Dataset {
  const rand = mulberry32(seed);

  const months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];

  // Product definitions per theme
  const retailProducts = [
    { name: "Notebooks", unitPrice: 60 },
    { name: "Backpacks", unitPrice: 650 },
    { name: "Water Bottles", unitPrice: 220 },
    { name: "Desk Lamps", unitPrice: 480 },
  ];

  const buildingMaterialsProducts = [
    { name: "Cement (50kg bag)", unitPrice: 380 },
    { name: "TMT Steel (kg)", unitPrice: 68 },
    { name: "River Sand (tonne)", unitPrice: 1400 },
    { name: "Bricks (1000)", unitPrice: 7200 },
  ];

  const products = theme === "retail" ? retailProducts : buildingMaterialsProducts;

  // Determine which product declines (chosen by seed)
  const decliningIndex = Math.floor(rand() * products.length);

  // Base units per product: integer 40-120
  const baseUnits = products.map(() => Math.floor(40 + rand() * 81));

  const rows: DataRow[] = [];

  for (const month of months) {
    const monthIndex = months.indexOf(month);
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const isDeclining = i === decliningIndex;

      // trendFactor: ~4% growth per month, or ~6% decline for the declining product
      const trendFactor = isDeclining
        ? Math.pow(0.94, monthIndex) // ~6% decline per month
        : Math.pow(1.04, monthIndex); // ~4% growth per month

      // units = round(base * trendFactor * (0.95 + 0.1 * rand())), minimum 1
      const noise = 0.95 + 0.1 * rand();
      const units = Math.max(1, Math.round(baseUnits[i] * trendFactor * noise));

      const revenue = units * product.unitPrice;

      rows.push({
        month,
        product: product.name,
        units,
        revenue,
      });
    }
  }

  return {
    columns: ["month", "product", "units", "revenue"],
    rows,
    currency: "INR",
  };
}

/**
 * Filter rows by where conditions.
 */
function filterRows(rows: DataRow[], where?: Where): DataRow[] {
  if (!where || where.length === 0) return rows;
  return rows.filter((row) =>
    where.every((cond) => row[cond.column] === cond.equals)
  );
}

/**
 * Ensure a column exists in the dataset (throws if not).
 */
function ensureColumn(rows: DataRow[], column: string): void {
  if (rows.length > 0 && !(column in rows[0])) {
    throw new Error(`Column "${column}" does not exist`);
  }
}

/**
 * Compute the answer for a check specification against a dataset.
 */
export function computeCheck(rows: DataRow[], spec: CheckSpec): number | string {
  // Extract where clause if present (not all CheckSpec variants have it)
  const where = "where" in spec ? spec.where : undefined;
  const filtered = filterRows(rows, where);

  switch (spec.op) {
    case "sum": {
      ensureColumn(filtered, spec.column);
      return filtered.reduce((acc, row) => acc + (Number(row[spec.column]) || 0), 0);
    }
    case "mean": {
      ensureColumn(filtered, spec.column);
      if (filtered.length === 0) {
        throw new Error("Cannot compute mean over zero matching rows");
      }
      const sum = filtered.reduce((acc, row) => acc + (Number(row[spec.column]) || 0), 0);
      return sum / filtered.length;
    }
    case "count": {
      return filtered.length;
    }
    case "sum_product": {
      for (const col of spec.columns) {
        ensureColumn(filtered, col);
      }
      return filtered.reduce((acc, row) => {
        let product = 1;
        for (const col of spec.columns) {
          product *= Number(row[col]) || 0;
        }
        return acc + product;
      }, 0);
    }
    case "top_group": {
      ensureColumn(filtered, spec.groupBy);
      ensureColumn(filtered, spec.column);

      const sums = new Map<string, number>();
      for (const row of filtered) {
        const group = String(row[spec.groupBy]);
        const value = Number(row[spec.column]) || 0;
        sums.set(group, (sums.get(group) || 0) + value);
      }

      let bestGroup = "";
      let bestValue = -Infinity;
      for (const [group, value] of sums) {
        if (value > bestValue || (value === bestValue && group < bestGroup)) {
          bestValue = value;
          bestGroup = group;
        }
      }
      return bestGroup;
    }
    case "pct_change": {
      ensureColumn(filtered, spec.groupBy);
      ensureColumn(filtered, spec.column);

      const fromRows = filtered.filter((row) => row[spec.groupBy] === spec.from);
      const toRows = filtered.filter((row) => row[spec.groupBy] === spec.to);

      const fromTotal = fromRows.reduce((acc, row) => acc + (Number(row[spec.column]) || 0), 0);
      const toTotal = toRows.reduce((acc, row) => acc + (Number(row[spec.column]) || 0), 0);

      if (fromTotal === 0) {
        throw new Error("Cannot compute pct_change: 'from' total is zero");
      }

      const pct = ((toTotal - fromTotal) / fromTotal) * 100;
      return Math.round(pct * 10) / 10; // round to 1 decimal place
    }
  }
}

/**
 * Build the 4 standard sales checks for a dataset.
 * Expected values are computed from the data (not hardcoded).
 */
export function buildSalesChecks(dataset: Dataset): { check: DataCheck; expected: number | string }[] {
  const { rows } = dataset;

  // Get the first product name from the dataset
  const firstProduct = rows[0]?.product as string;

  const checks: { check: DataCheck; expected: number | string }[] = [];

  // 1. total_revenue
  const totalRevenueSpec: CheckSpec = { op: "sum", column: "revenue" };
  const totalRevenueExpected = computeCheck(rows, totalRevenueSpec);
  checks.push({
    check: {
      id: "total_revenue",
      label: "Total Revenue",
      question: "What is the total revenue across all six months?",
      spec: totalRevenueSpec,
      answerType: "NUMBER",
      tolerance: 0,
      marks: 10,
    },
    expected: totalRevenueExpected,
  });

  // 2. top_product
  const topProductSpec: CheckSpec = { op: "top_group", groupBy: "product", column: "revenue" };
  const topProductExpected = computeCheck(rows, topProductSpec);
  checks.push({
    check: {
      id: "top_product",
      label: "Top Product",
      question: "Which product earned the most total revenue?",
      spec: topProductSpec,
      answerType: "CATEGORY",
      tolerance: 0,
      marks: 10,
    },
    expected: topProductExpected,
  });

  // 3. growth_pct
  const growthPctSpec: CheckSpec = {
    op: "pct_change",
    column: "revenue",
    groupBy: "month",
    from: "2026-01",
    to: "2026-06",
  };
  const growthPctExpected = computeCheck(rows, growthPctSpec);
  checks.push({
    check: {
      id: "growth_pct",
      label: "Revenue Growth",
      question:
        "By what percentage did total monthly revenue change from January to June 2026? Give one decimal place.",
      spec: growthPctSpec,
      answerType: "NUMBER",
      tolerance: 0.1,
      marks: 10,
    },
    expected: growthPctExpected,
  });

  // 4. avg_units_first_product
  const avgUnitsSpec: CheckSpec = {
    op: "mean",
    column: "units",
    where: [{ column: "product", equals: firstProduct }],
  };
  const avgUnitsExpected = computeCheck(rows, avgUnitsSpec);
  checks.push({
    check: {
      id: "avg_units_first_product",
      label: "Avg Units (First Product)",
      question: `What is the average monthly units sold for ${firstProduct}?`,
      spec: avgUnitsSpec,
      answerType: "NUMBER",
      tolerance: 0.1,
      marks: 10,
    },
    expected: avgUnitsExpected,
  });

  return checks;
}

/**
 * Private rubric information: identifies the declining product.
 * Computed from the data only. Must not be stored on Dataset.
 */
export function describeTrends(dataset: Dataset): { decliningProduct: string } {
  const { rows } = dataset;

  // Get unique products
  const products = [...new Set(rows.map((r) => r.product as string))];

  let decliningProduct = "";
  let lowestRatio = Infinity;

  for (const product of products) {
    const productRows = rows.filter((r) => r.product === product);

    const firstHalf = productRows.filter((r) => {
      const month = r.month as string;
      return month >= "2026-01" && month <= "2026-03";
    });
    const secondHalf = productRows.filter((r) => {
      const month = r.month as string;
      return month >= "2026-04" && month <= "2026-06";
    });

    const firstSum = firstHalf.reduce((acc, r) => acc + (Number(r.units) || 0), 0);
    const secondSum = secondHalf.reduce((acc, r) => acc + (Number(r.units) || 0), 0);

    if (firstSum > 0) {
      const ratio = secondSum / firstSum;
      if (ratio < lowestRatio) {
        lowestRatio = ratio;
        decliningProduct = product;
      }
    }
  }

  return { decliningProduct };
}

/**
 * Check if a candidate's answer is correct.
 */
export function isAnswerCorrect(
  check: DataCheck,
  expected: number | string,
  answer: string
): boolean {
  const trimmed = answer.trim();

  if (check.answerType === "CATEGORY") {
    return trimmed.toLowerCase() === String(expected).toLowerCase();
  }

  // NUMBER type
  // Remove currency markers, commas (western and Indian grouping), spaces, and % sign
  const cleaned = trimmed
    .replace(/[₹]/g, "") // rupee sign
    .replace(/Rs\.?/gi, "") // Rs, Rs.
    .replace(/INR/gi, "") // INR
    .replace(/,/g, "") // commas
    .replace(/\s+/g, "") // spaces
    .replace(/%/g, ""); // percent sign

  const parsed = parseFloat(cleaned);
  if (isNaN(parsed)) {
    return false;
  }

  const expectedNum = Number(expected);
  return Math.abs(parsed - expectedNum) <= check.tolerance + 1e-9;
}

/**
 * Generate a civil footings dataset from a seed.
 * Deterministic: same seed always gives identical dataset.
 */
export function generateFootingsDataset(seed: number): TableData {
  const rand = mulberry32(seed);

  const lengths = [1.2, 1.5, 1.8, 2.0, 2.4, 2.7];
  const depths = [0.4, 0.45, 0.5, 0.6];

  const rows: DataRow[] = [];

  for (let i = 0; i < 5; i++) {
    const footing = `F${i + 1}`;
    const lengthIdx = Math.floor(rand() * lengths.length);
    const length_m = lengths[lengthIdx];

    // width_m = length_m, or length_m - 0.3 (random choice)
    const width_m = rand() < 0.5 ? length_m : Math.round((length_m - 0.3) * 100) / 100;

    const depthIdx = Math.floor(rand() * depths.length);
    const depth_m = depths[depthIdx];

    // count = integer 2..12
    const count = Math.floor(2 + rand() * 11);

    rows.push({
      footing,
      length_m: Math.round(length_m * 100) / 100,
      width_m: Math.round(width_m * 100) / 100,
      depth_m: Math.round(depth_m * 100) / 100,
      count,
    });
  }

  return {
    columns: ["footing", "length_m", "width_m", "depth_m", "count"],
    rows,
  };
}

/**
 * Build the 3 footing checks for a dataset.
 * Expected values are computed from the data (not hardcoded), rounded to 3 decimals.
 */
export function buildFootingChecks(data: TableData): { check: DataCheck; expected: number | string }[] {
  const { rows } = data;

  const checks: { check: DataCheck; expected: number | string }[] = [];

  // 1. total_concrete_volume: sum_product of [length_m, width_m, depth_m, count]
  const totalVolumeSpec: CheckSpec = {
    op: "sum_product",
    columns: ["length_m", "width_m", "depth_m", "count"],
  };
  const totalVolumeExpected = Math.round((computeCheck(rows, totalVolumeSpec) as number) * 1000) / 1000;
  checks.push({
    check: {
      id: "total_concrete_volume",
      label: "Total Concrete Volume",
      question:
        "What is the total volume of concrete, in cubic metres, needed for all the footings? Give two decimal places.",
      spec: totalVolumeSpec,
      answerType: "NUMBER",
      tolerance: 0.05,
      marks: 10,
    },
    expected: totalVolumeExpected,
  });

  // 2. total_footings: sum of count
  const totalFootingsSpec: CheckSpec = { op: "sum", column: "count" };
  const totalFootingsExpected = computeCheck(rows, totalFootingsSpec);
  checks.push({
    check: {
      id: "total_footings",
      label: "Total Footings",
      question: "How many footings are there in total?",
      spec: totalFootingsSpec,
      answerType: "NUMBER",
      tolerance: 0,
      marks: 10,
    },
    expected: totalFootingsExpected,
  });

  // 3. volume_f2: sum_product of same columns where footing equals "F2"
  const volumeF2Spec: CheckSpec = {
    op: "sum_product",
    columns: ["length_m", "width_m", "depth_m", "count"],
    where: [{ column: "footing", equals: "F2" }],
  };
  const volumeF2Expected = Math.round((computeCheck(rows, volumeF2Spec) as number) * 1000) / 1000;
  checks.push({
    check: {
      id: "volume_f2",
      label: "Volume F2",
      question:
        "What is the total concrete volume, in cubic metres, for footing type F2 only (all F2 footings together)?",
      spec: volumeF2Spec,
      answerType: "NUMBER",
      tolerance: 0.05,
      marks: 10,
    },
    expected: volumeF2Expected,
  });

  return checks;
}