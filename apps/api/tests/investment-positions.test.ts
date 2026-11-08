import assert from "node:assert/strict";
import { once } from "node:events";
import { test, mock } from "node:test";
import { calculateInvestmentPositions, type PositionPartner, type PositionTransfer, type PositionCommitment } from "../src/lib/investment-positions.js";
import { prisma } from "../src/lib/prisma.js";

const date = (day: number) => new Date(Date.UTC(2026, 5, day, 7));
function commitment(id: string, amount = 300, paid = 240, day = 1): PositionCommitment {
  return { id, amount, commitmentDate: date(day), createdAt: date(day), payments: paid ? [{ id: `pay-${id}`, amount: paid, paymentDate: date(day), createdAt: new Date(date(day).getTime() + 1) }] : [] };
}
const base = (): PositionPartner[] => [{ id: "a", commitments: [commitment("ca")] }, { id: "b", commitments: [commitment("cb")] }, { id: "c", commitments: [] }];
function transfer(id = "t1", from = "a", to = "b", percentage = 50, reference = 300, day = 3): PositionTransfer {
  return { id, fromPartnerId: from, toPartnerId: to, percentage, referenceAmount: reference, transferDate: date(day), createdAt: date(day) };
}
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test("full exit moves committed, paid and unpaid holdings while original histories remain intact", () => {
  const partners = base(), transfers = [transfer()];
  const original = JSON.stringify({ partners, transfers });
  const result = calculateInvestmentPositions(partners, transfers);
  assert.deepEqual(result.positions.get("a"), { committedCents: 0, paidCents: 0, unpaidCents: 0, pendingCents: 0, equityPercent: 0, isActive: false });
  assert.deepEqual(result.positions.get("b"), { committedCents: 60000, paidCents: 48000, unpaidCents: 12000, pendingCents: 0, equityPercent: 100, isActive: true });
  assert.deepEqual(result.holdersByCommitment.get("ca"), [{ partnerId: "b", amount: 300, paidAmount: 240, unpaidAmount: 60 }]);
  assert.ok(result.transferredCommitmentIds.has("ca"));
  assert.equal(JSON.stringify({ partners, transfers }), original);
});

test("other partners' new commitments, changed amounts and payments cannot revive an exited partner", () => {
  const partners = base();
  partners[2]!.commitments.push(commitment("cc", 600, 400, 5));
  const result = calculateInvestmentPositions(partners, [transfer()]);
  assert.equal(result.positions.get("a")!.equityPercent, 0);
  near(result.positions.get("b")!.equityPercent, 50);
  partners[1]!.commitments[0]!.amount = 900;
  partners[1]!.commitments[0]!.payments[0]!.amount = 800;
  const changed = calculateInvestmentPositions(partners, [transfer()]);
  assert.equal(changed.positions.get("a")!.equityPercent, 0);
  assert.equal(changed.positions.get("a")!.paidCents, 0);
  near(changed.positions.get("b")!.equityPercent, 1200 / 1800 * 100);
});

test("partial transfers move the same fraction of committed, paid and unpaid balances", () => {
  const result = calculateInvestmentPositions(base(), [transfer("partial", "a", "b", 25, 150)]);
  assert.equal(result.positions.get("a")!.committedCents, 15000);
  assert.equal(result.positions.get("a")!.paidCents, 12000);
  assert.equal(result.positions.get("a")!.unpaidCents, 3000);
  assert.equal(result.positions.get("b")!.committedCents, 45000);
  near(result.positions.get("b")!.equityPercent, 75);
});

test("incoming transfers reactivate a zero-equity partner without restoring sold commitments", () => {
  const result = calculateInvestmentPositions(base(), [transfer(), transfer("return", "b", "a", 10, 60, 5)]);
  near(result.positions.get("a")!.equityPercent, 10);
  assert.equal(result.positions.get("a")!.committedCents, 6000);
  assert.equal(result.positions.get("a")!.paidCents, 4800);
  assert.equal(result.positions.get("b")!.committedCents, 54000);
});

