"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSelectedBranchId } from "@/lib/branch-selection";

const ALERTS_PREFERENCE_KEY = "pocket.delivery-alerts-enabled";

type AlarmNodes = {
  ringtone: AudioBufferSourceNode;
  output: GainNode;
};

type PosDeliveryAlertOptions = {
  enabled: boolean;
  hasPendingDelivery: boolean;
  onDeliveryEvent: () => void;
};

export type PosDeliverySoundStatus = "enabled" | "muted" | "blocked";

function createRingtoneBuffer(context: AudioContext) {
  const duration = 2;
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
  const samples = buffer.getChannelData(0);
  const notes = [
    { start: 0, duration: 0.18, frequency: 440 },
    { start: 0.28, duration: 0.18, frequency: 554.37 },
    { start: 0.58, duration: 0.3, frequency: 659.25 }
  ];

  for (const note of notes) {
    const startIndex = Math.floor(note.start * context.sampleRate);
    const endIndex = Math.min(samples.length, Math.ceil((note.start + note.duration) * context.sampleRate));
    for (let index = startIndex; index < endIndex; index += 1) {
      const elapsed = index / context.sampleRate - note.start;
      const attack = Math.min(1, elapsed / 0.018);
      const release = Math.min(1, (note.duration - elapsed) / 0.06);
      const envelope = attack * release * 0.22;
      const wave = Math.sin(2 * Math.PI * note.frequency * elapsed) + 0.12 * Math.sin(4 * Math.PI * note.frequency * elapsed);
      samples[index] = (samples[index] ?? 0) + wave * envelope;
    }
  }

  return buffer;
}

export function usePosDeliveryAlert({ enabled, hasPendingDelivery, onDeliveryEvent }: PosDeliveryAlertOptions) {
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [audioRunning, setAudioRunning] = useState(false);
  const [branchId, setBranchId] = useState("");
  const audioContextRef = useRef<AudioContext | null>(null);
  const alarmNodesRef = useRef<AlarmNodes | null>(null);
  const onDeliveryEventRef = useRef(onDeliveryEvent);

  useEffect(() => {
    onDeliveryEventRef.current = onDeliveryEvent;
  }, [onDeliveryEvent]);

  useEffect(() => {
    setAlertsEnabled(window.localStorage.getItem(ALERTS_PREFERENCE_KEY) !== "false");
    setBranchId(getSelectedBranchId());

    const handleBranchChange = (event: Event) => {
      const nextBranchId = (event as CustomEvent<{ branchId?: string }>).detail?.branchId ?? "";
      setBranchId(nextBranchId);
    };

    window.addEventListener("pocket:branch-changed", handleBranchChange);
    return () => window.removeEventListener("pocket:branch-changed", handleBranchChange);
  }, []);

  const stopAlarm = useCallback(() => {
    const alarm = alarmNodesRef.current;
    if (!alarm) return;

    try {
      alarm.ringtone.stop();
    } catch {
      // The source may already have ended during cleanup.
    }
    alarm.ringtone.disconnect();
    alarm.output.disconnect();
    alarmNodesRef.current = null;
  }, []);

  const startAlarm = useCallback(() => {
    const context = audioContextRef.current;
    if (!context || context.state !== "running" || alarmNodesRef.current) return;

    const ringtone = context.createBufferSource();
    const output = context.createGain();
    ringtone.buffer = createRingtoneBuffer(context);
    ringtone.loop = true;
    output.gain.value = 0.45;
    ringtone.connect(output);
    output.connect(context.destination);
    ringtone.start();
    alarmNodesRef.current = { ringtone, output };
  }, []);

  const activateSound = useCallback(async () => {
    try {
      const AudioContextConstructor = window.AudioContext;
      if (!AudioContextConstructor) return false;

      const context = audioContextRef.current ?? new AudioContextConstructor();
      audioContextRef.current = context;
      await context.resume();
      const running = context.state === "running";
      setAudioRunning(running);
      return running;
    } catch {
      setAudioRunning(false);
      return false;
    }
  }, []);

  const toggleSound = useCallback(() => {
    if (alertsEnabled && !audioRunning) {
      void activateSound();
      return;
    }

    if (alertsEnabled) {
      window.localStorage.setItem(ALERTS_PREFERENCE_KEY, "false");
      setAlertsEnabled(false);
      stopAlarm();
      return;
    }

    window.localStorage.setItem(ALERTS_PREFERENCE_KEY, "true");
    setAlertsEnabled(true);
    void activateSound();
  }, [activateSound, alertsEnabled, audioRunning, stopAlarm]);

  useEffect(() => {
    if (!alertsEnabled || audioRunning) return;

    const unlock = () => {
      void activateSound();
    };

    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, [activateSound, alertsEnabled, audioRunning]);

  useEffect(() => {
    if (!enabled || !alertsEnabled || !audioRunning || !hasPendingDelivery) {
      stopAlarm();
      return;
    }

    startAlarm();
  }, [alertsEnabled, audioRunning, enabled, hasPendingDelivery, startAlarm, stopAlarm]);

  useEffect(() => {
    if (!enabled) return;

    const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
    const events = new EventSource(`/api/ops/delivery-events${query}`, { withCredentials: true });
    const handleDeliveryEvent = () => onDeliveryEventRef.current();
    events.addEventListener("delivery-order", handleDeliveryEvent);

    return () => {
      events.removeEventListener("delivery-order", handleDeliveryEvent);
      events.close();
    };
  }, [branchId, enabled]);

  useEffect(() => {
    return () => {
      stopAlarm();
      void audioContextRef.current?.close();
      audioContextRef.current = null;
    };
  }, [stopAlarm]);

  const soundStatus: PosDeliverySoundStatus = !alertsEnabled
    ? "muted"
    : audioRunning
      ? "enabled"
      : "blocked";

  return { soundStatus, toggleSound };
}
