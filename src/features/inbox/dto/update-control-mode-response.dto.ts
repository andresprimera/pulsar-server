import type { ControlMode } from '@shared/inbox/control-mode';

export class UpdateControlModeResponseDto {
  conversationId!: string;
  controlMode!: ControlMode;
  updatedAt!: Date;
}
