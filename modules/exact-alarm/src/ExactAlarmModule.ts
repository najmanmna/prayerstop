import { requireNativeModule } from 'expo';

interface ExactAlarmModule {
  /** Android 12+ (API 31) special "Alarms & reminders" permission — see ExactAlarmModule.kt. Always true below API 31. */
  canScheduleExactAlarms(): boolean;
}

// This call loads the native module object from the JSI. Android-only —
// see ExactAlarmModule.ios.ts / .web.ts for the other platforms, which
// never reference this native binding at all.
export default requireNativeModule<ExactAlarmModule>('ExactAlarm');
