'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, RotateCcw } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { useSendMedia } from '@/hooks/use-messages';
import { notify } from '@/lib/notify';

interface CameraCaptureProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jid: string;
}

/**
 * Captura de foto pela webcam, estilo WhatsApp. Fluxo:
 *   getUserMedia({video}) → <video> preview ao vivo → "Capturar" desenha o frame
 *   num <canvas> → toDataURL(jpeg) → preview congelado → "Enviar" manda como
 *   imagem (useSendMedia). A stream é SEMPRE parada ao fechar/desmontar (limpa os
 *   tracks) para o LED da câmera apagar. Permissão negada cai em notify.error.
 */
export function CameraCapture({ open, onOpenChange, jid }: CameraCaptureProps) {
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Fica true só enquanto o modal está aberto. Serve de guarda contra a corrida
  // "fechou durante a aquisição da permissão": sem isso, a stream que chega
  // depois do cleanup ficaria ligada para sempre (câmera acesa à toa).
  const activeRef = useRef(false);
  const [photo, setPhoto] = useState<string | null>(null); // dataURL congelado
  const sendMedia = useSendMedia(jid);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Liga a câmera e conecta a stream ao <video>. Reusado no abrir e no "Refazer".
  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      notify.error('Câmera indisponível neste navegador');
      onOpenChange(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      // Modal fechou enquanto a permissão era resolvida: descarta a stream na
      // hora para não deixar a câmera ligada (o cleanup já rodou antes dela existir).
      if (!activeRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch {
      // Não incomoda com erro se o usuário já fechou o modal.
      if (activeRef.current) {
        notify.error('Não foi possível acessar a câmera. Verifique a permissão.');
        onOpenChange(false);
      }
    }
  }, [onOpenChange]);

  // Callback ref: assim que o <video> monta (o Modal só renderiza os filhos com
  // open=true), ligamos a stream já adquirida — resolve a corrida entre a
  // permissão e a montagem do elemento.
  const setVideo = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el && streamRef.current) {
      el.srcObject = streamRef.current;
      el.play().catch(() => {});
    }
  }, []);

  // Liga/desliga a câmera conforme o modal abre/fecha; sempre limpa os tracks.
  useEffect(() => {
    if (!open) return;
    activeRef.current = true;
    setPhoto(null);
    void startCamera();
    return () => {
      activeRef.current = false;
      stopStream();
    };
  }, [open, startCamera, stopStream]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setPhoto(canvas.toDataURL('image/jpeg', 0.9));
    // Não precisamos mais da stream depois de congelar o frame.
    stopStream();
  };

  const retake = () => {
    setPhoto(null);
    void startCamera();
  };

  const send = () => {
    if (!photo) return;
    const base64 = photo.includes(',') ? photo.split(',')[1] : photo;
    sendMedia.mutate(
      {
        mediatype: 'image',
        media: base64,
        fileName: `foto-${Date.now()}.jpg`,
        mimetype: 'image/jpeg',
      },
      {
        onSuccess: () => {
          notify.success('Foto enviada');
          onOpenChange(false);
        },
        onError: () => notify.error('Erro ao enviar foto'),
      },
    );
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Câmera">
      <div className="space-y-4">
        {/* Palco 4:3 — mostra o vídeo ao vivo ou o frame congelado. Espelhamos o
            vídeo (scaleX -1) para dar a sensação de selfie. */}
        <div
          className="relative w-full overflow-hidden rounded-panel"
          style={{ aspectRatio: '4 / 3', background: 'var(--bg-hover)' }}
        >
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              alt="Prévia da foto capturada"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <video
              ref={setVideo}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 h-full w-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
          )}
        </div>

        <div className="flex justify-end gap-2">
          {photo ? (
            <>
              <Button variant="ghost" size="sm" onClick={retake}>
                <RotateCcw size={15} />
                Refazer
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={send}
                disabled={sendMedia.isPending}
              >
                {sendMedia.isPending ? 'Enviando…' : 'Enviar'}
              </Button>
            </>
          ) : (
            <Button variant="primary" size="sm" onClick={capture}>
              <Camera size={15} />
              Capturar
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
