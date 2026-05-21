import { IsIn } from 'class-validator';
import { CONTROL_MODES, ControlMode } from '@shared/inbox/control-mode';

export class UpdateControlModeDto {
  @IsIn(CONTROL_MODES as unknown as ControlMode[])
  controlMode!: ControlMode;
}
