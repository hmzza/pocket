"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createAdminInvestmentCommitment,
  createAdminInvestmentPartner,
  createAdminInvestmentPayment,
  createAdminShareTransfer,
  deleteAdminInvestmentCommitment,
  deleteAdminInvestmentPartner,
  deleteAdminInvestmentPayment,
  deleteAdminShareTransfer,
  fetchAdminInvestments,
  updateAdminInvestmentCommitment,
  updateAdminInvestmentPartner,
  updateAdminInvestmentPayment,
  updateAdminShareTransfer
} from "@/lib/admin-client";
import type { AdminInvestmentCommitment, AdminInvestmentData, AdminInvestmentPartner, AdminInvestmentPayment, AdminShareTransfer, MoneySource } from "@/lib/types";
import { formatCurrency, getCurrentBusinessDateKey, toBusinessDateInputValue } from "@/lib/utils";

const MONEY_SOURCES: Array<{ value: MoneySource; label: string }> = [
  { value: "CASH", label: "Cash" },
  { value: "EASYPAISA", label: "Easypaisa" },
  { value: "JAZZCASH", label: "JazzCash" }
];

const EMPTY_PARTNER_FORM = { id: "", name: "", note: "" };
const EMPTY_COMMITMENT_FORM = { id: "", partnerId: "", amount: "", commitmentDate: getCurrentBusinessDateKey(), note: "" };
const EMPTY_PAYMENT_FORM = { id: "", commitmentId: "", branchId: "", amount: "", receivedSource: "EASYPAISA" as MoneySource, paymentDate: getCurrentBusinessDateKey(), note: "" };
const EMPTY_TRANSFER_FORM = { id: "", fromPartnerId: "", toPartnerId: "", inputMode: "PERCENTAGE" as "PERCENTAGE" | "AMOUNT", value: "", transferDate: getCurrentBusinessDateKey(), note: "" };
type InvestmentFormKey = "partner" | "commitment" | "payment" | "transfer";

function numberValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sourceLabel(value: string) {
  return MONEY_SOURCES.find((source) => source.value === value)?.label ?? value;
}