test("unfunded re-entry remains at zero; payment on a fresh commitment activates that new capital only", () => {
  const partners = base();
  partners[0]!.commitments.push(commitment("reentry", 150, 0, 5));
  let result = calculateInvestmentPositions(partners, [transfer()]);
  assert.equal(result.positions.get("a")!.equityPercent, 0);
  assert.equal(result.positions.get("a")!.pendingCents, 15000);
  assert.equal(result.equityBasis, 600);
  partners[0]!.commitments[1]!.payments.push({ id: "new-payment", amount: 10, paymentDate: date(6), createdAt: date(6) });
  result = calculateInvestmentPositions(partners, [transfer()]);
  near(result.positions.get("a")!.equityPercent, 20);
  assert.equal(result.positions.get("a")!.paidCents, 1000);
  assert.equal(result.positions.get("a")!.pendingCents, 0);
  assert.equal(result.positions.get("b")!.paidCents, 48000);
});

test("later payments on sold original commitments follow the current holders rather than reviving the originator", () => {
  const partners = base();
  partners[0]!.commitments[0]!.payments.push({ id: "late", amount: 60, paymentDate: date(8), createdAt: date(8) });
  const result = calculateInvestmentPositions(partners, [transfer()]);
  assert.equal(result.positions.get("a")!.equityPercent, 0);
  assert.equal(result.positions.get("a")!.paidCents, 0);
  assert.equal(result.positions.get("b")!.paidCents, 54000);
});

test("backdating a fresh commitment cannot undo a recorded full exit or restore old paid balances", () => {
  const partners = base();
  const fresh = commitment("backdated", 150, 0, 1);
  fresh.createdAt = date(7);
  partners[0]!.commitments.push(fresh);
  let result = calculateInvestmentPositions(partners, [transfer()], { strict: true });
  assert.equal(result.positions.get("a")!.equityPercent, 0);
  assert.equal(result.positions.get("a")!.pendingCents, 15000);
  assert.equal(result.positions.get("b")!.paidCents, 48000);
  fresh.payments.push({ id: "backdated-payment", amount: 10, paymentDate: date(1), createdAt: date(8) });
  result = calculateInvestmentPositions(partners, [transfer()], { strict: true });
  assert.equal(result.positions.get("a")!.equityPercent, 20);
  assert.equal(result.positions.get("a")!.paidCents, 1000);
  assert.equal(result.positions.get("b")!.paidCents, 48000);
  assert.equal(fresh.commitmentDate.toISOString(), date(1).toISOString());
});

test("chained resales preserve totals and keep both former holders at zero after later funding", () => {
  const partners = base();
  const transfers = [transfer(), transfer("resale", "b", "c", 100, 600, 5)];
  partners.push({ id: "d", commitments: [commitment("cd", 600, 600, 7)] });
  const result = calculateInvestmentPositions(partners, transfers);
  assert.equal(result.positions.get("a")!.equityPercent, 0);
  assert.equal(result.positions.get("b")!.equityPercent, 0);
  near(result.positions.get("c")!.equityPercent, 50);
  assert.equal(result.positions.get("c")!.paidCents, 48000);
  assert.equal(result.holdersByCommitment.get("ca")![0]!.partnerId, "c");
});

test("quoting at a transfer date excludes later capital and validates dependent transfers", () => {
  const partners = base();
  partners[2]!.commitments.push(commitment("later", 600, 600, 9));
  const quote = calculateInvestmentPositions(partners, [], { before: { date: date(3), createdAt: date(3) }, strict: true });
  assert.equal(quote.equityBasis, 600);
  assert.equal(quote.positions.get("a")!.equityPercent, 50);
  assert.throws(() => calculateInvestmentPositions(base(), [transfer("bad", "b", "c", 100, 600, 2)], { strict: true }), /exceeds/);
  const inconsistent = calculateInvestmentPositions(base(), [transfer("bad", "a", "b", 100, 900)]);
  assert.equal(inconsistent.issues.length, 1);
  assert.equal(inconsistent.positions.get("a")!.equityPercent, 0);
  assert.equal(inconsistent.positions.get("b")!.equityPercent, 100);
});

