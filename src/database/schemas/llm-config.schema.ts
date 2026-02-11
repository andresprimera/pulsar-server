import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { LlmProvider } from '../../agent/llm/provider.enum';

@Schema({ _id: false })
export class LlmConfig {
  @Prop({ required: true, enum: Object.values(LlmProvider) })
  provider: LlmProvider;

  @Prop({ required: true })
  apiKey: string;

  @Prop({ required: true })
  model: string;
}

export const LlmConfigSchema = SchemaFactory.createForClass(LlmConfig);
