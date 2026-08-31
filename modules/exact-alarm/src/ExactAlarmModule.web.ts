import { registerWebModule, NativeModule } from 'expo';

// Web has no equivalent restriction — always report exact scheduling as
// available so callers never show an Android-only settings prompt here.
class ExactAlarmModule extends NativeModule<Record<string, never>> {
  canScheduleExactAlarms(): boolean {
    return true;
  }
}

export default registerWebModule(ExactAlarmModule, 'ExactAlarmModule');
