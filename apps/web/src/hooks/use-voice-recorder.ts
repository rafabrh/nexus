'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface RecordedAudio {
  base64: string;
  mimetype: string;
}

interface VoiceRecorder {
  isRecording: boolean;
  seconds: number;
  supported: boolean;
  start: () => Promise<boolean>;
  cancel: () => void;
  stop: () => Promise<RecordedAudio | null>;
}

/** MIME types de gravação preferidos, em ordem (Chrome/Firefox → Safari). */
const PREFERRED_MIME = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return PREFERRED_MIME.find((t) => MediaRecorder.isTypeSupported(t));
}

/** Blob → base64 puro (sem o prefixo `data:`). */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = reader.result as string;
      resolve(s.includes(',') ? s.split(',')[1] : s);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Gravador de nota de voz via MediaRecorder. `start` pede permissão do microfone;
 * `stop` devolve o áudio em base64 + mimetype; `cancel` descarta. Um timer conta os
 * segundos. Encerra as tracks do microfone ao parar/cancelar (some o indicador de
 * gravação do navegador) e no unmount.
 */
export function useVoiceRecorder(): VoiceRecorder {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const supported =
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined';

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    setIsRecording(false);
    setSeconds(0);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async (): Promise<boolean> => {
    if (!supported || isRecording) return false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorderRef.current = rec;
      rec.start();
      setIsRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      return true;
    } catch {
      cleanup();
      return false;
    }
  }, [supported, isRecording, cleanup]);

  const cancel = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop();
      } catch {
        /* ignora */
      }
    }
    cleanup();
  }, [cleanup]);

  const stop = useCallback((): Promise<RecordedAudio | null> => {
    const rec = recorderRef.current;
    if (!rec || rec.state === 'inactive') {
      cleanup();
      return Promise.resolve(null);
    }
    return new Promise<RecordedAudio | null>((resolve) => {
      rec.onstop = async () => {
        const mimetype = rec.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimetype });
        cleanup();
        if (blob.size === 0) {
          resolve(null);
          return;
        }
        try {
          resolve({ base64: await blobToBase64(blob), mimetype });
        } catch {
          resolve(null);
        }
      };
      try {
        rec.stop();
      } catch {
        cleanup();
        resolve(null);
      }
    });
  }, [cleanup]);

  return { isRecording, seconds, supported, start, cancel, stop };
}
