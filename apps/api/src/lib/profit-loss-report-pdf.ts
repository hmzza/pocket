import PDFDocument from "pdfkit";
import { formatPakistanDate } from "./business-day.js";
import { rupees } from "./investor-report-data.js";
import type { ProfitLossReport } from "./profit-loss-report-data.js";

const NAVY = "#102A43", ORANGE = "#F36C21", MUTED = "#52677A", LIGHT = "#EFF3F6";
const amount = (value: number) => {
  const formatted = Math.abs(rupees(value)).toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return value < 0 ? `(${formatted})` : formatted;
};
const clean = (value: string) => value.replace(/[\u0000-\u001f]/g, " ").replace(/[\u2010-\u2015]/g, "-");
const serviceNames: Record<string, string> = { DELIVERY: "Direct delivery", TAKEAWAY: "Takeaway / pickup", DINE_IN: "Dine-in", INSHOP: "Inshop", FOODPANDA: "Foodpanda", GOLOOTLO: "Golootlo", NASCON: "Nascon stall" };
type Row = { cells: string[]; kind?: "section" | "total" | "result" };

export async function renderProfitLossReport(data: ProfitLossReport): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margins: { top: 40, bottom: 25, left: 42, right: 42 }, bufferPages: true,
    info: { Title: `Pocket | Profit & Loss | ${data.period.label}`, Author: "Pocket - The Shawarma Spot", Subject: "Monthly management P&L, recorded-cost basis", CreationDate: data.generatedAt } });
  const chunks: Buffer[] = [];
  const complete = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const left = 42, width = doc.page.width - 84, bottom = doc.page.height - 72;
  let y = 0, section = "Profit & Loss statement";
  const generated = formatPakistanDate(data.generatedAt, { dateStyle: "medium", timeStyle: "short" });
  function text(value: string, x: number, top: number, size = 9.5, bold = false, color = NAVY, options: PDFKit.Mixins.TextOptions = {}) {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).fillColor(color).text(clean(value), x, top, options);
  }
  function page(title: string, first = false) {
    if (!first) doc.addPage();
    section = title;
    doc.rect(0, 0, doc.page.width, 7).fill(ORANGE);
    text("POCKET", left, 29, 18, true);
    text("THE SHAWARMA SPOT", left + 91, 34, 7.5, true, MUTED);
    text("CONFIDENTIAL / MONTHLY MANAGEMENT REPORT", left, 61, 8, true, ORANGE);
    text(title, left, 84, 25, true, NAVY, { width });
    text(`${data.period.label} | All branches | Amounts in PKR`, left, doc.y + 9, 10, false, MUTED, { width });
    y = doc.y + 22;
  }
  function ensure(height: number) { if (y + height > bottom) page(section); }
  function paragraph(value: string, size = 9) {
    doc.font("Helvetica").fontSize(size);
    const height = doc.heightOfString(clean(value), { width, lineGap: 3 });
    ensure(height + 12);
    text(value, left, y, size, false, MUTED, { width, lineGap: 3 });
    y += height + 12;
  }
  function heading(value: string) { ensure(90); text(value, left, y, 12, true); y += 24; }
  function table(headers: string[], rows: Row[], fractions: number[]) {
    const widths = fractions.map((fraction) => fraction * width);
    function header() {
      ensure(64);
      doc.rect(left, y, width, 26).fill(NAVY);
      let x = left;
      headers.forEach((value, i) => { text(value, x + 8, y + 9, 8, true, "#FFFFFF", { width: widths[i]! - 16 }); x += widths[i]!; });
      y += 26;
    }
    header();
    rows.forEach((row, index) => {
      doc.font(row.kind ? "Helvetica-Bold" : "Helvetica").fontSize(9);
      const height = Math.max(27, ...row.cells.map((cell, i) => doc.heightOfString(clean(cell), { width: widths[i]! - 16 }) + 16));
      // Keep a category heading with at least one following detail row.
      if (y + height + (row.kind === "section" ? 48 : 0) > bottom) { page(section); header(); }
      const bg = row.kind === "result" ? NAVY : row.kind === "total" ? "#FFF1E5" : row.kind === "section" || index % 2 === 0 ? LIGHT : "#FFFFFF";
      doc.rect(left, y, width, height).fill(bg);
      let x = left;
      row.cells.forEach((cell, i) => {
        text(cell, x + 8, y + 8, 9, Boolean(row.kind), row.kind === "result" ? "#FFFFFF" : i === 0 ? NAVY : MUTED,
          { width: widths[i]! - 16, align: i === 1 ? "right" : "left" });
        x += widths[i]!;
      });
      y += height;
    });
    y += 17;
  }
  const share = (value: number) => data.revenue ? `${(value / data.revenue * 100).toFixed(1)}%` : "N/A";
  const s = data.sales;
  page("Profit & Loss statement", true);
  paragraph("Recorded-cost basis: stock purchases are expensed as recorded. Includes entered unpaid fixed bills. The result is provisional, before unrecorded inventory, depreciation and tax adjustments.");
  const statement: Row[] = [
    { kind: "section", cells: ["SALES AND INCOME", "", ""] },
    { cells: ["Gross item sales before discounts", amount(s.subtotal), share(s.subtotal)] },
    { cells: ["Less: order discounts", amount(-s.discounts), share(-s.discounts)] },
    { cells: ["Delivery charges billed", amount(s.delivery), share(s.delivery)] }
  ];
  if (data.reconciliationAdjustment) statement.push({ cells: ["Recorded order reconciliation adjustment", amount(data.reconciliationAdjustment), share(data.reconciliationAdjustment)] });
  statement.push(
    { kind: "total", cells: ["TOTAL REVENUE (excluding recorded sales tax)", amount(data.revenue), share(data.revenue)] },
    { kind: "section", cells: ["LESS: COSTS AND EXPENSES", "", ""] },
    { cells: ["Recorded stock purchases", amount(data.costs.stock), share(data.costs.stock)] },
    { cells: ["Other recorded expenses", amount(data.otherCosts), share(data.otherCosts)] },
    { cells: [`Foodpanda fees (${data.feeSource === "ledger" ? "recorded in expense ledger" : data.feeSource === "estimate" ? "estimated at 38%" : "no activity"})`, amount(data.marketplaceFee), share(data.marketplaceFee)] },
    { kind: "total", cells: ["TOTAL COSTS AND EXPENSES", amount(data.expenseTotal), share(data.expenseTotal)] },
    { kind: "result", cells: ["NET PROFIT / (LOSS) - RECORDED-COST ESTIMATE", amount(data.profit), share(data.profit)] }
  );
  table(["Details", "Amount (PKR)", "% of revenue"], statement, [0.61, 0.23, 0.16]);
  paragraph(`Recorded sales tax of ${amount(s.tax)} is excluded from income once. Discounts are already deducted. Gross billed order value is ${amount(s.total)} across ${s.orders.toLocaleString("en-PK")} qualifying orders. Figures use two decimal places; losses and deductions appear in parentheses.`);
  paragraph(data.feeSource === "ledger"
    ? `Foodpanda fees use ${data.costs.ledgerMarketplaceEntries} explicitly named expense entries, already included in ledger expenses. No extra 38% charge is added. Confirm these entries cover the whole month.`
    : data.feeSource === "estimate"
      ? `No explicitly named Foodpanda fee entries were found. A provisional 38% of qualified Foodpanda gross order value (${amount(s.foodpanda)}) is added separately; replace this estimate through correctly labelled ledger entries when actual fees are available.`
      : "No qualifying Foodpanda orders or explicitly named Foodpanda fee entries were found; no marketplace estimate is added.");
  paragraph(`Golootlo receivables - payouts not tracked: ${amount(s.golootloReceivables)} in this reporting period. These are recorded totals of paid Golootlo-payment orders, already included in sales above. Cash, Easypaisa and JazzCash payments remain in their own wallets. No Golootlo commission or settlement receipts are assumed.`);
  if (!s.orders && !data.costs.entries) paragraph("No qualifying sales or expense records were found for this month. Zero totals indicate the available records, not a verified statement that the business did not trade.");

  page("Expense detail");
  paragraph("Expenses are grouped by the application's categories and titles, with category totals and short narrations. Recorded purchases and fixed bills are counted once; unpaid fixed bills remain costs in this statement.");
  const details: Row[] = [];
  for (const category of data.categories) {
    details.push({ kind: "section", cells: [`${category.label} - total`, amount(category.amount), `${category.entries} ledger ${category.entries === 1 ? "entry" : "entries"}`] });
    for (const line of category.lines) details.push({ cells: [line.title, amount(line.amount),
      `${line.entries} ${line.entries === 1 ? "entry" : "entries"}${line.stock ? "; stock purchase" : ""}${line.unpaid ? `; unpaid fixed ${amount(line.unpaid)}` : ""}`] });
  }
  if (!details.length) details.push({ cells: ["No expense records for the month", amount(0), "No records found"] });
  details.push({ kind: "total", cells: ["TOTAL RECORDED EXPENSES", amount(data.costs.total), `${data.costs.entries} ledger entries`] });
  if (data.feeAdjustment) details.push({ cells: ["Estimated Foodpanda fees (additional)", amount(data.feeAdjustment), "38% assumption; no matching ledger fee entries"] });
  details.push({ kind: "result", cells: ["TOTAL COSTS IN THE P&L", amount(data.expenseTotal), "Reconciles to the statement"] });
  table(["Details", "Amount (PKR)", "Narration"], details, [0.47, 0.23, 0.3]);
  paragraph(`Entered unpaid fixed bills included above: ${amount(data.costs.unpaidFixed)}. Scheduled fixed expenses with no ledger occurrence are not invented or generated by downloading this report. Category labels are retained; purchases of assets or loan principal incorrectly entered as expenses may require reclassification.`);
  paragraph("Source: Pocket order, expense and branch records. Customer and contact details are omitted.", 8);

  page("Sales support and report basis");
  heading("Sales by channel");
  table(["Channel", "Net revenue (PKR)", "Orders"], data.channels.length ? data.channels.map((channel) => ({ cells: [
    serviceNames[channel.label] ?? channel.label, amount(channel.revenue), channel.orders.toLocaleString("en-PK")
  ] })) : [{ cells: ["No qualifying orders", amount(0), "0"] }], [0.47, 0.3, 0.23]);
  heading("Reconciliation controls");
  table(["Control", "Value", "Basis"], [
    { cells: ["All / qualifying / cancelled-refunded-failed orders", `${s.allOrders} / ${s.orders} / ${s.excludedOrders}`, "Order counts; current status at generation"] },
    { cells: ["Other open / unverified orders excluded", String(s.openOrders), `Billed value ${amount(s.openValue)}`] },
    { cells: ["Paid order value awaiting fulfilled status", amount(s.paidAwaitingFulfilment), "May require revenue deferral"] },
    { cells: ["Fulfilled value without verified paid status", amount(s.fulfilledWithoutPayment), "Requires payment reconciliation"] },
    { cells: ["Order arithmetic exceptions", String(s.arithmeticExceptions), "Difference above PKR 0.01"] }
  ], [0.49, 0.2, 0.31]);
  heading("Reporting policy");
  paragraph(`Period: ${formatPakistanDate(data.period.start, { dateStyle: "medium", timeStyle: "short" })} through ${formatPakistanDate(data.period.end, { dateStyle: "medium", timeStyle: "medium" })} PKT. This is the last fully closed business month; days run 06:00-06:00 Asia/Karachi. Generated ${generated} PKT from one read-only database snapshot. All branches, including inactive branches, are included; Overview filters do not apply.`);
  paragraph("Sales use order placement dates and current PAID or DELIVERED status, excluding cancellations, refunds and failed payments. Paid advances can require deferral for statutory accounts. Expenses use expense dates and include entered unpaid fixed occurrences. Borrowings, loan repayments, investments, transfers, savings and marketplace settlement receipts are not added as operating income or costs.");
  paragraph("Foodpanda fees are taken from expense titles or categories explicitly naming Foodpanda commission, fees, charges or deductions. Otherwise the application's 38% gross-order-value assumption is used. Incomplete or differently labelled fee entries can affect this estimate; review the ledger before treating the result as final.");
  paragraph("Stock purchase spending is not verified cost of goods sold. Opening/closing inventory, historical consumption costs, depreciation, corporate income tax, partial refunds and unentered accruals are not established by this model. No gross-margin figure or audited net income is asserted. This is a management P&L on the stated recorded-cost basis, not a tax filing or bank reconciliation.");
  const pages = doc.bufferedPageRange();
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    doc.switchToPage(i);
    doc.moveTo(left, doc.page.height - 52).lineTo(left + width, doc.page.height - 52).lineWidth(0.5).strokeColor("#D8E1E8").stroke();
    text(`POCKET / ${data.period.label.toUpperCase()} / CONFIDENTIAL`, left, doc.page.height - 40, 7, false, MUTED, { lineBreak: false });
    text(`${i + 1} / ${pages.count}`, left + width - 48, doc.page.height - 40, 7, false, MUTED, { width: 48, align: "right", lineBreak: false });
  }
  doc.end();
  return complete;
}
