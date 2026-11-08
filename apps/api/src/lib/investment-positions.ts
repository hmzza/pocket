type Money = number | string | { toString(): string };
export type PositionPayment = { id: string; amount: Money; paymentDate: Date; createdAt: Date };
export type PositionCommitment = {
  id: string; amount: Money; commitmentDate: Date; createdAt: Date; payments: PositionPayment[];
};
export type PositionPartner = { id: string; commitments: PositionCommitment[] };
export type PositionTransfer = {
  id: string; fromPartnerId: string; toPartnerId: string; percentage: Money;
  referenceAmount: Money; transferDate: Date; createdAt: Date;
};
type Lot = { commitment: PositionCommitment; eligible: boolean; holders: Map<string, number> };
const moneyCents = (value: Money) => Math.round(Number(value.toString()) * 100);
const EPSILON = 1e-8;

function allocate(total: number, weights: Map<string, number>, limits?: Map<string, number>) {
  const sum = [...weights.values()].reduce((a, b) => a + b, 0);
  const rows = [...weights].map(([id, weight]) => {
    const exact = sum ? total * weight / sum : 0;
    return { id, amount: Math.min(Math.floor(exact), limits?.get(id) ?? total), remainder: exact - Math.floor(exact) };
  });
  let remaining = total - rows.reduce((value, row) => value + row.amount, 0);
  const ordered = rows.slice().sort((a, b) => b.remainder - a.remainder || a.id.localeCompare(b.id));
  while (remaining > 0) {
    let assigned = false;
    for (const row of ordered) {
      if (remaining && row.amount < (limits?.get(row.id) ?? total)) { row.amount++; remaining--; assigned = true; }
    }
    if (!assigned) break;
  }
  return new Map(rows.map((row) => [row.id, row.amount]));
}

