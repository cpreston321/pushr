const { withInfoPlist, withAppDelegate } = require("@expo/config-plugins");

/**
 * Expo config plugin for pushr's Live Activities.
 *
 * What this plugin does automatically:
 *   - Sets `NSSupportsLiveActivities = true` in the main app's Info.plist.
 *   - Sets `NSSupportsLiveActivitiesFrequentUpdates = true` so per-minute
 *     progress updates aren't throttled.
 *
 * What it INTENTIONALLY does not do:
 *   - Create the Widget Extension target in the Xcode project. Reliable
 *     pbxproj munging is risky and easy to subtly break; we prefer the user
 *     to do the one-time "File → New Target → Widget Extension" step in
 *     Xcode and point the target at the Swift files we ship next to this
 *     plugin. See docs/LIVE_ACTIVITIES.md for the step-by-step.
 *
 * If you're comfortable automating the target creation later, swap this
 * plugin for one that uses `withXcodeProject` + the `xcode` npm package.
 */
module.exports = function pushrLiveActivityPlugin(config) {
  config = withInfoPlist(config, (c) => {
    c.modResults.NSSupportsLiveActivities = true;
    c.modResults.NSSupportsLiveActivitiesFrequentUpdates = true;
    return c;
  });

  // Leave AppDelegate alone — the Expo module system wires up the native
  // module on its own via autolinking.
  return withAppDelegate(config, (c) => c);
};
