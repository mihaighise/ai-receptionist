// Skill: transfer callers to a person. When a caller asks for someone, or something urgent can't
// wait, the receptionist puts them through to the business's transfer number with transfer_call.
//
// The parts every skill has are described in index.js.

export default {
  id: 'transfers',
  label: 'Transfer callers to a person',

  settings: { transfer_number: 'phone' },

  validate(values) {
    return values.transfer_number ? {} : { transfer_number: 'Transfers need a number to transfer callers to.' };
  },

  // Without a number there's nothing to transfer to, so the receptionist isn't told transfers exist.
  actions: (row, on) => ({ transfer: { number: on ? row.transfer_number : null } }),
  live: (business) => Boolean(business.actions.transfer.number),

  prompt: {
    // What to do when a caller asks for a person (see prompt.js for the line used without this skill).
    handoff: () => '- If the caller asks for a person, or the matter is urgent and they want to speak to someone now, use transfer_call.',
  },

  tools: () => [
    {
      name: 'transfer_call',
      description: 'Transfer the caller to a member of staff, when they ask for a person or the request needs one right away.',
      eager_input_streaming: true,
      input_schema: {
        type: 'object',
        properties: { reason: { type: 'string', description: 'Why the caller is being transferred' } },
        required: ['reason'],
      },
    },
  ],

  // call.transfer() replaces the call's TwiML with a <Dial>, which ends the receptionist's part.
  startCall({ business, call, endConversation }) {
    let transferred = false;
    return {
      async run(block, result) {
        if (block.name !== 'transfer_call') return null;
        if (!business.actions.transfer.number) {
          return result('Transfers are not available right now. Offer to take a message instead.', true);
        }
        // Let the caller hear "One moment, I'll put you through" before the line changes.
        await call.waitForPlayback();
        endConversation();
        transferred = true;
        await call.transfer();
        return result('Call transferred.');
      },
      close() {},
      outcome: () => ({ transferred }),
    };
  },
};