/** Current economic ownership is a projection; original commitments/payments never move. */
export function calculateInvestmentPositions(partners: PositionPartner[], transfers: PositionTransfer[], options: {
  strict?: boolean; before?: { date: Date; createdAt: Date };
} = {}) {
  const lots = new Map<string, Lot>();
  const exited = new Set<string>();
  const issues: string[] = [];
  const transferredCommitmentIds = new Set<string>();
  const partnerIds = new Set(partners.map((partner) => partner.id));
  type Event = { date: number; createdAt: number; rank: number; id: string } & (
    { kind: "commitment"; partnerId: string; commitment: PositionCommitment } |
    { kind: "payment"; commitmentId: string } |
    { kind: "transfer"; transfer: PositionTransfer }
  );
  const events: Event[] = [];
  for (const partner of partners) for (const commitment of partner.commitments) {
    // A newly entered/backdated commitment must not retroactively undo a sale
    // already on the books. Recognition for ownership follows those known sales;
    // the source commitment/payment dates themselves are never changed.
    const ownershipDate = transfers.reduce((latest, transfer) => transfer.createdAt < commitment.createdAt
      ? Math.max(latest, transfer.transferDate.getTime()) : latest, commitment.commitmentDate.getTime());
    events.push({ kind: "commitment", partnerId: partner.id, commitment, date: ownershipDate, createdAt: commitment.createdAt.getTime(), rank: 0, id: commitment.id });
    for (const payment of commitment.payments) if (moneyCents(payment.amount) > 0) events.push({
      kind: "payment", commitmentId: commitment.id, date: Math.max(payment.paymentDate.getTime(), ownershipDate),
      createdAt: Math.max(payment.createdAt.getTime(), commitment.createdAt.getTime()), rank: 1, id: payment.id
    });
  }
  for (const transfer of transfers) events.push({ kind: "transfer", transfer, date: transfer.transferDate.getTime(), createdAt: transfer.createdAt.getTime(), rank: 2, id: transfer.id });
  events.sort((a, b) => a.date - b.date || a.createdAt - b.createdAt || a.rank - b.rank || a.id.localeCompare(b.id));
  function units(partnerId?: string) {
    let total = 0;
    for (const lot of lots.values()) if (lot.eligible) total += partnerId ? lot.holders.get(partnerId) ?? 0 : [...lot.holders.values()].reduce((a, b) => a + b, 0);
    return total;
  }
  function issue(message: string) {
    if (options.strict) throw Object.assign(new Error(message), { statusCode: 400 });
    issues.push(message);
  }
  for (const event of events) {
    if (options.before && (event.date > options.before.date.getTime() || (event.date === options.before.date.getTime() && event.createdAt > options.before.createdAt.getTime()))) continue;
    if (event.kind === "commitment") {
      // Preserve commitment-based initial/active equity. After a full exit,
      // only a fresh, funded commitment or incoming transfer can restore equity.
      lots.set(event.commitment.id, { commitment: event.commitment, eligible: !exited.has(event.partnerId) || units(event.partnerId) > EPSILON, holders: new Map([[event.partnerId, moneyCents(event.commitment.amount)]]) });
    } else if (event.kind === "payment") {
      const lot = lots.get(event.commitmentId);
      if (lot) lot.eligible = true;
    } else {
      const transfer = event.transfer;
      const available = units(transfer.fromPartnerId);
      if (!partnerIds.has(transfer.fromPartnerId) || !partnerIds.has(transfer.toPartnerId) || transfer.fromPartnerId === transfer.toPartnerId) {
        issue(`Share transfer ${transfer.id} has invalid partners.`); continue;
      }
      // referenceAmount fixes the contribution basis at the time of sale. Reusing
      // an old absolute percentage against today's larger denominator resurrects
      // exited partners and changes what the buyer actually acquired.
      const reference = moneyCents(transfer.referenceAmount);
      const requested = reference > 0 ? reference : Math.round(units() * Number(transfer.percentage.toString()) / 100);
      if (requested <= 0 || available <= EPSILON || requested > available) {
        issue(`Share transfer ${transfer.id} exceeds the seller's holding at its date. Review this transfer and earlier capital entries.`);
        if (available <= EPSILON || requested <= 0) continue;
      }
      const sellerLots = new Map([...lots].filter(([, lot]) => lot.eligible && lot.holders.has(transfer.fromPartnerId)).map(([id, lot]) => [id, lot.holders.get(transfer.fromPartnerId)!]));
      const movements = allocate(Math.min(requested, available), sellerLots, sellerLots);
      for (const lot of lots.values()) {
        if (!lot.eligible) continue;
        const held = lot.holders.get(transfer.fromPartnerId) ?? 0;
        if (!held) continue;
        const moved = movements.get(lot.commitment.id) ?? 0;
        if (!moved) continue;
        transferredCommitmentIds.add(lot.commitment.id);
        if (moved === held) lot.holders.delete(transfer.fromPartnerId);
        else lot.holders.set(transfer.fromPartnerId, held - moved);
        lot.holders.set(transfer.toPartnerId, (lot.holders.get(transfer.toPartnerId) ?? 0) + moved);
      }
      if (units(transfer.fromPartnerId) <= EPSILON) exited.add(transfer.fromPartnerId);
    }
  }
  const equityBasis = units();
  const positions = new Map(partners.map((partner) => [partner.id, {
    committedCents: 0, paidCents: 0, unpaidCents: 0, pendingCents: 0,
    equityPercent: equityBasis > 0 && units(partner.id) > EPSILON ? units(partner.id) / equityBasis * 100 : 0,
    isActive: units(partner.id) > EPSILON
  }]));
  const holdersByCommitment = new Map<string, Array<{ partnerId: string; amount: number; paidAmount: number; unpaidAmount: number }>>();
  for (const [id, lot] of lots) {
    const committed = new Map(lot.holders);
    const paidTotal = lot.commitment.payments.filter((payment) => !options.before || payment.paymentDate <= options.before.date).reduce((sum, payment) => sum + moneyCents(payment.amount), 0);
    const commitmentTotal = moneyCents(lot.commitment.amount);
    if (paidTotal > commitmentTotal) issue(`Payments exceed commitment ${id}. Review the original payment records.`);
    const paid = allocate(paidTotal, lot.holders, paidTotal <= commitmentTotal ? committed : undefined);
    const holders = [...committed].map(([partnerId, amount]) => {
      const paidAmount = paid.get(partnerId) ?? 0;
      const position = positions.get(partnerId)!;
      const unpaid = Math.max(0, amount - paidAmount);
      position.committedCents += amount; position.paidCents += paidAmount; position.unpaidCents += unpaid;
      if (!lot.eligible) position.pendingCents += amount;
      return { partnerId, amount: amount / 100, paidAmount: paidAmount / 100, unpaidAmount: unpaid / 100 };
    });
    holdersByCommitment.set(id, holders);
  }
  return { positions, holdersByCommitment, transferredCommitmentIds, equityBasis: equityBasis / 100, issues };
}
