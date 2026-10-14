const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');
module.exports = function withPrivateBackup(config) {
  config = withAndroidManifest(config, config => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    app.$['android:allowBackup'] = 'false';
    app.$['android:fullBackupContent'] = '@xml/kuwenta_backup_rules';
    app.$['android:dataExtractionRules'] = '@xml/kuwenta_extraction_rules';
    return config;
  });
  return withDangerousMod(config, ['android', async config => {
    const directory = path.join(config.modRequest.platformProjectRoot, 'app/src/main/res/xml');
    await fs.mkdir(directory, { recursive: true });
    const domains = ['root', 'file', 'database', 'sharedpref', 'external', 'device_root', 'device_file', 'device_database', 'device_sharedpref'];
    const excludes = domains.map(domain => `<exclude domain="${domain}" path="." />`).join('');
    await fs.writeFile(path.join(directory, 'kuwenta_backup_rules.xml'), `<full-backup-content>${excludes}</full-backup-content>`);
    await fs.writeFile(path.join(directory, 'kuwenta_extraction_rules.xml'), `<data-extraction-rules><cloud-backup>${excludes}</cloud-backup><device-transfer>${excludes}</device-transfer></data-extraction-rules>`);
    return config;
  }]);
};
