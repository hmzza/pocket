import PDFDocument from "pdfkit";
import { formatPakistanDate, getBusinessDateKey, businessDayStart } from "./business-day.js";
import { INVESTOR_REPORT_START, REPORT_FOODPANDA_COMMISSION_RATE, rupees, type InvestorReportData } from "./investor-report-data.js";

const NAVY = "#102A43", ORANGE = "#F36C21", MUTED = "#52677A", CREAM = "#FFF5EA", LIGHT = "#EFF3F6", GREEN = "#18715B";
const money = (value: number) => `PKR ${rupees(value).toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const number = (value: number) => value.toLocaleString("en-PK", { maximumFractionDigits: 0 });
const percent = (part: number, total: number) => total ? `${(part / total * 100).toFixed(1)}%` : "N/A";
const change = (current: number, previous: number) => previous > 0 ? `${current >= previous ? "+" : ""}${((current / previous - 1) * 100).toFixed(1)}%` : "N/A";
const serviceNames: Record<string, string> = { DELIVERY: "Direct delivery", TAKEAWAY: "Takeaway / pickup", DINE_IN: "Dine-in", INSHOP: "Inshop", FOODPANDA: "Foodpanda", GOLOOTLO: "Golootlo", NASCON: "Nascon stall" };
const clean = (value: string) => value.replace(/[\r\n\t]/g, " ").replace(/[\u0000-\u001f]/g, "").replace(/[\u2010-\u2015]/g, "-");

/** Build in memory: no public file, persisted report, browser, or production write is needed. */
export async function renderInvestorReport(data: InvestorReportData): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margins: { top: 40, bottom: 25, left: 42, right: 42 }, bufferPages: true,
    info: { Title: "Pocket | Investor Business Report", Author: "Pocket - The Shawarma Spot", Subject: "Business performance since June 2026", CreationDate: data.generatedAt } });
  const chunks: Buffer[] = [];
  const complete = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const left = 42, width = doc.page.width - 84, bottom = doc.page.height - 76;
  let y = 0, section = "";
  const date = (value: Date) => formatPakistanDate(value, { dateStyle: "medium" });
  const generated = formatPakistanDate(data.generatedAt, { dateStyle: "medium", timeStyle: "short" });
  const range = `${date(data.start)} - ${date(data.generatedAt)}`;
  const text = (value: string, x: number, top: number, size = 10, color = NAVY, bold = false, options: PDFKit.Mixins.TextOptions = {}) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).fillColor(color).text(clean(value), x, top, options);
  };
  function startPage(title: string, subtitle: string, first = false) {
    if (!first) doc.addPage();
    section = title;
    doc.rect(0, 0, doc.page.width, 7).fill(ORANGE);
    text("POCKET", left, 30, 18, NAVY, true);
    text("THE SHAWARMA SPOT", left + 91, 35, 7.5, MUTED, true);
    text("CONFIDENTIAL / INVESTOR REPORT", left, 63, 8, ORANGE, true);
    text(title, left, 88, 26, NAVY, true, { width });
    const titleBottom = doc.y;
    text(subtitle, left, titleBottom + 9, 9.5, MUTED, false, { width, lineGap: 2 });
    y = doc.y + 23;
  }
  function ensure(height: number) {
    if (y + height > bottom) startPage(section, "Continued | " + range);
  }
  function paragraph(value: string, size = 10, color = MUTED) {
    doc.font("Helvetica").fontSize(size);
    const height = doc.heightOfString(clean(value), { width, lineGap: 3 });
    ensure(height + 14);
    text(value, left, y, size, color, false, { width, lineGap: 3 });
    y += height + 14;
  }
  function heading(value: string) { ensure(95); text(value, left, y, 13, NAVY, true); y += 25; }
  function note(title: string, body: string) {
    doc.font("Helvetica").fontSize(9.5);
    const height = doc.heightOfString(clean(body), { width: width - 28, lineGap: 3 }) + 46;
    ensure(height + 12);
    doc.roundedRect(left, y, width, height, 7).fill(CREAM);
    text(title, left + 14, y + 12, 10, NAVY, true, { width: width - 28 });
    text(body, left + 14, y + 30, 9.5, MUTED, false, { width: width - 28, lineGap: 3 });
    y += height + 15;
  }
  function kpis(cards: Array<{ label: string; value: string; detail: string }>) {
    for (let i = 0; i < cards.length; i += 2) {
      ensure(103);
      cards.slice(i, i + 2).forEach((card, index) => {
        const cardWidth = (width - 12) / 2, x = left + index * (cardWidth + 12);
        doc.roundedRect(x, y, cardWidth, 87, 7).fill(LIGHT);
        text(card.label.toUpperCase(), x + 13, y + 12, 8, MUTED, true, { width: cardWidth - 26 });
        text(card.value, x + 13, y + 29, card.value.length > 18 ? 15 : 21, NAVY, true, { width: cardWidth - 26 });
        text(card.detail, x + 13, y + 61, 8, MUTED, false, { width: cardWidth - 26, height: 20, ellipsis: true });
      });
      y += 103;
    }
  }
  function table(headers: string[], rows: string[][], fractions: number[]) {
    const widths = fractions.map((fraction) => fraction * width);
    function tableHeader() {
      ensure(70);
      doc.rect(left, y, width, 29).fill(NAVY);
      let x = left;
      headers.forEach((header, i) => {
        text(header, x + 8, y + 10, 8, "#FFFFFF", true, { width: widths[i]! - 16, lineBreak: false }); x += widths[i]!;
      });
      y += 29;
    }
    tableHeader();
    if (!rows.length) rows = [["No records in this period.", ...headers.slice(1).map(() => "-")]];
    rows.forEach((row, index) => {
      doc.font("Helvetica").fontSize(9);
      const height = Math.max(30, ...row.map((cell, i) => doc.heightOfString(clean(cell), { width: widths[i]! - 16 }) + 17));
      if (y + height > bottom) { startPage(section, "Continued | " + range); tableHeader(); }
      if (index % 2 === 0) doc.rect(left, y, width, height).fill(LIGHT);
      let x = left;
      row.forEach((cell, i) => { text(cell, x + 8, y + 9, 9, i === 0 ? NAVY : MUTED, i === 0, { width: widths[i]! - 16 }); x += widths[i]!; });
      y += height;
    });
    y += 18;
  }
  function bars(rows: Array<{ label: string; value: number }>, format = money) {
    if (!rows.length) { paragraph("No qualifying records are available for this chart."); return; }
    const max = Math.max(1, ...rows.map((row) => row.value));
    for (const row of rows) {
      ensure(48);
      text(row.label, left, y, 9, NAVY, true, { width: width * 0.64, lineBreak: false, ellipsis: true });
      text(format(row.value), left + width * 0.64, y, 9, MUTED, false, { width: width * 0.36, align: "right", lineBreak: false });
      doc.roundedRect(left, y + 17, width, 7, 3).fill(LIGHT);
      if (row.value > 0) doc.roundedRect(left, y + 17, Math.max(2, width * row.value / max), 7, 3).fill(ORANGE);
      y += 41;
    }
    y += 7;
  }
  const s = data.summary;
  const commission = Math.round(s.foodpanda * REPORT_FOODPANDA_COMMISSION_RATE);
  const netSales = s.sales - s.tax - s.delivery;
  const indicativeSurplus = netSales - commission - data.expenses;
  const aov = s.orders ? s.sales / s.orders : 0;
  const fullMonths = data.months.filter((month) => month.complete);
  const latest = fullMonths.at(-1), previous = fullMonths.at(-2);
  const topService = data.services[0], topProduct = data.products[0];

  startPage("A business built on real orders.", `Inception-to-date performance | ${range}\nPrepared ${generated} PKT | All branches, including inactive branches`, true);
  kpis([
    { label: "Qualified order sales", value: money(s.sales), detail: "Paid or fulfilled orders; includes tax and delivery" },
    { label: "Qualified orders", value: number(s.orders), detail: `${number(s.fulfilledOrders)} fulfilled; balance paid in advance` },
    { label: "Average order value", value: money(aov), detail: "Qualified order sales / qualified orders" },
    { label: "Recorded expenses paid", value: money(data.expenses), detail: "Includes stock purchases; excludes unpaid fixed bills" }
  ]);
  heading("The investment conversation");
  paragraph(s.orders
    ? `Pocket has recorded ${number(s.orders)} paid or fulfilled orders and ${money(s.sales)} in associated order value since June 2026. This report brings the order book, expense ledger, customer signals and capital records into one view.`
    : "No paid or fulfilled orders are recorded in the reporting window. An investment case based on traction cannot yet be supported by these records.");
  if (latest && previous) paragraph(`Latest complete month: ${latest.label} recorded ${money(latest.sales)} across ${number(latest.orders)} orders. Sales changed ${change(latest.sales, previous.sales)} and orders changed ${change(latest.orders, previous.orders)} versus ${previous.label}.`);
  if (topService) paragraph(`${serviceNames[topService.label] ?? topService.label} is the largest sales channel at ${percent(topService.sales, s.sales)} of qualified sales.${topProduct ? ` ${topProduct.label} leads the product ranking by recorded line value.` : ""}`);
  note("Basis of presentation", "Qualified sales include orders marked PAID or DELIVERED, excluding cancelled, refunded and failed orders. Paid orders may still await fulfilment. This is a management report drawn from current application records; sales are not the same as cash collected or audited revenue.");

  startPage("Monthly traction", "A consistent view from June 2026. The current business month is partial.");
  heading("Sales by month");
  // Keep charts readable over a long company history; the complete table follows.
  bars(data.months.slice(-12).map((month) => ({ label: `${month.label}${month.complete ? "" : " (partial)"}`, value: month.sales })));
  if (data.months.length > 12) paragraph("Chart shows the latest 12 months. The table includes every month since inception.", 9);
  heading("Monthly performance ledger");
  table(["Month", "Orders", "Sales (PKR)", "Expenses (PKR)", "Sales MoM"], data.months.map((month, index) => [
    `${month.label}${month.complete ? "" : " *"}`, number(month.orders), number(rupees(month.sales)), number(rupees(month.expenses)),
    month.complete && index > 0 && data.months[index - 1]!.complete ? change(month.sales, data.months[index - 1]!.sales) : "N/A"
  ]), [0.23, 0.12, 0.23, 0.24, 0.18]);
  paragraph("* Partial month through the generation time; no month-over-month comparison is made against a full month. Zero-record months are shown as zero. June coverage starts on 1 June at 06:00 PKT, rather than an assumed opening day.", 9);

  startPage("Financial performance", "Separating order value, marketplace estimates and recorded spending. All amounts in PKR.");
  table(["Performance bridge", "Amount"], [
    ["Qualified order sales", money(s.sales)], ["Less: recorded sales tax", money(s.tax)],
    ["Less: delivery charges billed to customers", money(s.delivery)], ["Net merchandise sales", money(netSales)],
    ["Less: estimated Foodpanda fees (38% of qualified Foodpanda order value)", money(commission)],
    ["Less: recorded paid expenses, including stock purchases", money(data.expenses)],
    ["Indicative surplus / (deficit)", money(indicativeSurplus)]
  ], [0.73, 0.27]);
  note("An indicative trading measure", "This bridge mixes order sales with the paid expense ledger. It is not net profit, EBITDA or free cash flow. Stock purchases are spending, not verified cost of goods sold. Inventory changes, depreciation, tax liabilities, unpaid costs, delivery economics and unrecorded expenses can change the result. Delivery income is excluded conservatively; related costs remain in the ledger.");
  paragraph(`Paid expenses include ${money(data.stockPurchases)} in linked stock purchases, counted once. Recorded unpaid fixed bills of ${money(data.unpaidFixedExpenses)} are excluded. Order discounts of ${money(s.discounts)} are already reflected in sales.`, 9);
  heading("Where the spending goes");
  table(["Expense category", "Paid amount", "Share"], data.expenseCategories.map((category) => [category.label, money(category.amount), percent(category.amount, data.expenses)]), [0.48, 0.32, 0.2]);

  startPage("Routes to the customer", "Channel mix and branch footprint for paid or fulfilled orders.");
  bars(data.services.map((service) => ({ label: serviceNames[service.label] ?? service.label, value: service.sales })));
  table(["Channel", "Orders", "Sales", "Share"], data.services.map((service) => [serviceNames[service.label] ?? service.label, number(service.orders), money(service.sales), percent(service.sales, s.sales)]), [0.34, 0.15, 0.33, 0.18]);
  note("Golootlo receivables - payouts not tracked", `${money(s.golootloReceivables)} from paid Golootlo-payment orders in the reporting period. This amount is already included in sales and excluded from the Cash, Easypaisa and JazzCash wallets. Golootlo orders paid through those wallets remain ordinary wallet receipts. No Golootlo commission or settlement receipts are assumed; this is not a reconciled outstanding balance.`);
  heading("Whole-business branch coverage");
  table(["Branch / city", "Orders", "Sales", "Share"], data.branchDirectory.map((branch) => {
    const bucket = data.branches.find((entry) => entry.label === branch.id);
    return [`${branch.name} / ${branch.city}${branch.isActive ? "" : " (inactive)"}`, number(bucket?.orders ?? 0), money(bucket?.sales ?? 0), percent(bucket?.sales ?? 0, s.sales)];
  }), [0.4, 0.12, 0.3, 0.18]);
  paragraph("This export deliberately covers the full business and ignores the Overview branch, date and channel filters. Archived or inactive branches remain included in historical totals.", 9);

  startPage("Products and demand", "What sells, and when qualified orders are placed.");
  heading("Top products by recorded line value");
  table(["Product", "Units", "Line value"], data.products.slice(0, 12).map((product) => [product.label, number(product.units), money(product.lineSales)]), [0.57, 0.13, 0.3]);
  paragraph("Line value = historical unit price x quantity on the parent order item. It is before order-level discounts, tax and delivery. Add-ons are represented as stored in item prices. Bundle components are not counted a second time. Product profitability is unavailable without reliable historical recipe costs.", 9);
  heading("Peak demand signals");
  const peakHour = data.hours[0], peakWeekday = data.weekdays[0];
  const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  kpis([
    { label: "Leading placement hour", value: peakHour ? `${peakHour.label.padStart(2, "0")}:00 PKT` : "N/A", detail: peakHour ? `${number(peakHour.orders)} orders / ${money(peakHour.sales)} sales` : "No qualifying orders" },
    { label: "Leading business weekday", value: peakWeekday ? weekdayNames[Number(peakWeekday.label)]! : "N/A", detail: peakWeekday ? `${number(peakWeekday.orders)} orders / ${money(peakWeekday.sales)} sales` : "No qualifying orders" }
  ]);
  paragraph("Peak periods are ranked by cumulative qualified sales, not average sales per opening hour or capacity utilisation. Hours use the actual Pakistan placement time; weekdays follow the 06:00 business-day boundary. Differences in trading days and opening schedules are not adjusted.", 9);

  startPage("Customers and growth potential", "Observed traction and explicitly hypothetical volume scenarios.");
  kpis([
    { label: "Identifiable customers", value: number(data.customers.identified), detail: "Phone or registered customer ID; qualified orders only" },
    { label: "Repeat customer rate", value: percent(data.customers.repeat, data.customers.identified), detail: `${number(data.customers.repeat)} customers placed at least two qualified orders` }
  ]);
  paragraph(`Identity coverage is ${percent(s.identifiedOrders, s.orders)} of qualified orders. Anonymous walk-ins are excluded; Pakistan mobile numbers are normalised where possible. Shared phones and changed details can affect matching. Repeat rate measures this window, not cohort retention or lifetime value.`, 9);
  const trailing = data.trailing;
  const historyDays = (businessDayStart(getBusinessDateKey(data.generatedAt)).getTime() - data.start.getTime()) / 86400000;
  if (historyDays >= 28) paragraph(`The last 28 completed business days recorded ${number(trailing.orders)} qualified orders and ${money(trailing.sales)} in sales.${historyDays >= 56 ? ` Sales changed ${change(trailing.sales, trailing.previousSales)} and orders changed ${change(trailing.orders, trailing.previousOrders)} versus the previous 28 days.` : ""}`, 9);
  if (historyDays >= 28 && trailing.orders > 0) {
    const baseOrders = trailing.orders / 28 * 30;
    const recentAov = trailing.sales / trailing.orders;
    heading("Illustrative 30-day sales at recent ticket size");
    table(["Volume assumption", "Orders (approx.)", "Order sales"], [0.8, 1, 1.2].map((factor) => [
      factor === 1 ? "Recent daily pace" : `${factor < 1 ? "20% fewer" : "20% more"} orders`, number(Math.round(baseOrders * factor)), money(Math.round(baseOrders * factor) * recentAov)
    ]), [0.42, 0.25, 0.33]);
    paragraph("Scenarios apply the last 28 completed days' average daily order volume to 30 days, holding ticket size constant. Zero-sales days remain in the denominator. These are sensitivities, not forecasts; they assume no capacity, seasonality, pricing or demand changes and make no profit or return claim.", 9);
  } else note("Scenario basis unavailable", "At least 28 completed business days since June 2026 and one qualifying order in that window are needed for a recent-pace illustration. No projection is generated from insufficient data.");
  if (s.foodpanda > 0) note("Channel economics opportunity", `At the 38% fee assumption, shifting 10% of the report's qualified Foodpanda sales to direct sales would avoid approximately ${money(Math.round(s.foodpanda * 0.1 * REPORT_FOODPANDA_COMMISSION_RATE))} in marketplace fees before direct fulfilment, customer acquisition and payment costs. This is a historical sensitivity, not a promised saving or incremental demand.`);
  paragraph("Potential capital priorities: validate historical unit margins, test direct-channel conversion with measured acquisition costs, and use peak-period demand to assess staffing and fulfilment. Expansion should follow branch-level economics and capacity evidence. No external market-size, valuation or investor-return assumptions are embedded.", 9);

  startPage("Capital and marketplace reconciliation", "Financing is kept separate from sales and trading performance.");
  table(["Capital metric", "Amount"], [
    ["Investment payments received in report period", money(data.capital.investments)],
    ["Loan principal received in report period", money(data.capital.loans)],
    ["Loan principal repaid in report period", money(data.capital.repayments)],
    ["Recorded outstanding loan principal at cutoff (all history)", money(data.capital.outstandingLoans)],
    ["Other money additions in report period", money(data.capital.additions)],
    ["Current monthly fixed-expense budget (active definitions)", money(data.capital.currentMonthlyFixed)]
  ], [0.73, 0.27]);
  paragraph("These are ledger totals, not bank reconciliation. Investment commitments without payments are excluded. Other additions are shown separately because their economic nature is not verified. Transfers and savings movements are not sales or expenses. No cash balance, company valuation or ownership offer is inferred.", 9);
  heading("Recorded Foodpanda settlements");
  table(["Settlement metric", "Amount / count"], [
    ["Received settlement cycles fully inside the reporting window", number(data.settlements.count)],
    ["Gross sales recorded on those cycles", money(data.settlements.gross)],
    ["Recorded commission plus other charges on those cycles", money(data.settlements.charges)],
    ["Amounts recorded as received by the cutoff", money(data.settlements.received)],
    ["Recorded boundary-spanning cycles (not compared)", number(data.settlements.partial)]
  ], [0.73, 0.27]);
  note("Avoiding double counting", "Settlement receipts are collections, not additional sales. Actual charges are shown separately; the bridge uses a 38% fee estimate. Timing, missing cycles and adjustments can prevent reconciliation. Differences are not treated as verified receivables or losses.");

  startPage("Data confidence and methodology", `Source: live Pocket application database | Snapshot generated ${generated} PKT`);
  table(["Control", "Observed value"], [
    ["All orders placed in report window", number(s.allOrders)],
    ["Qualified paid or fulfilled orders", number(s.orders)],
    ["Excluded cancelled / refunded / failed orders", `${number(s.excludedOrders)} / ${money(s.excludedValue)}`],
    ["Other open / unverified orders excluded from sales", `${number(s.openOrders)} / ${money(s.openValue)}`],
    ["Qualified order value marked PAID", money(s.paidSales)],
    ["Fulfilled order value without verified PAID status", money(s.unverifiedSales)],
    ["Order arithmetic exceptions (difference greater than PKR 0.01)", number(s.reconciliationExceptions)],
    ["First / latest qualified order placed", s.firstOrder && s.lastOrder ? `${date(s.firstOrder)} / ${date(s.lastOrder)}` : "N/A"]
  ], [0.68, 0.32]);
  note("Scope of the evidence", "This report reflects what is currently recorded in Pocket. Missing, deleted or unrecorded activity is not reconstructed. Fulfilled orders without verified payment and unpaid fixed bills need reconciliation before relying on a cash or profit figure.");
  startPage("Methodology", "Definitions, source records and limits of the analysis.");
  paragraph(`Coverage starts ${INVESTOR_REPORT_START} at 06:00 Asia/Karachi and ends at the exact generation timestamp. Orders use placedAt; expenses use expenseDate; loans and capital payments use their ledger dates. Pakistan business days run 06:00 to 06:00. Full months use the same boundary; the current month is partial. All branches are included, regardless of active status.`, 9);
  paragraph("Eligibility is evaluated from the order's current status at export time: PAID or DELIVERED, excluding CANCELLED, REFUNDED and FAILED. A later status correction can change a rerun. Full-order refunds are excluded; the data model does not provide a separate partial-refund ledger. Paid orders awaiting fulfilment are included as paid order sales, not claimed as earned accounting revenue.", 9);
  paragraph("Expenses count each Expense record once, including linked inventory purchases and paid fixed-expense occurrences. Unpaid fixed occurrences are shown separately. Stock transactions are not deducted again. Missing fixed-expense occurrences are not created by exporting. Purchase spending is not historical COGS; gross margin and audited net profit cannot be established from this report.", 9);
  paragraph("Order amounts are aggregated in paisa and displayed rounded to whole rupees. Ratios use unrounded totals; rounded rows may differ slightly from displayed sums. Product rankings use stored line prices, not today's menu prices. Missing denominators and growth from a zero base are shown as N/A.", 9);
  paragraph("Customer names, contact details, addresses, employee identities and lender or investor names are omitted. Sources are the Order, OrderItem, Branch, Expense, FixedExpenseOccurrence, FixedExpense, Loan, LoanRepayment, InvestmentPayment, MoneyAddition and FoodpandaSettlement records. All sections share one read-only database snapshot. Deleted, missing or unrecorded activity is not reconstructed.", 9);
  note("Items to substantiate before an investment decision", "Reconcile sales and settlement receipts to bank and cash records; verify stock counts and historical recipe costs; confirm unpaid obligations and taxes; review lease, equipment and staffing costs; and agree a funding amount, use of funds and milestones. This report supplies operating evidence and does not invent those terms.");

  const pages = doc.bufferedPageRange();
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    doc.switchToPage(i);
    doc.moveTo(left, doc.page.height - 52).lineTo(left + width, doc.page.height - 52).lineWidth(0.5).strokeColor("#D8E1E8").stroke();
    text("POCKET / CONFIDENTIAL / MANAGEMENT RECORDS", left, doc.page.height - 40, 7, MUTED, false, { lineBreak: false });
    text(`${i + 1} / ${pages.count}`, left + width - 58, doc.page.height - 40, 7, MUTED, false, { width: 58, align: "right", lineBreak: false });
  }
  doc.end();
  return complete;
}
