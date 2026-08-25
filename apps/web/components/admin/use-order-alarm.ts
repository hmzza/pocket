"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "pocket-order-alarm-muted";

/**
 * Repeating audible alert for orders waiting to be accepted.
 *
 * The tone is synthesised with Web Audio rather than played from a file, so there
 * is no asset to ship, nothing to 404, and it works with no network.
 *
 * Browsers refuse to start audio until the user has interacted with the page, so
 * this cannot simply play on load. It reports `needsArming` when a play attempt
 * was blocked, and the caller shows a button; one click both unlocks audio and
 * proves someone is at the screen.
 */
export function useOrderAlarm(pendingCount: number, intervalMs = 8000) {
  const [muted, setMuted] = useState(false);
  const [needsArming, setNeedsArming] = useState(false);
  const contextRef = useRef<AudioContext | null>(null);
  // Read inside the interval without making it a dependency, so the timer is not
  // torn down and rebuilt on every count change.
  const pendingRef = useRef(pendingCount);
  pendingRef.current = pendingCount;

  useEffect(() => {
    setMuted(window.localStorage.getItem(STORAGE_KEY) === "true");
  }, []);

  const playTone = useCallback(async () => {
    try {
      type AudioContextCtor = typeof AudioContext;
      const Ctor: AudioContextCtor | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
      if (!Ctor) return;

      contextRef.current ??= new Ctor();
      const context = contextRef.current;

      // Created suspended when the page has not been interacted with yet.
      if (context.state === "suspended") {
        await context.resume();
      }
      if (context.state !== "running") {
        setNeedsArming(true);
        return;
      }

      setNeedsArming(false);

      // Two short rising beeps: distinct enough to notice across a kitchen,
      // short enough not to be maddening every few seconds.
      const now = context.currentTime;
      [0, 0.22].forEach((offset, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = index === 0 ? 880 : 1170;
        // Ramped rather than switched, because an instant cut clicks.
        gain.gain.setValueAtTime(0, now + offset);
        gain.gain.linearRampToValueAtTime(0.32, now + offset + 0.02);
        gain.gain.linearRampToValueAtTime(0, now + offset + 0.18);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(now + offset);
        oscillator.stop(now + offset + 0.2);
      });
    } catch {
      setNeedsArming(true);
    }
  }, []);

  useEffect(() => {
    if (muted || pendingCount === 0) return;

    // Sound immediately on the first pending order, then keep nagging until it
    // is dealt with. That repetition is the point: a single chime is missed.
    void playTone();
    const timer = window.setInterval(() => {
      if (pendingRef.current > 0) void playTone();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [muted, pendingCount > 0, intervalMs, playTone]);

  const toggleMuted = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      window.localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  /** Called from a real click, which is what lets audio start at all. */
  const arm = useCallback(() => {
    setNeedsArming(false);
    void playTone();
  }, [playTone]);

  return { muted, toggleMuted, needsArming, arm, alarmActive: !muted && pendingCount > 0 };
}
