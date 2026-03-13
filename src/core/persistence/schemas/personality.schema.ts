import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'personalities', timestamps: true })
export class Personality extends Document {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: false })
  tone?: string;

  @Prop({ required: false })
  communicationStyle?: string;

  @Prop({ type: [String], default: [] })
  examplePhrases: string[];

  @Prop({ required: false })
  guardrails?: string;

  @Prop({ required: true })
  promptTemplate: string;

  @Prop({
    required: true,
    enum: ['active', 'inactive', 'archived'],
    default: 'active',
    index: true,
  })
  status: 'active' | 'inactive' | 'archived';

  @Prop({ type: Number, required: true, default: 1 })
  version: number;

  createdAt: Date;
  updatedAt: Date;
}

export const PersonalitySchema = SchemaFactory.createForClass(Personality);
