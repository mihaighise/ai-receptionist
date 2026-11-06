// Kinds of business, and a template for each: the skills switched on by default, example text for
// the setup's fields, what callers usually book (for the bookings skill), and common questions to start from (with ___ for the owner to fill in). The
// owner picks one in the first step of the setup, so they start from something that fits instead
// of a blank form. The type never changes what Claude is told; only what the owner writes does.
//
// Adding a type means adding an entry here. Its skills must be ids from src/skills.

export const BUSINESS_TYPES = {
  home_services: {
    label: 'Home services',
    examples: 'Plumbing, heating and cooling, electrical, cleaning',
    skills: ['messages', 'transfers'],
    placeholders: {
      description: 'a family-owned plumbing company in Austin, fixing leaks, drains and water heaters',
      hours: 'Monday to Friday 7am to 6pm, emergencies 24/7',
      urgent_when: 'there is a burst pipe, flooding, a gas smell or no heat',
    },
    services: [{ name: 'Service call', minutes: 60 }, { name: 'Free estimate', minutes: 30 }],
    faq: [
      'We serve ___ and the surrounding area.',
      'A standard service call costs $___, waived if we do the repair.',
      'We offer 24/7 emergency service, with an after-hours fee of $___.',
      'We give free estimates for jobs over $___.',
      'All our technicians are licensed and insured.',
      'We accept cards, cash and checks.',
    ],
  },
  restaurant: {
    label: 'Restaurant or café',
    examples: 'Restaurants, cafés, bars, bakeries, food trucks',
    skills: ['messages'],
    placeholders: {
      description: 'a family-run Italian restaurant in Miami serving wood-fired pizza and fresh pasta',
      hours: 'Tuesday to Sunday 11am to 10pm, closed Monday',
      urgent_when: 'it is about a large group or an event today',
    },
    services: [{ name: 'Private event tasting', minutes: 60 }],
    faq: [
      'We take reservations for up to ___ people; larger groups should call ahead.',
      'We offer takeout, and delivery within ___ miles through ___.',
      'We have vegetarian, vegan and gluten-free options.',
      'Parking is available at ___.',
      'Happy hour is ___ to ___, with $___ drinks.',
      'We host private events for up to ___ guests.',
    ],
  },
  salon: {
    label: 'Salon, spa or barber',
    examples: 'Hair and nail salons, barbers, spas, beauty studios',
    skills: ['messages'],
    placeholders: {
      description: 'a hair and nail salon in Miami offering cuts, color, blowouts and manicures',
      hours: 'Tuesday to Saturday 9am to 7pm',
      urgent_when: 'the caller needs to cancel or move an appointment for today',
    },
    services: [{ name: 'Haircut', minutes: 45 }, { name: 'Color', minutes: 120 }, { name: 'Manicure', minutes: 45 }],
    faq: [
      'A haircut costs $___, and color starts at $___.',
      'We take walk-ins when there is a free chair; appointments are recommended.',
      'Please let us know at least ___ hours ahead if you need to cancel.',
      'Gift cards are available in the salon.',
      'Parking is available at ___.',
    ],
  },
  clinic: {
    label: 'Dental or medical office',
    examples: 'Dentists, clinics, physical therapy, vets',
    skills: ['messages', 'transfers'],
    placeholders: {
      description: 'a family dental clinic offering checkups, cleanings, fillings and emergency appointments',
      hours: 'Monday to Friday 8am to 6pm, Saturday 9am to 1pm',
      urgent_when: 'the caller is in severe pain or has an injury',
    },
    services: [{ name: 'Checkup and cleaning', minutes: 60 }, { name: 'New patient visit', minutes: 90 }, { name: 'Consultation', minutes: 30 }],
    faq: [
      'New patients are welcome; the first visit includes ___.',
      'We accept most major insurance plans, including ___.',
      'For an emergency outside opening hours, leave a message and the on-call ___ will call back.',
      'We cannot give medical advice over the phone.',
      'Please arrive ___ minutes early for your first appointment.',
    ],
  },
  real_estate: {
    label: 'Real estate',
    examples: 'Agents, brokerages, property management, rentals',
    skills: ['messages', 'transfers'],
    placeholders: {
      description: 'a real estate brokerage in Miami helping families buy, sell and rent homes',
      hours: 'Monday to Saturday 9am to 7pm, showings by appointment',
      urgent_when: 'the caller wants to see a property today or is ready to make an offer',
    },
    services: [{ name: 'Property showing', minutes: 30 }, { name: 'Home valuation', minutes: 60 }],
    faq: [
      'We help clients buy, sell and rent homes in ___.',
      'To book a showing, leave your name, number and the property address, and an agent will call you back.',
      'We offer a free home valuation for sellers.',
      'We manage rental properties in ___; tenants can leave maintenance requests with us.',
      'Our agents speak English and ___.',
      'Our office is at ___, with parking at ___.',
    ],
  },
  other: {
    label: 'Something else',
    examples: 'Shops, offices, studios and any other business',
    skills: ['messages'],
    placeholders: {
      description: 'a short description of what your business does',
      hours: 'Monday to Friday 9am to 5pm',
      urgent_when: 'the caller needs help today',
    },
    services: [{ name: 'Appointment', minutes: 30 }],
    faq: [],
  },
};

export const DEFAULT_BUSINESS_TYPE = 'other';