export function InvestmentManagement() {
  const [data, setData] = useState<AdminInvestmentData | null>(null);
  const [partnerForm, setPartnerForm] = useState(EMPTY_PARTNER_FORM);
  const [commitmentForm, setCommitmentForm] = useState(EMPTY_COMMITMENT_FORM);
  const [paymentForm, setPaymentForm] = useState(EMPTY_PAYMENT_FORM);
  const [transferForm, setTransferForm] = useState(EMPTY_TRANSFER_FORM);
  const [expandedForms, setExpandedForms] = useState<Record<InvestmentFormKey, boolean>>({
    partner: false,
    commitment: false,
    payment: false,
    transfer: false
  });
  const [expandedPartnerIds, setExpandedPartnerIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");
  const partnerCardRef = useRef<HTMLDivElement>(null);
  const commitmentCardRef = useRef<HTMLDivElement>(null);
  const paymentCardRef = useRef<HTMLDivElement>(null);
  const transferCardRef = useRef<HTMLDivElement>(null);

  function scrollToForm(key: InvestmentFormKey) {
    const refs = {
      partner: partnerCardRef,
      commitment: commitmentCardRef,
      payment: paymentCardRef,
      transfer: transferCardRef
    };
    window.setTimeout(() => refs[key].current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  function openForm(key: InvestmentFormKey) {
    setExpandedForms({ partner: false, commitment: false, payment: false, transfer: false, [key]: true });
    scrollToForm(key);
  }

  function toggleForm(key: InvestmentFormKey) {
    setExpandedForms((current) => (
      current[key]
        ? { partner: false, commitment: false, payment: false, transfer: false }
        : { partner: false, commitment: false, payment: false, transfer: false, [key]: true }
    ));
  }

  function togglePartnerHistory(partnerId: string) {
    setExpandedPartnerIds((current) => {
      const next = new Set(current);
      if (next.has(partnerId)) next.delete(partnerId);
      else next.add(partnerId);
      return next;
    });
  }

  async function loadInvestments() {
    try {
      setError("");
      const nextData = await fetchAdminInvestments();
      setData(nextData);
      const firstPartnerId = nextData.partners[0]?.id ?? "";
      const firstBranchId = nextData.branches[0]?.id ?? "";
      const firstCommitmentId = nextData.partners.flatMap((partner) => partner.commitments).find((commitment) => commitment.unpaidAmount > 0)?.id ?? "";
      setCommitmentForm((current) => ({ ...current, partnerId: current.partnerId || firstPartnerId }));
      setPaymentForm((current) => ({ ...current, branchId: current.branchId || firstBranchId, commitmentId: current.commitmentId || firstCommitmentId }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load investments.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadInvestments();
  }, []);

  const commitments = useMemo(() => {
    return (data?.partners ?? []).flatMap((partner) =>
      partner.commitments.map((commitment) => ({
        ...commitment,
        partnerName: partner.name
      }))
    );
  }, [data]);

  const paymentCommitments = useMemo(() => {
    if (!paymentForm.id) return commitments.filter((commitment) => commitment.unpaidAmount > 0);
    return commitments.filter((commitment) => commitment.unpaidAmount > 0 || commitment.id === paymentForm.commitmentId);
  }, [commitments, paymentForm.commitmentId, paymentForm.id]);

  const transferPricePerPercent = data?.summary.pricePerPercent ?? 0;
  const transferPreviewPercent = transferForm.inputMode === "AMOUNT"
    ? (transferPricePerPercent > 0 ? numberValue(transferForm.value) / transferPricePerPercent : 0)
    : numberValue(transferForm.value);
  const transferPreviewAmount = transferForm.inputMode === "AMOUNT"
    ? numberValue(transferForm.value)
    : transferPreviewPercent * transferPricePerPercent;

  function startPartnerCreate() {
    setPartnerForm(EMPTY_PARTNER_FORM);
    openForm("partner");
  }

  function startPartnerEdit(partner: AdminInvestmentPartner) {
    setPartnerForm({ id: partner.id, name: partner.name, note: partner.note ?? "" });
    openForm("partner");
  }

  function startCommitmentCreate(partnerId?: string) {
    setCommitmentForm({ ...EMPTY_COMMITMENT_FORM, partnerId: partnerId ?? data?.partners[0]?.id ?? "" });
    openForm("commitment");
  }

  function startCommitmentEdit(commitment: AdminInvestmentCommitment) {
    setCommitmentForm({
      id: commitment.id,
      partnerId: commitment.partnerId,
      amount: String(commitment.amount),
      commitmentDate: toBusinessDateInputValue(commitment.commitmentDate),
      note: commitment.note ?? ""
    });
    openForm("commitment");
  }

  function startPaymentCreate(commitment?: AdminInvestmentCommitment) {
    setPaymentForm({
      ...EMPTY_PAYMENT_FORM,
      commitmentId: commitment?.id ?? paymentCommitments[0]?.id ?? "",
      branchId: data?.branches[0]?.id ?? "",
      receivedSource: "EASYPAISA",
      amount: commitment ? String(commitment.unpaidAmount) : ""
    });
    openForm("payment");
  }

  function startPaymentEdit(payment: AdminInvestmentPayment) {
    setPaymentForm({
      id: payment.id,
      commitmentId: payment.commitmentId,
      branchId: payment.branchId,
      amount: String(payment.amount),
      receivedSource: payment.receivedSource,
      paymentDate: toBusinessDateInputValue(payment.paymentDate),
      note: payment.note ?? ""
    });
    openForm("payment");
  }

  function startTransferCreate(fromPartnerId?: string) {
    setTransferForm({ ...EMPTY_TRANSFER_FORM, fromPartnerId: fromPartnerId ?? "", toPartnerId: "" });
    openForm("transfer");
  }

  function startTransferEdit(transfer: AdminShareTransfer) {
    setTransferForm({
      id: transfer.id,
      fromPartnerId: transfer.fromPartnerId,
      toPartnerId: transfer.toPartnerId,
      inputMode: "PERCENTAGE",
      value: String(transfer.percentage),
      transferDate: toBusinessDateInputValue(transfer.transferDate),
      note: transfer.note ?? ""
    });
    openForm("transfer");
  }

  async function savePartner() {
    if (!partnerForm.name.trim()) {
      setError("Partner name is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = { name: partnerForm.name.trim(), note: partnerForm.note.trim() || undefined };
      if (partnerForm.id) {
        await updateAdminInvestmentPartner(partnerForm.id, payload);
      } else {
        await createAdminInvestmentPartner(payload);
      }
      setPartnerForm(EMPTY_PARTNER_FORM);
      await loadInvestments();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save partner.");
    } finally {
      setSaving(false);
    }
  }

  async function saveCommitment() {
    if (!commitmentForm.partnerId || !commitmentForm.amount) {
      setError("Partner and committed amount are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        partnerId: commitmentForm.partnerId,
        amount: numberValue(commitmentForm.amount),
        commitmentDate: new Date(`${commitmentForm.commitmentDate}T12:00:00+05:00`).toISOString(),
        note: commitmentForm.note.trim() || undefined
      };
      if (commitmentForm.id) {
        await updateAdminInvestmentCommitment(commitmentForm.id, payload);
      } else {
        await createAdminInvestmentCommitment(payload);
      }
      setCommitmentForm({ ...EMPTY_COMMITMENT_FORM, partnerId: commitmentForm.partnerId });
      await loadInvestments();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save commitment.");
    } finally {
      setSaving(false);
    }
  }

  async function savePayment() {
    if (!paymentForm.commitmentId || !paymentForm.branchId || !paymentForm.amount) {
      setError("Commitment, branch, and payment amount are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        commitmentId: paymentForm.commitmentId,
        branchId: paymentForm.branchId,
        amount: numberValue(paymentForm.amount),
        receivedSource: paymentForm.receivedSource,
        paymentDate: new Date(`${paymentForm.paymentDate}T12:00:00+05:00`).toISOString(),
        note: paymentForm.note.trim() || undefined
      };
      if (paymentForm.id) {
        await updateAdminInvestmentPayment(paymentForm.id, payload);
      } else {
        await createAdminInvestmentPayment(payload);
      }
      setPaymentForm({ ...EMPTY_PAYMENT_FORM, branchId: paymentForm.branchId });
      await loadInvestments();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to record payment.");
    } finally {
      setSaving(false);
    }
  }

  async function saveTransfer() {
    if (!transferForm.fromPartnerId || !transferForm.toPartnerId || !transferForm.value) {
      setError("From partner, to partner, and transfer value are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        fromPartnerId: transferForm.fromPartnerId,
        toPartnerId: transferForm.toPartnerId,
        inputMode: transferForm.inputMode,
        value: numberValue(transferForm.value),
        transferDate: new Date(`${transferForm.transferDate}T12:00:00+05:00`).toISOString(),
        note: transferForm.note.trim() || undefined
      };
      if (transferForm.id) await updateAdminShareTransfer(transferForm.id, payload);
      else await createAdminShareTransfer(payload);
      setTransferForm(EMPTY_TRANSFER_FORM);
      await loadInvestments();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save share transfer.");
    } finally {
      setSaving(false);
    }
  }

  async function removePartner(partner: AdminInvestmentPartner) {
    const confirmed = window.confirm(`Delete ${partner.name}? This also deletes commitments and payments for this partner.`);
    if (!confirmed) return;
    setDeletingId(partner.id);
    setError("");
    try {
      await deleteAdminInvestmentPartner(partner.id);
      await loadInvestments();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete partner.");
    } finally {
      setDeletingId("");
    }
  }

  async function removeCommitment(commitment: AdminInvestmentCommitment) {
    const confirmed = window.confirm("Delete this commitment? This also deletes payments recorded against it.");
    if (!confirmed) return;
    setDeletingId(commitment.id);
    setError("");
    try {
      await deleteAdminInvestmentCommitment(commitment.id);
      await loadInvestments();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete commitment.");
    } finally {
      setDeletingId("");
    }
  }

  async function removePayment(payment: AdminInvestmentPayment) {
    const confirmed = window.confirm("Delete this investment payment?");
    if (!confirmed) return;
    setDeletingId(payment.id);
    setError("");
    try {
      await deleteAdminInvestmentPayment(payment.id);
      await loadInvestments();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete payment.");
    } finally {
      setDeletingId("");
    }
  }

  async function removeTransfer(transfer: AdminShareTransfer) {
    if (!window.confirm(`Delete transfer from ${transfer.fromPartnerName} to ${transfer.toPartnerName}?`)) return;
    setDeletingId(transfer.id);
    setError("");
    try {
      await deleteAdminShareTransfer(transfer.id);
      await loadInvestments();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete share transfer.");
    } finally {
      setDeletingId("");
    }
  }

  return (
    <div className="space-y-6">
      {error ? <pre className="whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50 p-3 font-sans text-sm font-semibold text-red-700">{error}</pre> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Committed" value={formatCurrency(data?.summary.totalCommitted ?? 0)} description="Equity is based on this total." />
        <SummaryCard label="Paid" value={formatCurrency(data?.summary.totalPaid ?? 0)} description="Cash actually received." tone="positive" />
        <SummaryCard label="Unpaid" value={formatCurrency(data?.summary.totalUnpaid ?? 0)} description="Committed but not yet paid." tone="warning" />
        <SummaryCard label="Partners" value={String(data?.summary.partnerCount ?? 0)} description="No partner data is seeded." />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SummaryCard label="Implied company value" value={formatCurrency(data?.summary.impliedCompanyValue ?? 0)} description="Paid plus unpaid committed investment." />
        <SummaryCard label="Price of 1% share" value={formatCurrency(data?.summary.pricePerPercent ?? 0)} description="Contribution-based reference price." tone="positive" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <div className="space-y-5 xl:sticky xl:top-6 xl:self-start">
          <div ref={partnerCardRef}>
          <Card className="p-5">
            <CollapsibleHeader title={partnerForm.id ? "Edit Partner" : "Add Partner"} open={expandedForms.partner} onToggle={() => toggleForm("partner")} />
            {expandedForms.partner ? <div className="mt-4 space-y-3">
              <Input value={partnerForm.name} onChange={(event) => setPartnerForm((current) => ({ ...current, name: event.target.value }))} placeholder="Partner name" />
              <Textarea value={partnerForm.note} onChange={(event) => setPartnerForm((current) => ({ ...current, note: event.target.value }))} placeholder="Optional note" />
              <div className="flex flex-wrap gap-2"><Button onClick={() => void savePartner()} disabled={saving}>{saving ? "Saving..." : partnerForm.id ? "Save Partner" : "Add Partner"}</Button>{partnerForm.id ? <Button variant="outline" onClick={startPartnerCreate}>Cancel</Button> : null}</div>
            </div> : null}
          </Card>
          </div>

          <div ref={commitmentCardRef}>
          <Card className="p-5">
            <CollapsibleHeader title={commitmentForm.id ? "Edit Commitment" : "Add Commitment"} open={expandedForms.commitment} onToggle={() => toggleForm("commitment")} />
            {expandedForms.commitment ? <div className="mt-4 space-y-3">
              <select value={commitmentForm.partnerId} onChange={(event) => setCommitmentForm((current) => ({ ...current, partnerId: event.target.value }))} className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm">
                <option value="">Select partner</option>
                {(data?.partners ?? []).map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}
              </select>
              <Input type="number" min="0" step="0.01" value={commitmentForm.amount} onChange={(event) => setCommitmentForm((current) => ({ ...current, amount: event.target.value }))} placeholder="Committed amount" />
              <Input type="date" value={commitmentForm.commitmentDate} onChange={(event) => setCommitmentForm((current) => ({ ...current, commitmentDate: event.target.value }))} />
              <Textarea value={commitmentForm.note} onChange={(event) => setCommitmentForm((current) => ({ ...current, note: event.target.value }))} placeholder="Optional note" />
              <div className="flex flex-wrap gap-2"><Button onClick={() => void saveCommitment()} disabled={saving}>{saving ? "Saving..." : commitmentForm.id ? "Save Commitment" : "Add Commitment"}</Button>{commitmentForm.id ? <Button variant="outline" onClick={() => startCommitmentCreate(commitmentForm.partnerId)}>Cancel</Button> : null}</div>
            </div> : null}
          </Card>
          </div>

          <div ref={paymentCardRef}>
          <Card className="p-5">
            <CollapsibleHeader title={paymentForm.id ? "Edit Payment" : "Record Payment"} open={expandedForms.payment} onToggle={() => toggleForm("payment")} />
            {expandedForms.payment ? <div className="mt-4 space-y-3">
              <select value={paymentForm.commitmentId} onChange={(event) => setPaymentForm((current) => ({ ...current, commitmentId: event.target.value }))} className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm">
                <option value="">Select commitment</option>
                {paymentCommitments.map((commitment) => <option key={commitment.id} value={commitment.id}>{commitment.partnerName} - unpaid {formatCurrency(commitment.unpaidAmount)}</option>)}
              </select>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input type="number" min="0" step="0.01" value={paymentForm.amount} onChange={(event) => setPaymentForm((current) => ({ ...current, amount: event.target.value }))} placeholder="Payment amount" />
                <select value={paymentForm.receivedSource} onChange={(event) => setPaymentForm((current) => ({ ...current, receivedSource: event.target.value as MoneySource }))} className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm">
                  {MONEY_SOURCES.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}
                </select>
              </div>
              <Input type="date" value={paymentForm.paymentDate} onChange={(event) => setPaymentForm((current) => ({ ...current, paymentDate: event.target.value }))} />
              <Textarea value={paymentForm.note} onChange={(event) => setPaymentForm((current) => ({ ...current, note: event.target.value }))} placeholder="Optional note" />
              <div className="flex flex-wrap gap-2"><Button onClick={() => void savePayment()} disabled={saving}>{saving ? "Saving..." : paymentForm.id ? "Save Payment" : "Record Payment"}</Button>{paymentForm.id ? <Button variant="outline" onClick={() => startPaymentCreate()}>Cancel</Button> : null}</div>
            </div> : null}
          </Card>
          </div>

          <div ref={transferCardRef}>
          <Card className="p-5">
            <CollapsibleHeader title={transferForm.id ? "Edit Share Transfer" : "Transfer Shares"} open={expandedForms.transfer} onToggle={() => toggleForm("transfer")} />
            {expandedForms.transfer ? <div className="mt-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <select value={transferForm.fromPartnerId} onChange={(event) => setTransferForm((current) => ({ ...current, fromPartnerId: event.target.value }))} className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm">
                  <option value="">From partner</option>
                  {(data?.partners ?? []).map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}
                </select>
                <select value={transferForm.toPartnerId} onChange={(event) => setTransferForm((current) => ({ ...current, toPartnerId: event.target.value }))} className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm">
                  <option value="">To partner</option>
                  {(data?.partners ?? []).map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}
                </select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <select value={transferForm.inputMode} onChange={(event) => setTransferForm((current) => ({ ...current, inputMode: event.target.value as "PERCENTAGE" | "AMOUNT" }))} className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm">
                  <option value="PERCENTAGE">Percentage</option>
                  <option value="AMOUNT">Amount</option>
                </select>
                <Input type="number" min="0" step="0.01" value={transferForm.value} onChange={(event) => setTransferForm((current) => ({ ...current, value: event.target.value }))} placeholder={transferForm.inputMode === "AMOUNT" ? "Agreed amount" : "Percentage to transfer"} />
              </div>
              <div className="rounded-md bg-pocket-cream p-3 text-sm text-pocket-navy/70">
                <p>Current price of 1%: <strong className="text-pocket-navy">{formatCurrency(transferPricePerPercent)}</strong></p>
                <p>Calculated transfer: <strong className="text-pocket-navy">{transferPreviewPercent.toFixed(4)}%</strong> ({formatCurrency(transferPreviewAmount)} reference)</p>
              </div>
              <Input type="date" value={transferForm.transferDate} onChange={(event) => setTransferForm((current) => ({ ...current, transferDate: event.target.value }))} />
              <Textarea value={transferForm.note} onChange={(event) => setTransferForm((current) => ({ ...current, note: event.target.value }))} placeholder="Optional note" />
              <div className="flex flex-wrap gap-2"><Button onClick={() => void saveTransfer()} disabled={saving}>{saving ? "Saving..." : transferForm.id ? "Save Transfer" : "Transfer Shares"}</Button>{transferForm.id ? <Button variant="outline" onClick={() => startTransferCreate()}>Cancel</Button> : null}</div>
            </div> : null}
          </Card>
          </div>
        </div>

        <div className="space-y-4">
          {loading ? <Card className="p-5 text-sm text-pocket-navy/60">Loading investments...</Card> : null}
          {!loading && !(data?.partners.length ?? 0) ? <Card className="p-5 text-sm text-pocket-navy/60">No partners yet. Add partners manually to start tracking capital.</Card> : null}
          {(data?.partners ?? []).map((partner) => (
            <Card key={partner.id} className="p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-black text-pocket-navy">{partner.name}</p>
                    <span className="rounded-full bg-pocket-cream px-2.5 py-1 text-xs font-bold text-pocket-navy">{partner.equityPercent}% equity</span>
                  </div>
                  {partner.note ? <p className="mt-2 text-sm text-pocket-navy/70">{partner.note}</p> : null}
                  <div className="mt-3 h-2 rounded-full bg-pocket-cream"><div className="h-2 rounded-full bg-pocket-orange" style={{ width: `${partner.committedAmount > 0 ? Math.min(100, (partner.paidAmount / partner.committedAmount) * 100) : 0}%` }} /></div>
                </div>
                <div className="grid min-w-[320px] gap-3 sm:grid-cols-3">
                  <Metric label="Committed" value={formatCurrency(partner.committedAmount)} />
                  <Metric label="Paid" value={formatCurrency(partner.paidAmount)} tone="positive" />
                  <Metric label="Unpaid" value={formatCurrency(partner.unpaidAmount)} tone="warning" />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => startCommitmentCreate(partner.id)}>Add Commitment</Button>
                <Button size="sm" variant="outline" onClick={() => startTransferCreate(partner.id)}>Transfer Shares</Button>
                <Button size="sm" variant="outline" onClick={() => startPartnerEdit(partner)}><Pencil className="h-4 w-4" />Edit</Button>
                {(partner.commitments.length || (data?.transfers ?? []).some((transfer) => transfer.fromPartnerId === partner.id || transfer.toPartnerId === partner.id)) ? (
                  <Button size="sm" variant="outline" onClick={() => togglePartnerHistory(partner.id)}>
                    {expandedPartnerIds.has(partner.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    {expandedPartnerIds.has(partner.id) ? "Hide history" : "View history"}
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => void removePartner(partner)} disabled={deletingId === partner.id}><Trash2 className="h-4 w-4" />Delete</Button>
              </div>
              {partner.commitments.length && expandedPartnerIds.has(partner.id) ? (
                <div className="mt-4 space-y-3">
                  {partner.commitments.map((commitment) => (
                    <div key={commitment.id} className="rounded-lg border border-pocket-navy/10 p-3">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="font-bold text-pocket-navy">{formatCurrency(commitment.amount)} committed on {new Date(commitment.commitmentDate).toLocaleDateString("en-PK")}</p>
                          <p className="text-sm text-pocket-navy/60">Paid {formatCurrency(commitment.paidAmount)} - Unpaid {formatCurrency(commitment.unpaidAmount)}</p>
                          {commitment.note ? <p className="mt-1 text-sm text-pocket-navy/60">{commitment.note}</p> : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {commitment.unpaidAmount > 0 ? <Button size="sm" onClick={() => startPaymentCreate(commitment)}>Record Payment</Button> : null}
                          <Button size="sm" variant="outline" onClick={() => startCommitmentEdit(commitment)}><Pencil className="h-4 w-4" />Edit</Button>
                          <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => void removeCommitment(commitment)} disabled={deletingId === commitment.id}><Trash2 className="h-4 w-4" />Delete</Button>
                        </div>
                      </div>
                      {commitment.payments.length ? (
                        <div className="mt-3 divide-y divide-pocket-navy/10 rounded-lg bg-pocket-cream">
                          {commitment.payments.map((payment) => (
                            <div key={payment.id} className="flex flex-col gap-2 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                              <p className="font-semibold text-pocket-navy">{formatCurrency(payment.amount)} received in {sourceLabel(payment.receivedSource)} at {payment.branchName} on {new Date(payment.paymentDate).toLocaleDateString("en-PK")}</p>
                              <div className="flex flex-wrap gap-2">
                                <Button size="sm" variant="outline" onClick={() => startPaymentEdit(payment)}><Pencil className="h-4 w-4" />Edit</Button>
                                <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => void removePayment(payment)} disabled={deletingId === payment.id}><Trash2 className="h-4 w-4" />Delete</Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
              {expandedPartnerIds.has(partner.id) && (data?.transfers ?? []).some((transfer) => transfer.fromPartnerId === partner.id || transfer.toPartnerId === partner.id) ? (
                <div className="mt-4 rounded-lg bg-pocket-cream p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-pocket-navy/50">Share transfers</p>
                  <div className="mt-2 space-y-2">
                    {(data?.transfers ?? []).filter((transfer) => transfer.fromPartnerId === partner.id || transfer.toPartnerId === partner.id).map((transfer) => (
                      <div key={transfer.id} className="flex flex-col gap-2 border-b border-pocket-navy/10 py-2 last:border-0 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-sm text-pocket-navy">
                          <p className="font-semibold">{transfer.fromPartnerId === partner.id ? "Transferred to" : "Received from"} {transfer.fromPartnerId === partner.id ? transfer.toPartnerName : transfer.fromPartnerName}: {transfer.percentage.toFixed(4)}% ({formatCurrency(transfer.referenceAmount)})</p>
                          <p className="text-pocket-navy/60">{new Date(transfer.transferDate).toLocaleDateString("en-PK")}{transfer.note ? ` - ${transfer.note}` : ""}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => startTransferEdit(transfer)}><Pencil className="h-4 w-4" />Edit</Button>
                          <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => void removeTransfer(transfer)} disabled={deletingId === transfer.id}><Trash2 className="h-4 w-4" />Delete</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function CollapsibleHeader({ title, open, onToggle }: { title: string; open: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={onToggle}>
      <span className="text-lg font-black text-pocket-navy">{title}</span>
      <span className="grid h-9 w-9 place-items-center rounded-md border border-pocket-navy/10 text-pocket-navy">
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </span>
    </button>
  );
}

function SummaryCard({ label, value, description, tone }: { label: string; value: string; description: string; tone?: "positive" | "warning" }) {
  return <Card className="p-5"><p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">{label}</p><p className={`mt-3 text-2xl font-black ${tone === "positive" ? "text-emerald-700" : tone === "warning" ? "text-amber-700" : "text-pocket-navy"}`}>{value}</p><p className="mt-2 text-sm text-pocket-navy/60">{description}</p></Card>;
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "positive" | "warning" }) {
  return <div><p className="text-xs font-semibold uppercase tracking-wide text-pocket-navy/50">{label}</p><p className={`font-black ${tone === "positive" ? "text-emerald-700" : tone === "warning" ? "text-amber-700" : "text-pocket-navy"}`}>{value}</p></div>;
}
