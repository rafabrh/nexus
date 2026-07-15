'use client';

import { useState } from 'react';
import { MapPin, LocateFixed } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useSendLocation } from '@/hooks/use-messages';
import { notify } from '@/lib/notify';

interface LocationShareProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jid: string;
}

/**
 * Compartilhamento de localização. Caminho primário: "Enviar localização atual"
 * via navigator.geolocation. Alternativa: inserir lat/long (e nome/endereço)
 * manualmente. Erros/negação de permissão caem em notify.error.
 */
export function LocationShare({ open, onOpenChange, jid }: LocationShareProps) {
  const sendLocation = useSendLocation(jid);
  const [locating, setLocating] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');

  const reset = () => {
    setName('');
    setAddress('');
    setLat('');
    setLng('');
    setLocating(false);
  };

  const doSend = (payload: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  }) => {
    sendLocation.mutate(payload, {
      onSuccess: () => {
        notify.success('Localização enviada');
        reset();
        onOpenChange(false);
      },
      onError: () => notify.error('Erro ao enviar localização'),
    });
  };

  const sendCurrent = () => {
    if (!navigator.geolocation) {
      notify.error('Geolocalização indisponível neste navegador');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        doSend({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          name: name.trim() || undefined,
          address: address.trim() || undefined,
        });
      },
      () => {
        setLocating(false);
        notify.error('Não foi possível obter a localização. Verifique a permissão.');
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const sendManual = () => {
    const latitude = Number(lat.replace(',', '.'));
    const longitude = Number(lng.replace(',', '.'));
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      notify.error('Latitude e longitude inválidas');
      return;
    }
    doSend({
      latitude,
      longitude,
      name: name.trim() || undefined,
      address: address.trim() || undefined,
    });
  };

  const manualReady = lat.trim() !== '' && lng.trim() !== '';
  const busy = sendLocation.isPending || locating;

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      title="Enviar localização"
    >
      <div className="space-y-4">
        {/* Ação primária: localização atual */}
        <Button
          variant="primary"
          size="md"
          onClick={sendCurrent}
          disabled={busy}
          className="w-full"
        >
          <LocateFixed size={16} />
          {locating ? 'Localizando…' : 'Enviar localização atual'}
        </Button>

        {/* Separador "ou" */}
        <div className="flex items-center gap-3">
          <span className="h-px flex-1" style={{ background: 'var(--separator)' }} />
          <span className="text-xs text-text-muted">ou informe manualmente</span>
          <span className="h-px flex-1" style={{ background: 'var(--separator)' }} />
        </div>

        {/* Alternativa manual */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs text-text-muted">Latitude</label>
              <Input
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="-23.5505"
                inputMode="decimal"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-text-muted">Longitude</label>
              <Input
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="-46.6333"
                inputMode="decimal"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-text-muted">
              Nome do local (opcional)
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Escritório"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-text-muted">
              Endereço (opcional)
            </label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Rua, número, cidade"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={sendManual}
            disabled={!manualReady || busy}
          >
            <MapPin size={15} />
            {sendLocation.isPending ? 'Enviando…' : 'Enviar coordenadas'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
