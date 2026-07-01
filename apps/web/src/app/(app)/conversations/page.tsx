'use client';

import { useEffect } from 'react';
import { MessageCircle } from 'lucide-react';
import { Sidebar } from '@/components/layout/sidebar';
import { DetailPanel } from '@/components/layout/detail-panel';
import { ChatHeader } from '@/components/chat/chat-header';
import { ChatAmbience } from '@/components/chat/chat-ambience';
import { MessageList } from '@/components/chat/message-list';
import { MessageInput } from '@/components/chat/message-input';
import { useConversationStore } from '@/stores/conversation.store';
import { useUiStore } from '@/stores/ui.store';
import { useConversations, useMarkRead } from '@/hooks/use-conversations';
import { useSocket } from '@/hooks/use-socket';
import { cn } from '@/lib/utils';

function EmptyChat() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
      <div className="w-16 h-16 rounded-full bg-bg-elevated flex items-center justify-center mb-4">
        <MessageCircle size={24} className="text-text-muted" />
      </div>
      <h3 className="text-md font-medium text-text-secondary mb-1">
        Selecione uma conversa
      </h3>
      <p className="text-sm text-text-muted max-w-xs">
        Escolha uma conversa na barra lateral para visualizar as mensagens
      </p>
    </div>
  );
}

export default function ConversationsPage() {
  const selectedJid = useConversationStore((s) => s.selectedJid);
  const detailPanelOpen = useUiStore((s) => s.detailPanelOpen);
  const { data: conversations } = useConversations();
  const { joinConversation, leaveConversation } = useSocket();
  const { mutate: markRead } = useMarkRead();

  // Join/leave socket rooms when conversation changes
  useEffect(() => {
    if (selectedJid) {
      joinConversation(selectedJid);
      return () => {
        leaveConversation(selectedJid);
      };
    }
  }, [selectedJid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Marca a conversa aberta como lida: ao abrir e sempre que uma nova mensagem
  // chega com ela em foco (o webhook incrementa o unread → o refetch traz o
  // count > 0 → aqui zeramos de volta). O update otimista do markRead evita loop.
  const openUnread =
    conversations?.find((c) => c.jid === selectedJid)?.unreadCount ?? 0;
  useEffect(() => {
    if (selectedJid && openUnread > 0) {
      markRead(selectedJid);
    }
  }, [selectedJid, openUnread, markRead]);

  const selectedConversation = conversations?.find(
    (c) => c.jid === selectedJid,
  );

  return (
    <div className="flex h-[calc(100vh-48px)]">
      {/* Sidebar — 320px */}
      <Sidebar />

      {/* Chat area — interactive mirror backdrop behind the content */}
      <div
        className={cn(
          'relative flex-1 ml-80 flex flex-col transition-all duration-200',
          detailPanelOpen && 'mr-[380px]',
        )}
      >
        <ChatAmbience />
        <div className="relative z-[1] flex flex-col flex-1 min-h-0">
          {selectedConversation ? (
            <>
              <ChatHeader conversation={selectedConversation} />
              <MessageList jid={selectedJid!} />
              <MessageInput
                jid={selectedJid!}
                aiState={selectedConversation.aiState}
              />
            </>
          ) : (
            <EmptyChat />
          )}
        </div>
      </div>

      {/* Detail Panel — 380px */}
      {selectedJid && <DetailPanel jid={selectedJid} />}
    </div>
  );
}
