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