test("fractional allocations reconcile to the paisa over many partial and full sales", () => {
  const partners = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, commitments: [commitment(`c${i}`, 100.01, 50.01)] }));
  const transfers: PositionTransfer[] = [];
  let seed = 17;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 80; i++) {
    const current = calculateInvestmentPositions(partners, transfers, { strict: true });
    const sellers = [...current.positions].filter(([, p]) => p.isActive && p.committedCents >= 5);
    const [seller, holding] = sellers[Math.floor(random() * sellers.length)]!;
    const buyers = partners.filter((partner) => partner.id !== seller);
    const buyer = buyers[Math.floor(random() * buyers.length)]!.id;
    const reference = (i % 9 === 0 ? holding.committedCents : Math.max(1, Math.floor(holding.committedCents * random() * 0.5))) / 100;
    transfers.push(transfer(`t${i}`, seller, buyer, reference / current.equityBasis * 100, reference, 3 + i));
    const result = calculateInvestmentPositions(partners, transfers, { strict: true });
    const values = [...result.positions.values()];
    assert.equal(values.reduce((sum, row) => sum + row.committedCents, 0), 60006);
    assert.equal(values.reduce((sum, row) => sum + row.paidCents, 0), 30006);
    assert.equal(values.reduce((sum, row) => sum + row.unpaidCents, 0), 30000);
    assert.ok(values.every((row) => row.equityPercent >= 0 && row.paidCents <= row.committedCents));
    near(values.reduce((sum, row) => sum + row.equityPercent, 0), 100);
  }
});

