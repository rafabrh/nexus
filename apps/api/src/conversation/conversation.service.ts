import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import type {
  ConversationListItem,
  ConversationDetail,
  Message,
} from '@nexus/shared';
import { ConversationRepository } from './conversation.repository';
import { EvolutionClient } from '../whatsapp/evolution.client';

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(
    private readonly repo: ConversationRepository,
    private readonly evolution: EvolutionClient,
  ) {}

  async listConversations(
    instancia: string,
    filters: { stage?: string; search?: string; aiState?: string },
  ): Promise<ConversationListItem[]> {
    // 1. Scan Redis for all JIDs with followup_step
    const jids = await this.repo.findAllJids(instancia);

    // 2. Build ConversationListItem for each JID in parallel
    const conversations = await Promise.all(
      jids.map((jid) => this.repo.buildListItem(instancia, jid)),
    );

    // 3. Apply filters
    let result = conversations;

    if (filters.stage) {
      result = result.filter((c) => c.stage === filters.stage);
    }

    if (filters.aiState) {
      result = result.filter((c) => c.aiState === filters.aiState);
    }

    if (filters.search) {
      const term = filters.search.toLowerCase();
      result = result.filter(
        (c) =>
          c.contactName?.toLowerCase().includes(term) ||
          c.jid.toLowerCase().includes(term),
      );
    }

    // 4. Sort by lastActivity descending
    return result.sort(
      (a, b) =>
        new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime(),
    );
  }

  async getConversationDetail(instancia: string, jid: string): Promise<ConversationDetail> {
    const detail = await this.repo.buildDetail(instancia, jid);
    if (!detail) {
      throw new NotFoundException(`Conversa ${jid} nao encontrada`);
    }
    return detail;
  }

  async getMessages(instancia: string, jid: string, limit: number): Promise<Message[]> {
    return this.repo.getMessages(instancia, jid, limit);
  }

  async addNote(instancia: string, jid: string, text: string, userEmail: string): Promise<{ message: string }> {
    await this.repo.appendNote(instancia, jid, text);
    this.logger.log(`Note added by ${userEmail} for ${instancia}/${jid}`);
    return { message: 'Nota adicionada' };
  }

  async removeNote(instancia: string, jid: string, index: number): Promise<{ message: string }> {
    await this.repo.removeNote(instancia, jid, index);
    return { message: 'Nota removida' };
  }

  async addTag(instancia: string, jid: string, tag: string): Promise<{ message: string }> {
    await this.repo.addTag(instancia, jid, tag);
    return { message: 'Tag adicionada' };
  }

  async removeTag(instancia: string, jid: string, tag: string): Promise<{ message: string }> {
    await this.repo.removeTag(instancia, jid, tag);
    return { message: 'Tag removida' };
  }

  async sendMessage(instancia: string, jid: string, text: string): Promise<{ message: string }> {
    await this.evolution.sendTextMessage(instancia, jid, text);
    this.logger.log(`Message sent via Evolution API for ${instancia}/${jid}`);
    return { message: 'Mensagem enviada' };
  }
}
