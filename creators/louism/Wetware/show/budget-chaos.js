const ITEMS = [
  "BELANJAAN ASTRO",
  "SEWA PROYEKTOR",
  "BENSIN PERTAMIX",
  "KIRIM DUIT KE IBU",
  "BAJU SKENA",
  "QUOTA INTERNET",
  "SUBSCRIBE CHATGPT",
  "TOKEN LISTRIK",
  "KOPI STARBUCKS",
  "PIJET REFLEKSI",
  "SEBOTOL VODKA",
  "IPHONE 17 PRO MAX"
];

const COST_RANGES = [
  [20,300],
  [300,5_000],
  [20,150],
  [100,3_000],
  [50,1_000],
  [10,200],
  [20,240],
  [20,500],
  [5,100],
  [10,200],
  [20,400],
  [1_200,3_000]
];

const STATUS = ["PAID", "PENDING", "OVER", "WHY?", "AUTOPAY", "DECLINED", "#VALUE!"];

function seededRandom(seed) {
  let value = (Number(seed) || 0) >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function formatBudgetUsd(value) {
  const amount=Math.abs(Number(value) || 0);
  const prefix=Number(value)<0?"-$":"$";
  if(amount>=1_000_000_000) return `${prefix}${(amount/1_000_000_000).toFixed(1)}B`;
  if(amount>=1_000_000) return `${prefix}${(amount/1_000_000).toFixed(1)}M`;
  if(amount>=1_000) return `${prefix}${(amount/1_000).toFixed(0)}K`;
  return `${prefix}${Math.round(amount)}`;
}

export function budgetChaosSnapshot(second) {
  const tick = Math.max(0, Math.trunc(Number(second) || 0));
  const random = seededRandom(tick + 0x574554);
  const income = 800 + Math.round(random() * 9_200);
  const itemIndexes=ITEMS.map((_,index)=>index);
  for(let index=itemIndexes.length-1;index>0;index-=1) {
    const swapIndex=Math.floor(random()*(index+1));
    [itemIndexes[index],itemIndexes[swapIndex]]=[itemIndexes[swapIndex],itemIndexes[index]];
  }
  const rows = itemIndexes.slice(0,6).map((itemIndex, index) => {
    const item=ITEMS[itemIndex];
    const [minimum,maximum] = COST_RANGES[itemIndex];
    const planned = Math.round(minimum + random() * (maximum - minimum));
    const surge = random() < .34 ? 1.5 + random() * 4.5 : .45 + random() * 1.4;
    const actual = Math.round(planned * surge);
    const delta = planned - actual;
    const status = random() < .14 ? "#VALUE!" : STATUS[Math.floor(random() * STATUS.length)];
    return { item, planned, actual, delta, percent:actual / income, status, index };
  });
  const total = rows.reduce((sum, row) => sum + row.actual, 0);
  const selectedRow = Math.floor(random() * rows.length);
  const selectedColumn = 1 + Math.floor(random() * 5);
  const warnings = [
    `CASHFLOW ANOMALY ×${1 + Math.floor(random() * 99)}`,
    `RECALCULATING LIFE PLAN… ${Math.floor(random() * 100)}%`,
    `AUTOPAY CASCADE DETECTED`,
    `BUDGET CONFIDENCE: ${Math.floor(random() * 18)}%`,
    `NEW EXPENSE SPAWNED`
  ];
  return {
    tick,
    income,
    rows,
    total,
    balance:income - total,
    selectedRow,
    selectedColumn,
    warning:warnings[tick % warnings.length],
    revision:1000 + tick
  };
}

export function budgetChaosTransition(elapsedSeconds) {
  const elapsed = Math.max(0,Number(elapsedSeconds) || 0);
  const tick = Math.floor(elapsed / 2);
  const linearPhase = elapsed / 2 - tick;
  const phase = linearPhase * linearPhase * (3 - 2 * linearPhase);
  return {
    from:budgetChaosSnapshot(tick),
    to:budgetChaosSnapshot(tick+1),
    phase
  };
}
