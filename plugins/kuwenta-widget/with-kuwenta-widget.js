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
    application.receiver ??= [];
    for (const [provider, resource] of [
      ['KuwentaQuickWidget', 'kuwenta_quick_widget_info'],
      ['KuwentaCashWidget', 'kuwenta_cash_widget_info'],
      ['KuwentaAvailableWidget', 'kuwenta_available_widget_info'],
    ]) {
      const name = `${packageName}.${provider}`;
      application.receiver = application.receiver.filter(receiver => receiver.$['android:name'] !== name);
      application.receiver.push({
        $: { 'android:name': name, 'android:exported': 'false', 'android:label': `@string/${resource}_name`, 'android:icon': '@mipmap/ic_launcher' },
        'intent-filter': [{ action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }] }],
        'meta-data': [{ $: { 'android:name': 'android.appwidget.provider', 'android:resource': `@xml/${resource}` } }],
      });
    }
    return mod;
  });
  return withDangerousMod(config, ['android', async (mod) => {
    const main = path.join(mod.modRequest.platformProjectRoot, 'app/src/main');
    for (const file of ['KuwentaQuickWidget.kt', 'KuwentaBalanceWidget.kt']) {
      const source = await fs.readFile(path.join(__dirname, file), 'utf8');
      const destination = path.join(main, 'java', ...packageName.split('.'), file);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, source.replaceAll('__PACKAGE__', packageName));
    }
    await fs.cp(path.join(__dirname, 'res'), path.join(main, 'res'), { recursive: true });
    return mod;
  }]);
};
