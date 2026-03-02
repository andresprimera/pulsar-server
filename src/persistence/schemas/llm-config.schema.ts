import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { LlmProvider } from '@domain/llm/provider.enum';

@Schema({ _id: false })
export class LlmConfig {
  @Prop({ required: true, enum: Object.values(LlmProvider) })
  provider: LlmProvider;

  @Prop({ required: true, select: false })
  apiKey: string;

  @Prop({ required: true })
  model: string;
}

export const LlmConfigSchema = SchemaFactory.createForClass(LlmConfig);
