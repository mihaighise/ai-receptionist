// Skills: what the receptionist can do for a business beyond answering questions. Each business
// switches skills on in its settings (the businesses.features column holds their ids); the core
// (prompt.js, receptionist.js, business-input.js, the owner app) asks the skills, so adding one
// means writing a file here and registering it below, not changing the core.
//
// A skill is an object with:
//   id, label       its code (stored in businesses.features) and the name owners see
//   settings        { column: 'phone' | 'text' }: the businesses columns its settings are kept in
//   validate(values, { owner })   -> { column: message } for settings that are wrong or missing
//                   (only called when the skill is on; owner: the owner app, rather than the admin site)
//   actions(row, on)              -> the part of a business's `actions` it decides (see toBusiness)
//   live(business)                -> whether it's offered on calls (on, and with what it needs)
//   followUp        true if the receptionist can offer a callback through it, rather than guessing
//   prompt          lines for Claude's instructions, each optional:
//                     language(business) -> lines for the Language section
//                     capabilities(business) -> lines for What you can do
//                     handoff(business) -> the line for when a caller asks for a person
//   tools(business)               -> the Claude tools it offers
//   startCall({ business, call, endConversation }) -> one call's use of it:
//                     run(toolUseBlock, result) -> a tool_result for its own tools, or null
//                     close() when the call ends; outcome() -> fields for the call history
//
// Order matters: it's the order of the skills' lines in Claude's instructions.

import messages from './messages.js';
import transfers from './transfers.js';

export const SKILLS = [messages, transfers];

export const skillById = (id) => SKILLS.find((skill) => skill.id === id) ?? null;

// The skills offered on this business's calls.
export const liveSkills = (business) => SKILLS.filter((skill) => skill.live(business));
