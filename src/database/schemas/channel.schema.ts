import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'channels' })
export class Channel extends Document {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({
    required: true,
    enum: ['whatsapp', 'telegram', 'web', 'api', 'email', 'tiktok'],
  })
  type: 'whatsapp' | 'telegram' | 'web' | 'api' | 'email' | 'tiktok';

  @Prop({ required: true, type: [String] })
  supportedProviders: string[];
}

export const ChannelSchema = SchemaFactory.createForClass(Channel);
