// iOS has no equivalent restriction to Android's exact-alarm special
// permission, and this module has no Apple implementation (see
// expo-module.config.json — "platforms" omits "apple" on purpose, since
// there's nothing for it to check). Metro resolves this file for iOS
// bundles instead of ./ExactAlarmModule.ts, so the Android-only native
// binding in that file is never referenced/evaluated on iOS.
const ExactAlarmModule = {
  canScheduleExactAlarms(): boolean {
    return true;
  },
};

export default ExactAlarmModule;
