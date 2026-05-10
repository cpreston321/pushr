const { withEntitlementsPlist } = require("expo/config-plugins");

const APP_GROUP = "group.dev.cpreston.pushr";

/**
 * Expo config plugin for the pushr widget-data bridge.
 *
 * Adds the App Groups entitlement to the main app target so the native
 * module can write to shared UserDefaults (and so that widget extension —
 * also configured with the same group via its expo-target.config.json —
 * can read the same store).
 *
 * The widget extension target itself is created by @bacons/apple-targets
 * from `targets/PushrWidget/expo-target.config.json`. App Group
 * registration there happens via that target's own entitlements block.
 */
module.exports = function pushrWidgetDataPlugin(config) {
  return withEntitlementsPlist(config, (c) => {
    const existing = c.modResults["com.apple.security.application-groups"];
    const groups = Array.isArray(existing) ? [...existing] : [];
    if (!groups.includes(APP_GROUP)) groups.push(APP_GROUP);
    c.modResults["com.apple.security.application-groups"] = groups;
    return c;
  });
};
