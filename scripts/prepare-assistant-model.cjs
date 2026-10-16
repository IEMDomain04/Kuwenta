const fs = require('node:fs/promises');
const { createWriteStream } = require('node:fs');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const path = require('node:path');
const model = require('../assets/models/model.json');
const { verifyAssistantModel } = require('../plugins/with-assistant-model');
async function main() {
  const root = path.resolve(__dirname, '..');
  try { await verifyAssistantModel(root); console.log('Assistant model is already verified.'); return; } catch {}
  const target = path.join(root, 'assets/models', model.file);
  const response = await fetch(model.url);
  if (!response.ok || !response.body) throw new Error('Could not download the assistant model.');
  const partial = target + '.download';
  await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
  const { createHash } = require('node:crypto');
  const { createReadStream } = require('node:fs');
  const hash = createHash('sha256'); for await (const chunk of createReadStream(partial)) hash.update(chunk);
  if ((await fs.stat(partial)).size !== model.bytes || hash.digest('hex') !== model.sha256) { await fs.unlink(partial); throw new Error('Downloaded model checksum does not match.'); }
  await fs.rename(partial, target); console.log('Assistant model downloaded and verified.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
