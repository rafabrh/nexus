export interface QuickReply {
  id: string;
  name: string;
  content: string;
  shortcut?: string;
  /** Imagem opcional do template: base64 puro (sem prefixo data:). */
  image?: string;
  /** Mimetype da imagem (ex.: image/jpeg). Presente sempre que `image` estiver. */
  imageMimetype?: string;
}
