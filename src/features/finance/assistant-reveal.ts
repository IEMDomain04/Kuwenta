/** Reveal complete replies without leaving timers running after Stop or navigation. */
export function createAssistantReveal() {
  let generation = 0;
  let cancelWait: (() => void) | undefined;
  function cancel() { ++generation; cancelWait?.(); cancelWait = undefined; }
  return {
    cancel,
    async reveal(text: string, prefix: string, onText: (text: string) => void): Promise<boolean> {
      cancel();
      const current = generation;
      let shown = text.startsWith(prefix) ? prefix : '';
      const chunks = text.slice(shown.length).match(/\s*\S+\s*/g) ?? [];
      for (let index = 0; index < chunks.length; index += 2) {
        if (current !== generation) return false;
        shown += chunks.slice(index, index + 2).join('');
        onText(shown);
        if (index + 2 < chunks.length) await new Promise<void>(resolve => {
          const finish = () => { clearTimeout(timer); cancelWait = undefined; resolve(); };
          const timer = setTimeout(finish, 32);
          cancelWait = finish;
        });
      }
      return current === generation;
    },
  };
}
