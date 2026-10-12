const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

module.exports = function withKuwentaWidget(config) {
  const packageName = config.android?.package;
  if (!packageName || !/^[A-Za-z][\w]*(\.[A-Za-z][\w]*)+$/.test(packageName)) {
    throw new Error('Kuwenta widget requires a valid Android package.');
  }
  config = withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application[0];
    const name = `${packageName}.KuwentaQuickWidget`;
    application.receiver ??= [];
    application.receiver = application.receiver.filter((receiver) => receiver.$['android:name'] !== name);
    application.receiver.push({
      $: { 'android:name': name, 'android:exported': 'false', 'android:label': '@string/kuwenta_widget_name' },
      'intent-filter': [{ action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }] }],
      'meta-data': [{ $: { 'android:name': 'android.appwidget.provider', 'android:resource': '@xml/kuwenta_quick_widget_info' } }],
    });
    return mod;
  });
  return withDangerousMod(config, ['android', async (mod) => {
    const main = path.join(mod.modRequest.platformProjectRoot, 'app/src/main');
    const source = await fs.readFile(path.join(__dirname, 'KuwentaQuickWidget.kt'), 'utf8');
    const destination = path.join(main, 'java', ...packageName.split('.'), 'KuwentaQuickWidget.kt');
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, source.replaceAll('__PACKAGE__', packageName));
    await fs.cp(path.join(__dirname, 'res'), path.join(main, 'res'), { recursive: true });
    return mod;
  }]);
};
