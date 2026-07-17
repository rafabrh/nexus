# Respostas rápidas com imagem/vídeo em disco persistente — Design

**Data:** 2026-07-15
**Status:** Aprovado (design) — pendente spec review + plano de implementação
**Escopo:** apps/api (NestJS) + apps/web (Next.js) + packages/shared

---

## 1. Problema

A feature atual de "imagem na resposta rápida" (commit `86cb8a1`) tem dois furos:

1. **Painel descarta a mídia.** Ao usar uma resposta rápida pelo painel de detalhes
   (`detail-panel.tsx:767`), só o texto (`insertIntoComposer(qr.content)`) é inserido;
   a imagem salva no template é ignorada. O envio direto com imagem só funciona pelo
   dropdown do composer (`message-input.tsx:162`). Dois fluxos divergentes — a feature
   parece quebrada quando usada pelo painel.
2. **Vídeo não é suportado** e a imagem é guardada como **base64 numa coluna `text` do
   Postgres**, o que não escala: vídeo (50 MB+) inflaria ~33% em base64, tornaria cada
   `SELECT` de template caríssimo e estouraria o limite de linha. Em escala 500 tenants
   isso vira gargalo de memória/I/O.

## 2. Objetivo

Respostas rápidas podem anexar **imagem ou vídeo**. O binário fica em **disco
persistente** (organizado por tenant); o Postgres guarda **apenas a referência**. Usar
uma resposta rápida com mídia — pelo painel **ou** pelo dropdown — **envia a mídia** junto
do texto (caption).

### Não-objetivos (YAGNI)
- Object storage gerenciado (R2/S3/MinIO). Decisão explícita: sem serviço contratado.
  A abstração `MediaStorage` deixa essa migração para depois, localizada num adapter.
- Transcodificação/compressão de vídeo. Enviamos o arquivo como está.
- Migração de dados: a feature não foi para produção; não há respostas rápidas com mídia
  reais. Recomeço limpo (substitui as colunas `image`/`imageMimetype`).

## 3. Restrições conhecidas

- **WhatsApp:** vídeo nativo (tocável inline) só até **~16 MB**. Acima disso a Evolution
  entrega como **documento** (baixa em vez de tocar). Limite do WhatsApp, não do storage.
- **Deploy:** EasyPanel single-node. O volume de disco é preso a um nó — sem escala
  horizontal. Documentado; aceitável para o estágio atual.
- **Teto de upload:** 64 MB por arquivo (`QR_MEDIA_MAX_BYTES`).

## 4. Modelo de dados

Substitui as colunas `image`/`imageMimetype` da tabela `quick_replies` por referência:

| coluna | tipo | uso |
|---|---|---|
| `media_id` | text (uuid) | nome do arquivo no disco; `null` = sem mídia |
| `media_type` | text | `image` \| `video` |
| `media_mimetype` | text | ex. `video/mp4`, `image/jpeg` |
| `media_filename` | text | nome original (naming de documento no fallback) |
| `media_size` | integer | bytes — decide vídeo-vs-documento no envio |

Regra de integridade: `media_id` presente ⇒ `media_type`, `media_mimetype`, `media_size`
presentes (par indissociável, validado no service). Migration nova (`0003`) que
dropa `image`/`imageMimetype` e adiciona as cinco colunas acima. Ajustar snapshot +
`_journal.json`.

Tipo compartilhado (`packages/shared/src/types/quick-reply.ts`):
```ts
export interface QuickReply {
  id: string;
  name: string;
  content: string;
  shortcut?: string;
  media?: {
    id: string;
    type: 'image' | 'video';
    mimetype: string;
    filename: string;
    size: number;
  };
}
```

## 5. Abstração de storage

Interface isola o backend (disco hoje, object storage depois):

```ts
interface StoredMedia { id: string; mimetype: string; size: number; filename: string; }

interface MediaStorage {
  put(instancia: string, stream: Readable, meta: { mimetype: string; filename: string }): Promise<StoredMedia>;
  createReadStream(instancia: string, mediaId: string): Readable;   // serve/preview
  stat(instancia: string, mediaId: string): Promise<{ size: number } | null>;
  delete(instancia: string, mediaId: string): Promise<void>;
  exists(instancia: string, mediaId: string): Promise<boolean>;
}
```

`DiskMediaStorage` implementa via `fs`:
- Raiz: `MEDIA_ROOT` (mount do volume persistente).
- Caminho: `{MEDIA_ROOT}/{instancia}/quick-replies/{mediaId}` — **isolado por tenant**.
- `mediaId` = `randomUUID()`; o nome original vai só na coluna `media_filename`.
- Blindagem de path traversal: `mediaId` validado contra `^[0-9a-f-]{36}$`; `instancia`
  já é o slug do tenant (sem separadores de path).

Registrado num `MediaModule` (provider por token `MEDIA_STORAGE`), injetável onde precisar.

## 6. Fluxos

### 6.1 Upload (criar/editar template)
1. Front escolhe arquivo → **sobe primeiro** via `POST /quick-replies/media`
   (multipart, `multer` em modo streaming pro disco, `@Roles('admin')`, tenant do JWT).
   Valida `image/*`|`video/*` e teto de 64 MB (limite do multer + checagem de mimetype).
   Retorna `{ mediaId, mediaType, mimetype, filename, size }`.
2. Front guarda a referência no estado do formulário e mostra preview
   (imagem: `<img>` via rota de serve; vídeo: `<video>` ou ícone).
3. Ao salvar, o `create`/`update` recebe os **campos-ref** (`mediaId`, `mediaType`,
   `mediaMimetype`, `mediaFilename`, `mediaSize`) — **nunca base64**.
