// Phone numbers in the web app: always shown as the country code, then the number with spaces
// ("+1 831 249 0526", "+40 700 000 000"), and typed in a country picker plus a number box that
// adds the spaces as you type (components/phone-input.tsx). The rules for each country come from
// libphonenumber-js (Google's phone number data). The server keeps numbers in Twilio's compact
// form ("+18312490526"); a number with spaces is turned into that when it's saved.

import {
  AsYouType,
  type CountryCode,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
} from 'libphonenumber-js';

export const DEFAULT_COUNTRY: CountryCode = 'US';

export interface Country {
  code: CountryCode;
  name: string;
  // The calling code, without the "+".
  dial: string;
  flag: string;
}

// "US" -> 🇺🇸: two "regional indicator" letters make a flag.
const flagOf = (code: string) => String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

// Every country, by name, with the default first.
export const COUNTRIES: Country[] = getCountries()
  .map((code) => ({ code, name: regionNames.of(code) ?? code, dial: getCountryCallingCode(code), flag: flagOf(code) }))
  .sort((a, b) => (a.code === DEFAULT_COUNTRY ? -1 : b.code === DEFAULT_COUNTRY ? 1 : a.name.localeCompare(b.name)));

export const countryOf = (code: CountryCode) => COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];

// "+18312490526" or "+1 (831) 249-0526" -> "+1 831 249 0526". Anything that isn't a phone number
// is shown as it is.
export function formatPhone(value: string | null | undefined): string {
  if (!value) return '';
  const parsed = parsePhoneNumberFromString(value.trim());
  return parsed ? parsed.formatInternational() : value;
}

// The country a number belongs to. Made-up numbers (e.g. +1 555...) have none, so the first
// country with their calling code is used, preferring the default.
function countryForCallingCode(dial: string, fallback: CountryCode): CountryCode {
  if (getCountryCallingCode(fallback) === dial) return fallback;
  return COUNTRIES.find((c) => c.dial === dial)?.code ?? fallback;
}

// The number in an input: "+1 512 555 0100" -> { country: 'US', national: '512 555 0100' }.
// Empty -> the fallback country and an empty number.
export function splitPhone(value: string, fallback: CountryCode = DEFAULT_COUNTRY) {
  const trimmed = value.trim();
  if (!trimmed) return { country: fallback, national: '' };
  return joinPhone(fallback, trimmed);
}

// What the owner typed in the number box (or pasted, maybe with a "+country code"), for this
// country -> the number with spaces ("512 555 0100"), the full number for the form
// ("+1 512 555 0100", or '' when empty), and the country (which a pasted "+44..." changes).
export function joinPhone(country: CountryCode, typed: string) {
  if (typed.trim().startsWith('+')) {
    const digits = typed.replace(/[^\d]/g, '');
    const formatter = new AsYouType();
    const full = formatter.input(`+${digits}`);
    const dial = formatter.getCallingCode();
    if (dial) {
      const found = formatter.getCountry() ?? countryForCallingCode(dial, country);
      return { country: found, national: full.slice(`+${dial}`.length).trim(), value: full };
    }
    return { country, national: typed, value: typed.trim() };
  }
  const digits = typed.replace(/\D/g, '');
  if (!digits) return { country, national: '', value: '' };
  const dial = getCountryCallingCode(country);
  // Without the country's trunk prefix: a Romanian "0700 000 000" is +40 700 000 000 (Italy's
  // leading 0 stays, as its numbering needs).
  const national = new AsYouType(country);
  national.input(digits);
  const significant = national.getNumber()?.nationalNumber ?? digits;
  const full = new AsYouType().input(`+${dial}${significant}`);
  return { country, national: full.slice(`+${dial}`.length).trim(), value: full };
}
