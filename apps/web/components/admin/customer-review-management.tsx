"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, EyeOff, RefreshCcw, Star, Trash2 } from "lucide-react";
import { AdminToast } from "@/components/admin/admin-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  deleteAdminCustomerReview,
  fetchAdminCustomerReviews,
  updateAdminCustomerReview
} from "@/lib/admin-client";
import type { CustomerReview } from "@/lib/types";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-PK", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function CustomerReviewManagement() {
  const [reviews, setReviews] = useState<CustomerReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadReviews = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setReviews(await fetchAdminCustomerReviews());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load customer reviews.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  async function setApproval(review: CustomerReview, isApproved: boolean) {
    setBusyId(review.id);
    setError("");
    try {
      const updated = await updateAdminCustomerReview(review.id, isApproved);
      setReviews((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
      setNotice(isApproved ? "Review approved and now visible on the homepage." : "Review hidden from the homepage.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update this review.");
    } finally {
      setBusyId(null);
    }
  }

  async function removeReview(review: CustomerReview) {
    if (!window.confirm(`Remove ${review.authorName}'s review permanently?`)) return;

    setBusyId(review.id);
    setError("");
    try {
      await deleteAdminCustomerReview(review.id);
      setReviews((current) => current.filter((entry) => entry.id !== review.id));
      setNotice("Review removed.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not remove this review.");
    } finally {
      setBusyId(null);
    }
  }

  const pendingCount = reviews.filter((review) => !review.isApproved).length;

  return (
    <Card className="p-5 sm:p-6">
      {notice ? <AdminToast message={notice} variant="success" onClose={() => setNotice("")} className="top-4" /> : null}
      {error ? <AdminToast message={error} variant="error" onClose={() => setError("")} className="top-20" /> : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-pocket-orange">Customer feedback</p>
          <h2 className="mt-1 text-2xl font-black text-pocket-navy">Review moderation</h2>
          <p className="mt-2 text-sm text-pocket-navy/65">Approve the reviews that should be displayed in the public testimonials section.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-amber-100 px-3 py-1.5 text-sm font-bold text-amber-800">{pendingCount} pending</span>
          <Button variant="outline" onClick={() => void loadReviews()} disabled={loading}>
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {loading ? <p className="py-6 text-sm text-pocket-navy/60">Loading reviews...</p> : null}
        {!loading && reviews.length === 0 ? <p className="rounded-xl border border-dashed border-pocket-navy/15 p-5 text-sm text-pocket-navy/60">No customer reviews have been submitted yet.</p> : null}
        {reviews.map((review) => {
          const busy = busyId === review.id;
          return (
            <article key={review.id} className="rounded-xl border border-pocket-navy/10 bg-pocket-cream/40 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-pocket-navy">{review.authorName}</p>
                    <span className={review.isApproved ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800" : "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800"}>
                      {review.isApproved ? "Visible" : "Pending"}
                    </span>
                    <span className="flex gap-0.5 text-pocket-orange" aria-label={`${review.rating} out of 5 stars`}>
                      {Array.from({ length: 5 }, (_, index) => <Star key={index} className={`h-3.5 w-3.5 ${index < review.rating ? "fill-current" : "text-pocket-navy/15"}`} />)}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-pocket-navy/75">{review.body}</p>
                  <p className="mt-2 text-xs text-pocket-navy/50">Submitted {formatDate(review.createdAt)}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {review.isApproved ? (
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => void setApproval(review, false)}>
                      <EyeOff className="h-4 w-4" />
                      Hide
                    </Button>
                  ) : (
                    <Button size="sm" disabled={busy} onClick={() => void setApproval(review, true)}>
                      <Check className="h-4 w-4" />
                      Approve
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 hover:text-red-700" disabled={busy} onClick={() => void removeReview(review)}>
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </Button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </Card>
  );
}
