import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import type { LlamaContext } from 'llama.rn';
import model from '../../../assets/models/model.json';
import { ASSISTANT_SYSTEM_PROMPT, checkedAssistantReply, type AssistantContext, type AssistantTurn } from './assistant-context';

export const assistantModel = model;
export function assistantAvailability(): string | undefined {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return 'Offline chat is available in the installed mobile app.';
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return 'Install an updated Kuwenta build to use offline chat.';
  return undefined;
}

/** One screen owns one lazy-loaded model, with cancellation before release. */
export function createAssistantSession() {
  let context: LlamaContext | undefined;
  let loading: Promise<LlamaContext> | undefined;
  let running: Promise<string> | undefined;
  let disposed = false;
  let canceled = false;
  async function load() {
    const unavailable = assistantAvailability(); if (unavailable) throw new Error(unavailable);
    if (context) return context;
    loading ??= (async () => {
      let path = model.file;
      if (Platform.OS === 'android') {
        const fs = await import('expo-file-system/legacy');
        if (!fs.cacheDirectory) throw new Error('Model storage is unavailable.');
        path = fs.cacheDirectory + model.file;
        const existing = await fs.getInfoAsync(path);
        if (!existing.exists || existing.size !== model.bytes) {
          const temporary = path + '.part';
          await fs.copyAsync({ from: 'asset:///' + model.file, to: temporary });
          const copied = await fs.getInfoAsync(temporary);
          if (!copied.exists || copied.size !== model.bytes) throw new Error('The bundled model could not be prepared.');
          await fs.deleteAsync(path, { idempotent: true });
          await fs.moveAsync({ from: temporary, to: path });
        }
      }
      const { initLlama } = await import('llama.rn');
      context = await initLlama({ model: path, is_model_asset: Platform.OS === 'ios', n_ctx: 2048, n_parallel: 1, n_batch: 128, n_ubatch: 64, n_threads: 2, n_gpu_layers: 0, use_mmap: true, use_mlock: false });
      return context;
    })();
    try { return await loading; } finally { loading = undefined; }
  }
  return {
    ask(question: string, facts: AssistantContext, history: readonly AssistantTurn[], onStatus: (status: 'loading' | 'thinking' | 'answering') => void, onText?: (text: string) => void): Promise<string> {
      if (disposed || running) return Promise.reject(new Error('Wait for the current reply to finish.'));
      canceled = false;
      const operation = (async () => {
        onStatus('loading'); const instance = await load();
        if (disposed || canceled) throw new Error('Reply stopped.');
        const current = { role: 'user' as const, content: 'CURRENT FACTS (read-only):\n' + facts.facts.join('\n') + '\nQUESTION: ' + question };
        const messages = [{ role: 'system' as const, content: ASSISTANT_SYSTEM_PROMPT }, ...history.slice(-4).map(turn => ({ role: turn.role, content: turn.text.slice(0, 500) })), current];
        let formatted = await instance.getFormattedChat(messages, undefined, { jinja: true, enable_thinking: false });
        let count = (await instance.tokenize(formatted.prompt)).tokens.length;
        // Drop old turns before trimming facts; always preserve the current question and exact scenario.
        while (count > 1720 && messages.length > 2) {
          messages.splice(1, 1);
          formatted = await instance.getFormattedChat(messages, undefined, { jinja: true, enable_thinking: false });
          count = (await instance.tokenize(formatted.prompt)).tokens.length;
        }
        if (count > 1720) throw new Error('This question needs a shorter context.');
        if (disposed || canceled) throw new Error('Reply stopped.');
        onStatus('thinking');
        let generated = '', emitted = '', invalid = false, finished = false, lastUpdate = 0;
        const result = await instance.completion({ messages, jinja: true, enable_thinking: false, n_predict: 220, temperature: 0.4, top_p: 0.8, top_k: 20, stop: ['<|im_end|>', '<|endoftext|>'] }, data => {
          if (disposed || canceled || invalid || finished) return;
          // Parsed content is cumulative; never stream reasoning_content.
          generated = data.content ?? (generated + data.token);
          const boundaries = [...generated.matchAll(/\s+/g)];
          const boundary = boundaries[boundaries.length - 1];
          if (!boundary) return;
          const prefix = generated.slice(0, boundary.index + boundary[0].length);
          if (!prefix.trim() || /(?:\u20b1|PHP)\s*$/i.test(prefix)) return;
          if (/^(?:\*\*)?\d+[.)](?:\*\*)?$/.test(prefix.split('\n').pop()?.trim() ?? '')) return;
          const checked = checkedAssistantReply(prefix, facts, question, true);
          if (!checked) {
            invalid = true;
            void Promise.resolve().then(() => instance.stopCompletion()).catch(() => {});
            return;
          }
          if (checked !== emitted && (!emitted || Date.now() - lastUpdate >= 80)) {
            emitted = checked; lastUpdate = Date.now(); onStatus('answering'); onText?.(checked);
          }
        }).finally(() => { finished = true; });
        if (disposed || canceled) throw new Error('Reply stopped.');
        return invalid ? '' : result.content || result.text;
      })();
      running = operation;
      return operation.finally(() => { if (running === operation) running = undefined; });
    },
    async stop() { canceled = true; if (context) await context.stopCompletion(); },
    async dispose() {
      if (disposed) return; disposed = true; canceled = true;
      if (context) {
        try { await context.stopCompletion(); } catch {}
      }
      await Promise.allSettled([...(loading ? [loading] : []), ...(running ? [running] : [])]);
      if (context) { await context.release(); context = undefined; }
    },
  };
}
