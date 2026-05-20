export class InboxMessageDto {
  _id!: string;
  conversationId!: string;
  content!: string;
  type!: 'user' | 'agent';
  contactId!: string | null;
  agentId!: string | null;
  createdAt!: Date;
}
