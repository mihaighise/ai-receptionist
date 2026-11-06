// The languages the receptionist can speak. Each business picks some of these (the languages
// column; its CHECK in db/migrations must list the same codes).
// The code is what Deepgram and Cartesia use; the name is what Claude is told.
export const LANGUAGES = { en: 'English', es: 'Spanish' };

// The greeting, spoken in the business's main language as soon as the call connects.
export const WELCOME = {
  en: (name) => `Thanks for calling ${name}. How can I help you today?`,
  es: (name) => `Gracias por llamar a ${name}. ¿En qué le puedo ayudar?`,
};

// Spoken after the greeting for each other language the business speaks, in that language,
// so those callers know they can switch.
export const SWITCH_OFFER = {
  en: 'If you prefer English, you can speak English.',
  es: 'Si prefiere español, puede hablar en español.',
};
