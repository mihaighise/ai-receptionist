// A stand-in for the Claude client in tests: messages.create answers with `reply` (an object sent
// back as Claude's JSON text, or a function of the request), or throws `error`. Every request is
// kept in `requests`. Nothing reaches Anthropic.

export function fakeClaude({ reply = { sections: [], notes: [] }, stopReason = 'end_turn', error = null } = {}) {
  const requests = [];
  const state = { reply, stopReason, error, gate: null };
  const create = async (params) => {
    requests.push(params);
    // Holds the answer back until release(), to test what happens while a menu is being read.
    if (state.gate) await state.gate.promise;
    if (state.error) throw state.error;
    const answer = typeof state.reply === 'function' ? state.reply(params) : state.reply;
    return { stop_reason: state.stopReason, content: [{ type: 'text', text: JSON.stringify(answer) }] };
  };
  return {
    anthropic: { beta: { messages: { create } } },
    requests,
    state,
    hold() {
      let release;
      state.gate = { promise: new Promise((resolve) => (release = resolve)) };
      return () => {
        state.gate = null;
        release();
      };
    },
  };
}
