import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'channels' })
export class Channel extends Document {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({
    required: true,
    enum: ['whatsapp', 'telegram', 'web', 'api', 'tiktok', 'instagram'],
  })
  type: 'whatsapp' | 'telegram' | 'web' | 'api' | 'tiktok' | 'instagram';

  @Prop({ required: true, type: [String] })
  supportedProviders: string[];
}

export const ChannelSchema = SchemaFactory.createForClass(Channel);