test("API shows current amounts separately from original records and protects transferred commitments", async () => {
  process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/pocket_test";
  process.env.JWT_SECRET = "investment-positions-test-secret";
  const { createApp } = await import("../src/app.js");
  const { signToken } = await import("../src/lib/auth.js");
  const ids = ["c" + "a".repeat(24), "c" + "b".repeat(24), "c" + "c".repeat(24)];
  const branch = { id: "c" + "d".repeat(24), name: "Main", slug: "main", city: "Islamabad", addressLine1: "Test", phone: "", email: null, isActive: true, deliveryFee: 0 };
  const partners = ids.map((id, i) => ({
    id, name: `Partner ${i + 1}`, note: null, createdAt: date(1), createdBy: null,
    commitments: i < 2 ? [{ ...commitment(`c${i}`), partnerId: id, createdBy: null, note: null,
      payments: commitment(`c${i}`).payments.map((p) => ({ ...p, commitmentId: `c${i}`, branchId: branch.id, branch, receivedSource: "CASH", createdBy: null, note: null })) }] : []
  }));
  const transfers = [{ ...transfer("transfer", ids[0]!, ids[1]!), fromPartner: partners[0], toPartner: partners[1], createdBy: null, note: null }];
  const restore: Array<() => void> = [];
  function replace(target: object, key: string, fn: (...args: any[]) => any) {
    const t = target as Record<string, unknown>, previous = t[key]; t[key] = fn; restore.push(() => { t[key] = previous; });
  }
  replace(prisma.user, "findUnique", async () => ({ id: "test", role: { code: "SUPER_ADMIN" }, name: "Test", email: "test@example.test", username: "test", isActive: true }));
  replace(prisma.branch, "findMany", async () => [branch]);
  replace(prisma.investmentPartner, "findMany", async () => partners);
  replace(prisma.shareTransfer, "findMany", async () => transfers);
  replace(prisma.shareTransfer, "create", async ({ data }) => {
    const added = { ...data, id: "return-transfer", createdAt: date(5), fromPartner: partners.find((p) => p.id === data.fromPartnerId), toPartner: partners.find((p) => p.id === data.toPartnerId), createdBy: null };
    transfers.push(added);
    return added;
  });
  replace(prisma.shareTransfer, "count", async () => 1);
  replace(prisma.auditLog, "create", async () => ({}));
  replace(prisma.investmentCommitment, "findUnique", async ({ where }) => partners.flatMap((p) => p.commitments).find((c) => c.id === where.id) ?? null);
  const update = mock.fn(async () => ({}));
  replace(prisma.investmentCommitment, "update", update);
  const transaction = mock.method(prisma, "$transaction", async (callback: (tx: unknown) => unknown) => callback(prisma));
  const server = createApp().listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const token = signToken({ sub: "test", role: "SUPER_ADMIN", email: "test@example.test" });
  const headers = { Authorization: `Bearer ${token}`, Origin: "http://localhost:3000", "Content-Type": "application/json" };
  const url = `http://127.0.0.1:${address.port}/api/admin/investments`;
  try {
    const response = await fetch(url, { headers }); assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.summary.partnerCount, 1);
    assert.equal(data.summary.totalPartnerCount, 3);
    assert.equal(data.partners[0].committedAmount, 0);
    assert.equal(data.partners[0].isActive, false);
    assert.equal(data.partners[1].committedAmount, 600);
    assert.equal(data.partners[1].paidAmount, 480);
    assert.equal(data.partners[1].commitments.length, 1);
    assert.equal(data.partners[0].commitments[0].partnerId, ids[0]);
    assert.equal(data.partners[0].commitments[0].amount, 300);
    assert.equal(data.partners[0].commitments[0].payments[0].amount, 240);
    assert.equal(data.partners[0].commitments[0].currentHolders[0].partnerId, ids[1]);
    assert.equal(data.partners[0].commitments[0].ownershipLocked, true);
    const blocked = await fetch(`${url}/commitments/c0`, { method: "PATCH", headers, body: JSON.stringify({ amount: 500 }) });
    assert.equal(blocked.status, 400);
    assert.match((await blocked.json()).message, /transferred holdings/);
    assert.equal(update.mock.callCount(), 0);
    const deleted = await fetch(`${url}/commitments/c0`, { method: "DELETE", headers });
    assert.equal(deleted.status, 400);
    const removed = await fetch(`${url}/partners/${ids[0]}`, { method: "DELETE", headers });
    assert.equal(removed.status, 400);
    assert.match((await removed.json()).message, /inactive partner/);
    const oversell = await fetch(`${url}/transfers`, { method: "POST", headers, body: JSON.stringify({ fromPartnerId: ids[0], toPartnerId: ids[1], inputMode: "PERCENTAGE", value: 1, transferDate: date(7).toISOString() }) });
    assert.equal(oversell.status, 400);
    assert.match((await oversell.json()).message, /seller's equity/);
    const incoming = await fetch(`${url}/transfers`, { method: "POST", headers, body: JSON.stringify({ fromPartnerId: ids[1], toPartnerId: ids[0], inputMode: "PERCENTAGE", value: 10, transferDate: date(5).toISOString() }) });
    assert.equal(incoming.status, 201);
    assert.equal((await incoming.json()).transfer.referenceAmount, 60);
    const updated = await (await fetch(url, { headers })).json();
    assert.equal(updated.partners[0].equityPercent, 10);
    assert.equal(updated.partners[0].committedAmount, 60);
    assert.equal(updated.partners[0].paidAmount, 48);
    assert.equal(updated.partners[0].commitments[0].amount, 300);
    assert.equal(updated.partners[1].committedAmount, 540);
  } finally {
    server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve()));
    transaction.mock.restore(); restore.reverse().forEach((reset) => reset());
  }
});
