const { withDangerousMod, withXcodeProject, IOSConfig } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const { createHash } = require('node:crypto');
const path = require('node:path');
const model = require('../assets/models/model.json');
async function verify(root) {
  const file = path.join(root, 'assets/models', model.file);
  const info = await fs.stat(file).catch(() => null);
  if (info?.size !== model.bytes) throw new Error('Bundled assistant model is missing or incomplete. Run npm run prepare:assistant-model first.');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  if (hash.digest('hex') !== model.sha256) throw new Error('Bundled assistant model checksum does not match.');
  return file;
}
module.exports = function withAssistantModel(config) {
  config = withDangerousMod(config, ['android', async mod => {
    const file = await verify(mod.modRequest.projectRoot);
    const destination = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/assets');
    await fs.mkdir(destination, { recursive: true });
    await fs.copyFile(file, path.join(destination, model.file));
    await fs.copyFile(path.join(mod.modRequest.projectRoot, 'assets/models/Qwen3-LICENSE.txt'), path.join(destination, 'Qwen3-LICENSE.txt'));
    return mod;
  }]);
  return withXcodeProject(config, async mod => {
    const file = await verify(mod.modRequest.projectRoot);
    IOSConfig.XcodeUtils.ensureGroupRecursively(mod.modResults, 'Resources');
    for (const resource of [file, path.join(mod.modRequest.projectRoot, 'assets/models/Qwen3-LICENSE.txt')]) {
      IOSConfig.XcodeUtils.addResourceFileToGroup({ filepath: path.relative(mod.modRequest.platformProjectRoot, resource), groupName: 'Resources', project: mod.modResults, isBuildFile: true });
    }
    return mod;
  });
};
module.exports.verifyAssistantModel = verify;