4. O service valida que `mediaId` **existe no disco sob o diretório do tenant** antes de
   gravar a linha (rejeita referência forjada/cross-tenant).

### 6.2 Servir (preview no painel/dropdown)
- `GET /quick-replies/media/:mediaId` — JWT, tenant-scoped, `createReadStream` do disco
  com `Content-Type` = `media_mimetype`. Usado nas miniaturas. (A rota resolve o mimetype
  via lookup do template dono do `mediaId`, ou via `stat`; ver §8.)

### 6.3 Enviar (usar a resposta rápida)
Endpoint dedicado: `POST /conversations/:jid/send-quick-reply/:qrId` (JWT, tenant-scoped).
O **servidor** resolve `qrId` → linha → arquivo no disco e repassa à Evolution:
- Gera **URL assinada** (HMAC-SHA256 com `MEDIA_SIGN_SECRET`, TTL curto ~5 min) apontando
  para uma rota pública tokenizada `GET /public/qr-media/:mediaId?exp=…&sig=…`, que a
  Evolution busca. Evita carregar 50 MB na memória da API e trafegar o binário pelo browser.
- A rota pública **não usa JWT**; autoriza só pela assinatura válida + não-expirada +
  `mediaId` casando com a assinatura. Escopo mínimo: serve um `mediaId` específico por um
  tempo curto.
- **Decisão vídeo-vs-documento:** `mediaType='video'` e `mediaSize > 16 MB` ⇒ envia à
  Evolution como `mediatype='document'` (com `fileName=media_filename`); senão, como
  `video`/`image`. Caption = `content` do template.
- Reaproveita a persistência de mídia enviada no chathistory (mesmo padrão de
  `sendMediaMessage`) e o human-takeover (pausa IA 30 min).

### 6.4 Correção do painel
`DetailPanel` passa a: se a resposta rápida clicada **tem mídia**, chama
`send-quick-reply` (envio direto, igual ao dropdown); **sem mídia**, mantém o
`insertIntoComposer(qr.content)` atual. O dropdown do composer usa o mesmo endpoint,
eliminando o caminho antigo de base64 no `handleQuickReply`.

## 7. Configuração (env)

| var | descrição | default |
|---|---|---|
| `MEDIA_ROOT` | mount do volume persistente | `/data/media` |
| `QR_MEDIA_MAX_BYTES` | teto de upload | `67108864` (64 MB) |
| `MEDIA_SIGN_SECRET` | segredo HMAC das URLs assinadas | (obrigatório em prod) |

## 8. Erros e ciclo de vida

- **Upload inválido:** tipo fora de `image/*`|`video/*` → 415; acima do teto → 413.
- **Referência forjada:** `create`/`update` com `mediaId` inexistente sob o tenant → 400.
- **Deletar resposta rápida** → apaga o arquivo do disco (best-effort; falha logada, não
  bloqueia a remoção da linha).
- **Trocar mídia** num update → apaga o arquivo antigo após gravar a nova referência.
- **Órfãos** (upload sem template criado): sweep periódico que remove arquivos sob
  `quick-replies/` sem `media_id` correspondente, com idade > TTL (ex. 24 h). Job simples
  no boot/cron; fora do caminho crítico.
- **Serve com mimetype:** a rota de preview resolve o mimetype pela linha dona do
  `mediaId` (query por `media_id`); se não achar, 404 (evita servir órfão).

## 9. Testes

- `DiskMediaStorage`: put→exists→stat→createReadStream→delete; rejeição de path traversal;
  isolamento por tenant (um tenant não lê `mediaId` de outro).
- Upload endpoint: aceita imagem/vídeo, rejeita tipo/tamanho inválidos, grava sob o
  diretório do tenant.
- `QuickRepliesService`: create/update valida existência do `mediaId`; delete/troca apaga
  arquivo; serialização do bloco `media` no DTO.
- Envio: decisão vídeo-vs-documento por `mediaSize`; geração e verificação da URL assinada
  (assinatura válida/ inválida/ expirada); caption = content.
- Painel: resposta rápida com mídia dispara send-quick-reply; sem mídia, insere no composer.

## 10. Escala e evolução

- Volume single-node é o gargalo conhecido; aceitável no estágio atual (EasyPanel).
- Migração futura para object storage (MinIO/R2/S3) troca **apenas** o adapter de
  `MediaStorage` + a geração da URL assinada (presigned URL nativa). Nenhum consumidor
  muda.
- A rota pública assinada já modela o contrato que a Evolution espera (fetch por URL),
  então a troca para presigned URL é drop-in.

## 11. Arquivos afetados (estimativa)

**API**
- `core/db/schema.ts` — troca colunas de `quick_replies`
- `drizzle/0003_*.sql` + snapshot + `_journal.json` — migration
- `media/media.module.ts`, `media/disk-media.storage.ts`, `media/media-storage.interface.ts` — novo
- `quick-replies/quick-replies.controller.ts` — upload + serve + ajuste dos DTOs
- `quick-replies/quick-replies.service.ts` — validação de ref, ciclo de vida do arquivo
- `quick-replies/dto/*` — troca `image` por campos-ref
- `conversation/conversation.controller.ts` + `conversation.service.ts` — `send-quick-reply`
- `conversation/public-media.controller.ts` — rota pública assinada (novo)
- specs correspondentes

**Web**
- `hooks/use-quick-replies.ts` — upload + referência (sem base64)
- `components/layout/detail-panel.tsx` — upload de imagem/vídeo, preview, envio direto
- `components/chat/message-input.tsx` — dropdown usa `send-quick-reply`

**Shared**
- `types/quick-reply.ts` — bloco `media`
```
