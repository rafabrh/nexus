import { Fragment, type ReactNode } from 'react';

/**
 * Formatação de texto estilo WhatsApp para as bolhas do chat.
 *
 * Marcadores suportados (iguais aos do WhatsApp):
 *   *texto*      → negrito
 *   _texto_      → itálico
 *   ~texto~      → tachado
 *   ```texto```  → monospace (não formata nada dentro)
 *
 * O parsing é recursivo, então aninhar funciona (`*_negrito e itálico_*`).
 * Marcadores sem par válido — um `*` solto, ou `3 * 4` com espaços — permanecem
 * literais, exatamente como no WhatsApp.
 */

/** Nó da árvore de formatação: texto puro ou um trecho com marcador. */
type FormatNode = string | { token: string; children: FormatNode[] };

interface Marker {
  /** Sequência que abre e fecha o trecho. */
  token: string;
  /** Se aplica formatação recursiva ao conteúdo interno. */
  nested: boolean;
  /** Envolve o conteúdo já renderizado no elemento correspondente. */
  wrap: (children: ReactNode, key: string) => ReactNode;
}

/** Realce sutil do monospace que funciona nas duas bolhas (clara e accent). */
const MONO_STYLE = { background: 'color-mix(in srgb, currentColor 12%, transparent)' };

/** Ordem importa: no empate de posição, o primeiro vence (monospace tem prioridade). */
const MARKERS: Marker[] = [
  {
    token: '```',
    nested: false,
    wrap: (children, key) => (
      <code
        key={key}
        className="font-mono text-[0.85em] px-1 py-0.5 rounded"
        style={MONO_STYLE}
      >
        {children}
      </code>
    ),
  },
  {
    token: '*',
    nested: true,
    wrap: (children, key) => (
      <strong key={key} className="font-semibold">
        {children}
      </strong>
    ),
  },
  {
    token: '_',
    nested: true,
    wrap: (children, key) => <em key={key}>{children}</em>,
  },
  {
    token: '~',
    nested: true,
    wrap: (children, key) => <s key={key}>{children}</s>,
  },
];

const isSpace = (ch: string | undefined): boolean => ch === undefined || /\s/.test(ch);

/**
 * Acha o primeiro par válido de um marcador em `text`.
 * Regra do WhatsApp: o caractere logo após a abertura e logo antes do fechamento
 * não podem ser espaço, e o conteúdo não pode ser vazio. Monospace (```) ignora
 * a checagem de espaço (pode conter espaços nas bordas).
 */
function findPair(text: string, marker: Marker): { open: number; close: number } | null {
  const { token } = marker;
  const len = token.length;
  const checkSpace = token !== '```';
  for (let i = 0; i + len <= text.length; i++) {
    if (text.slice(i, i + len) !== token) continue;
    if (checkSpace && isSpace(text[i + len])) continue;
    for (let j = i + len; j + len <= text.length; j++) {
      if (text.slice(j, j + len) !== token) continue;
      if (j === i + len) continue; // conteúdo vazio
      if (checkSpace && isSpace(text[j - 1])) continue;
      return { open: i, close: j };
    }
  }
  return null;
}

/** Constrói a árvore de formatação a partir do texto bruto. */
function tokenize(text: string): FormatNode[] {
  if (!text) return [];

  // Escolhe o par que começa mais cedo (menor índice de abertura).
  let chosen: { marker: Marker; open: number; close: number } | null = null;
  for (const marker of MARKERS) {
    const pair = findPair(text, marker);
    if (pair && (!chosen || pair.open < chosen.open)) {
      chosen = { marker, ...pair };
    }
  }
  if (!chosen) return [text];

  const { marker, open, close } = chosen;
  const len = marker.token.length;
  const before = text.slice(0, open);
  const inner = text.slice(open + len, close);
  const after = text.slice(close + len);

  return [
    ...(before ? [before] : []),
    { token: marker.token, children: marker.nested ? tokenize(inner) : [inner] },
    ...tokenize(after),
  ];
}

function renderNodes(nodes: FormatNode[], keyPrefix: string): ReactNode[] {
  return nodes.map((node, i) => {
    const key = `${keyPrefix}-${i}`;
    if (typeof node === 'string') return <Fragment key={key}>{node}</Fragment>;
    const marker = MARKERS.find((m) => m.token === node.token);
    if (!marker) return <Fragment key={key}>{flatten([node])}</Fragment>;
    return marker.wrap(renderNodes(node.children, key), key);
  });
}

/** Achata a árvore de volta em texto puro (sem os marcadores). */
function flatten(nodes: FormatNode[]): string {
  return nodes.map((n) => (typeof n === 'string' ? n : flatten(n.children))).join('');
}

/** Renderiza o texto com a formatação do WhatsApp aplicada. */
export function renderRichText(text: string): ReactNode {
  return <>{renderNodes(tokenize(text), 'rt')}</>;
}

/** Remove os marcadores de formatação, devolvendo texto puro (para previews). */
export function stripFormatting(text: string): string {
  if (!text) return text;
  return flatten(tokenize(text));
}
