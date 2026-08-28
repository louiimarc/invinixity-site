import test from "node:test";
import assert from "node:assert/strict";
import { budgetChaosSnapshot, budgetChaosTransition, formatBudgetUsd } from "../show/budget-chaos.js";

test("budget chaos snapshots are deterministic and mutate on the next tick", () => {
  assert.deepEqual(budgetChaosSnapshot(42),budgetChaosSnapshot(42));
  assert.notDeepEqual(budgetChaosSnapshot(42),budgetChaosSnapshot(43));
});

test("budget chaos eases continuously across each two-second transition", () => {
  assert.equal(budgetChaosTransition(0).phase,0);
  assert.equal(budgetChaosTransition(1).phase,.5);
  assert.ok(budgetChaosTransition(1.99).phase>.99);
  assert.equal(budgetChaosTransition(2).from.tick,1);
});

test("budget chaos supplies a complete overspending spreadsheet", () => {
  const snapshot=budgetChaosSnapshot(12);
  assert.equal(snapshot.rows.length,6);
  assert.equal(new Set(snapshot.rows.map((row)=>row.item)).size,6);
  assert.ok(snapshot.rows.every((row)=>Number.isFinite(row.actual)));
  assert.ok(snapshot.rows.every((row)=>row.item===row.item.toUpperCase()));
  assert.match(formatBudgetUsd(snapshot.balance),/^-?\$/);
});

test("budget items reshuffle from the approved twelve-option pool", () => {
  const approved=new Set(["BELANJAAN ASTRO","SEWA PROYEKTOR","BENSIN PERTAMIX","KIRIM DUIT KE IBU","BAJU SKENA","QUOTA INTERNET","SUBSCRIBE CHATGPT","TOKEN LISTRIK","KOPI STARBUCKS","PIJET REFLEKSI","SEBOTOL VODKA","IPHONE 17 PRO MAX"]);
  const first=budgetChaosSnapshot(20).rows.map((row)=>row.item);
  const next=budgetChaosSnapshot(21).rows.map((row)=>row.item);
  assert.ok(first.every((item)=>approved.has(item)));
  assert.notDeepEqual(first,next);
});

test("budget USD labels remain compact at theatrical scales", () => {
  assert.equal(formatBudgetUsd(18_420_000),"$18.4M");
  assert.equal(formatBudgetUsd(-2_100_000_000),"-$2.1B");
});
