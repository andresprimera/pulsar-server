import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import {
  CHANNEL_TYPES,
  type ChannelType,
} from '@shared/channel-type.constants';

@Schema({ collection: 'channels' })
export class Channel extends Document {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({
    required: true,
    enum: CHANNEL_TYPES,
  })
  type: ChannelType;

  @Prop({ required: true, type: [String] })
  supportedProviders: string[];

  @Prop({ type: Number, default: null })
  monthlyMessageQuota: number | null; // null = unlimited (e.g. Telegram)
}

export const ChannelSchema = SchemaFactory.createForClass(Channel);
