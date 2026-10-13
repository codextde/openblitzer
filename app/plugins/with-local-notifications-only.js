const { withEntitlementsPlist, withInfoPlist } = require('expo/config-plugins');

module.exports = function withLocalNotificationsOnly(config) {
  config = withEntitlementsPlist(config, (mod) => {
    delete mod.modResults['aps-environment'];
    return mod;
  });
  return withInfoPlist(config, (mod) => {
    const modes = mod.modResults.UIBackgroundModes;
    if (Array.isArray(modes)) mod.modResults.UIBackgroundModes = modes.filter((m) => !['fetch', 'remote-notification', 'bluetooth-central'].includes(m));
    return mod;
  });
};
