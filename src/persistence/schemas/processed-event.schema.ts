import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'processed_events', timestamps: false })
export class ProcessedEvent extends Document {
  @Prop({ required: true })
  channel: string;

  @Prop({ required: true })
  messageId: string;

  @Prop({ required: true, default: () => new Date() })
  processedAt: Date;
}

export const ProcessedEventSchema =
  SchemaFactory.createForClass(ProcessedEvent);

ProcessedEventSchema.index({ channel: 1, messageId: 1 }, { unique: true });
