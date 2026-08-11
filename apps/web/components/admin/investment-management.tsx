"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createAdminInvestmentCommitment,
  createAdminInvestmentPartner,
  createAdminInvestmentPayment,
  deleteAdminInvestmentCommitment,
  deleteAdminInvestmentPartner,
  deleteAdminInvestmentPayment,
  fetchAdminInvestments,
  updateAdminInvestmentCommitment,
  updateAdminInvestmentPartner,
  updateAdminInvestmentPayment
} from "@/lib/admin-client";
import type { AdminInvestmentCommitment, AdminInvestmentData, AdminInvestmentPartner, AdminInvestmentPayment, MoneySource } from "@/lib/types";
import { formatCurrency, getCurrentBusinessDateKey, toBusinessDateInputValue } from "@/lib/utils";

const MONEY_SOURCES: Array<{ value: MoneySource; label: string }> = [
  { value: "CASH", label: "Cash" },
  { value: "EASYPAISA", label: "Easypaisa" },
  { value: "JAZZCASH", label: "JazzCash" }
];

const EMPTY_PARTNER_FORM = { id: "", name: "", note: "" };
const EMPTY_COMMITMENT_FORM = { id: "", partnerId: "", amount: "", commitmentDate: getCurrentBusinessDateKey(), note: "" };
const EMPTY_PAYMENT_FORM = { id: "", commitmentId: "", branchId: "", amount: "", receivedSource: "CASH" as MoneySource, paymentDate: getCurrentBusinessDateKey(), note: "" };

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");

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

  function startPartnerCreate() {
    setPartnerForm(EMPTY_PARTNER_FORM);
  }

  function startPartnerEdit(partner: AdminInvestmentPartner) {
    setPartnerForm({ id: partner.id, name: partner.name, note: partner.note ?? "" });
  }

  function startCommitmentCreate(partnerId?: string) {
    setCommitmentForm({ ...EMPTY_COMMITMENT_FORM, partnerId: partnerId ?? data?.partners[0]?.id ?? "" });
  }

  function startCommitmentEdit(commitment: AdminInvestmentCommitment) {
    setCommitmentForm({
      id: commitment.id,
      partnerId: commitment.partnerId,
      amount: String(commitment.amount),
      commitmentDate: toBusinessDateInputValue(commitment.commitmentDate),
      note: commitment.note ?? ""
    });
  }

  function startPaymentCreate(commitment?: AdminInvestmentCommitment) {
    setPaymentForm({
      ...EMPTY_PAYMENT_FORM,
      commitmentId: commitment?.id ?? paymentCommitments[0]?.id ?? "",
      branchId: data?.branches[0]?.id ?? "",
      amount: commitment ? String(commitment.unpaidAmount) : ""
    });
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

  return (
    <div className="space-y-6">
      {error ? <pre className="whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50 p-3 font-sans text-sm font-semibold text-red-700">{error}</pre> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Committed" value={formatCurrency(data?.summary.totalCommitted ?? 0)} description="Equity is based on this total." />
        <SummaryCard label="Paid" value={formatCurrency(data?.summary.totalPaid ?? 0)} description="Cash actually received." tone="positive" />
        <SummaryCard label="Unpaid" value={formatCurrency(data?.summary.totalUnpaid ?? 0)} description="Committed but not yet paid." tone="warning" />
        <SummaryCard label="Partners" value={String(data?.summary.partnerCount ?? 0)} description="No partner data is seeded." />
        <Card className="flex flex-col items-start justify-between gap-4 p-5">
          <div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Actions</p><p className="mt-3 text-sm text-pocket-navy/60">Refresh or reset forms.</p></div>
          <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void loadInvestments()}><RefreshCcw className="h-4 w-4" /></Button><Button onClick={startPartnerCreate}><Plus className="h-4 w-4" />Partner</Button></div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <div className="space-y-5">
          <Card className="p-5">
            <p className="text-lg font-black text-pocket-navy">{partnerForm.id ? "Edit Partner" : "Add Partner"}</p>
            <div className="mt-4 space-y-3">
              <Input value={partnerForm.name} onChange={(event) => setPartnerForm((current) => ({ ...current, name: event.target.value }))} placeholder="Partner name" />
              <Textarea value={partnerForm.note} onChange={(event) => setPartnerForm((current) => ({ ...current, note: event.target.value }))} placeholder="Optional note" />
              <div className="flex flex-wrap gap-2"><Button onClick={() => void savePartner()} disabled={saving}>{saving ? "Saving..." : partnerForm.id ? "Save Partner" : "Add Partner"}</Button>{partnerForm.id ? <Button variant="outline" onClick={startPartnerCreate}>Cancel</Button> : null}</div>
            </div>
          </Card>

          <Card className="p-5">
            <p className="text-lg font-black text-pocket-navy">{commitmentForm.id ? "Edit Commitment" : "Add Commitment"}</p>
            <div className="mt-4 space-y-3">
              <select value={commitmentForm.partnerId} onChange={(event) => setCommitmentForm((current) => ({ ...current, partnerId: event.target.value }))} className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm">
                <option value="">Select partner</option>
                {(data?.partners ?? []).map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}
              </select>
              <Input type="number" min="0" step="0.01" value={commitmentForm.amount} onChange={(event) => setCommitmentForm((current) => ({ ...current, amount: event.target.value }))} placeholder="Committed amount" />
              <Input type="date" value={commitmentForm.commitmentDate} onChange={(event) => setCommitmentForm((current) => ({ ...current, commitmentDate: event.target.value }))} />
              <Textarea value={commitmentForm.note} onChange={(event) => setCommitmentForm((current) => ({ ...current, note: event.target.value }))} placeholder="Optional note" />
              <div className="flex flex-wrap gap-2"><Button onClick={() => void saveCommitment()} disabled={saving}>{saving ? "Saving..." : commitmentForm.id ? "Save Commitment" : "Add Commitment"}</Button>{commitmentForm.id ? <Button variant="outline" onClick={() => startCommitmentCreate(commitmentForm.partnerId)}>Cancel</Button> : null}</div>
            </div>
          </Card>

          <Card className="p-5">
            <p className="text-lg font-black text-pocket-navy">{paymentForm.id ? "Edit Payment" : "Record Payment"}</p>
            <div className="mt-4 space-y-3">
              <select value={paymentForm.commitmentId} onChange={(event) => setPaymentForm((current) => ({ ...current, commitmentId: event.target.value }))} className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm">
                <option value="">Select commitment</option>
                {paymentCommitments.map((commitment) => <option key={commitment.id} value={commitment.id}>{commitment.partnerName} - unpaid {formatCurrency(commitment.unpaidAmount)}</option>)}
              </select>
              <select value={paymentForm.branchId} onChange={(event) => setPaymentForm((current) => ({ ...current, branchId: event.target.value }))} className="flex h-11 w-full rounded-md border border-pocket-navy/15 bg-white px-3 text-sm">
                <option value="">Select branch</option>
                {(data?.branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
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
            </div>
          </Card>
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
                <Button size="sm" variant="outline" onClick={() => startPartnerEdit(partner)}><Pencil className="h-4 w-4" />Edit</Button>
                <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => void removePartner(partner)} disabled={deletingId === partner.id}><Trash2 className="h-4 w-4" />Delete</Button>
              </div>
              {partner.commitments.length ? (
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
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, description, tone }: { label: string; value: string; description: string; tone?: "positive" | "warning" }) {
  return <Card className="p-5"><p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">{label}</p><p className={`mt-3 text-2xl font-black ${tone === "positive" ? "text-emerald-700" : tone === "warning" ? "text-amber-700" : "text-pocket-navy"}`}>{value}</p><p className="mt-2 text-sm text-pocket-navy/60">{description}</p></Card>;
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "positive" | "warning" }) {
  return <div><p className="text-xs font-semibold uppercase tracking-wide text-pocket-navy/50">{label}</p><p className={`font-black ${tone === "positive" ? "text-emerald-700" : tone === "warning" ? "text-amber-700" : "text-pocket-navy"}`}>{value}</p></div>;
}
