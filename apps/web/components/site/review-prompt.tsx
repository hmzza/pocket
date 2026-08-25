"use client";

import { useState, type FormEvent } from "react";
import { MessageSquareHeart, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function ReviewPrompt() {
  const [open, setOpen] = useState(false);
  const [authorName, setAuthorName] = useState("");
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorName, rating, body })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message ?? "Could not submit your review.");
      setNotice(payload.message ?? "Thanks for sharing your experience.");
      setAuthorName("");
      setRating(5);
      setBody("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not submit your review.");
    } finally {
      setSubmitting(false);
    }
  }

  function close() {
    setOpen(false);
    setError("");
    setNotice("");
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <MessageSquareHeart className="h-4 w-4" />
        Leave a review
      </Button>

      {open ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-pocket-navy/65 p-4" role="dialog" aria-modal="true" aria-labelledby="review-dialog-title">
          <Card className="w-full max-w-lg p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Pocket feedback</p>
                <h2 id="review-dialog-title" className="mt-1 text-2xl font-black text-pocket-navy">How was your experience?</h2>
                <p className="mt-2 text-sm text-pocket-navy/65">Your review is checked by Pocket before it appears on the website.</p>
              </div>
              <Button type="button" variant="ghost" onClick={close}>Close</Button>
            </div>

            {notice ? (
              <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
                {notice}
              </div>
            ) : (
              <form className="mt-5 space-y-4" onSubmit={(event) => void submitReview(event)}>
                <label className="block space-y-1.5 text-sm font-semibold text-pocket-navy">
                  <span>Your name</span>
                  <Input value={authorName} onChange={(event) => setAuthorName(event.target.value)} maxLength={80} placeholder="Your name" required />
                </label>
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold text-pocket-navy">Your rating</p>
                  <div className="flex items-center gap-1" aria-label={`${rating} out of 5 stars`}>
                    {Array.from({ length: 5 }, (_, index) => {
                      const value = index + 1;
                      return <button key={value} type="button" onClick={() => setRating(value)} className="rounded p-1 text-pocket-orange transition hover:scale-110" aria-label={`Rate ${value} star${value === 1 ? "" : "s"}`}><Star className={`h-7 w-7 ${value <= rating ? "fill-current" : "text-pocket-navy/20"}`} /></button>;
                    })}
                  </div>
                </div>
                <label className="block space-y-1.5 text-sm font-semibold text-pocket-navy">
                  <span>Your review</span>
                  <Textarea value={body} onChange={(event) => setBody(event.target.value)} minLength={10} maxLength={600} placeholder="Tell us what you enjoyed or how we can improve." required />
                </label>
                {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
                <Button className="w-full" type="submit" disabled={submitting}>{submitting ? "Sending..." : "Submit review"}</Button>
              </form>
            )}
          </Card>
        </div>
      ) : null}
    </>
  );
}
