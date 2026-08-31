package expo.modules.exactalarm

import android.app.AlarmManager
import android.content.Context
import android.os.Build
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Exposes Android's exact-alarm special permission check
 * (AlarmManager.canScheduleExactAlarms(), API 31+) to JS. Nothing in the
 * Expo SDK (expo-notifications included) exposes this — expo-notifications
 * itself silently falls back to inexact delivery when it's unavailable,
 * which is the actual cause of prayer reminders arriving late/batched (see
 * the 2026-08-23 notification-timing investigation). This module only
 * reads the permission state; it never schedules or touches notifications.
 */
class ExactAlarmModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("ExactAlarm")

    // Below API 31 there is no such restriction — exact alarms are always
    // available, so this matches canScheduleExactAlarms()'s own real-world
    // meaning on every OS version rather than only reporting it for 31+.
    Function("canScheduleExactAlarms") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        true
      } else {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
        alarmManager?.canScheduleExactAlarms() ?: false
      }
    }
  }
}
