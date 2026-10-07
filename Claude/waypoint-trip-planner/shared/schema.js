// Shared Zod schemas — used by the server (request validation, Claude tool
// schemas, tool-output validation) and by the client (validating plans that
// arrive from share links or localStorage).
import { z } from "zod";

export const TRIP_STYLES = ["backpacker", "mid", "luxury"];

export const INTERESTS = [
  "Culture & history",
  "Food & markets",
  "Nature & hikes",
  "Art & museums",
  "Architecture",
  "Nightlife",
  "Shopping",
  "Photography",
  "Beaches & water",
  "Adventure",
  "Wellness",
  "Family-friendly",
];

export const FOOD_PREFS = [
  "No restrictions",
  "Vegetarian",
  "Vegan",
  "Halal",
  "Kosher",
  "Gluten-free",
  "Street food lover",
  "Local specialties only",
];

export const TRANSPORT_PREFS = [
  "Public transit",
  "Walking",
  "Taxi / rideshare",
  "Rental car",
  "Bike / scooter",
];

export const CURRENCIES = [
  "USD", "EUR", "GBP", "INR", "JPY", "AUD", "CAD", "SGD", "AED", "THB",
  "CHF", "CNY", "HKD", "NZD", "SEK", "NOK", "DKK", "ZAR", "BRL", "MXN",
  "IDR", "MYR", "PHP", "KRW", "TRY",
];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM (24h)");
const money = (desc) => z.number().min(0).describe(desc);
const placeRef = z
  .string()
  .nullable()
  .describe(
    "id copied verbatim from the NEARBY / DAY TRIPS / HIDDEN GEMS / STAYS / EATS lists (e.g. 'n123'), or null if the place is not in those lists",
  );

/* ------------------------------------------------------------------ */
/* Trip request (form input)                                           */
/* ------------------------------------------------------------------ */

export const PlaceSchema = z.object({
  name: z.string().min(1).max(120),
  admin1: z.string().max(120).nullable().optional(),
  country: z.string().max(120).nullable().optional(),
  countryCode: z.string().max(3).nullable().optional(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  timezone: z.string().max(64).nullable().optional(),
});

export const TripRequestSchema = z.object({
  destination: PlaceSchema,
  origin: z.string().trim().min(1).max(120),
  originPlace: PlaceSchema.nullable().optional(),
  startDate: isoDate,
  days: z.number().int().min(1).max(14),
  travelers: z.number().int().min(1).max(12),
  budget: z.number().positive().max(10_000_000),
  currency: z.enum(CURRENCIES),
  style: z.enum(TRIP_STYLES),
  interests: z.array(z.string().max(40)).max(12),
  food: z.array(z.string().max(40)).max(8),
  transport: z.array(z.string().max(40)).max(6),
  notes: z.string().max(500).optional().default(""),
});

/* ------------------------------------------------------------------ */
/* Plan sections — each one is a Claude tool input                     */
/* ------------------------------------------------------------------ */

export const OverviewSchema = z.object({
  title: z.string().min(1).max(140).describe("Evocative trip title, max ~8 words"),
  tagline: z.string().max(240).describe("One sentence hook"),
  summary: z.string().max(1200).describe("2-4 sentences on the shape of the trip"),
  weatherStrategy: z
    .string()
    .max(700)
    .describe("How the day order responds to the forecast; say so plainly if dates are beyond the forecast window"),
  bestAreasToStay: z.array(z.string().max(120)).max(4),
  budgetVerdict: z
    .string()
    .max(600)
    .describe("Is the budget realistic for this style? What the money buys; what to cut if tight"),
  dataGaps: z
    .array(z.string().max(300))
    .max(8)
    .describe("Live facts that were unavailable and the traveler should verify (closures, events, etc.)"),
});

export const ActivitySchema = z.object({
  time: hhmm.describe("Local start time, 24h"),
  durationMin: z.number().int().min(5).max(720),
  title: z.string().min(1).max(140),
  placeId: placeRef,
  kind: z.enum(["sight", "museum", "nature", "food", "experience", "shopping", "nightlife", "transit", "rest"]),
  description: z.string().max(600).describe("1-2 sentences: why go, what to do there"),
  costPerPerson: money("Entry fee / ticket / spend per person in trip currency; 0 if free"),
  costNote: z.string().max(200).describe("e.g. 'est. entry fee — verify on official site' or 'free'"),
  travelMinFromPrev: z.number().int().min(0).max(600).describe("Minutes from the previous stop (0 for the first)"),
  travelMode: z.enum(["walk", "transit", "taxi", "car", "bike", "ferry", "none"]),
  indoor: z.boolean(),
  offbeat: z.boolean().describe("true for lesser-known / hidden-gem stops"),
  budgetAlternative: z
    .object({
      title: z.string().max(140),
      costPerPerson: money("Cheaper alternative cost per person"),
      note: z.string().max(200),
    })
    .nullable()
    .describe("A cheaper swap for this stop, or null if it is already free/cheap"),
});

export const DaySchema = z.object({
  day: z.number().int().min(1).max(14),
  date: isoDate,
  title: z.string().min(1).max(120),
  area: z.string().max(140).describe("Neighbourhood / cluster this day focuses on"),
  weatherFit: z.string().max(400).describe("How this day fits the forecast for its date"),
  activities: z.array(ActivitySchema).min(2).max(10),
  localTransportPerPerson: money("Local transport spend for the day per person"),
  rainPlanB: z.object({
    summary: z.string().max(400),
    swaps: z
      .array(
        z.object({
          title: z.string().max(140),
          placeId: placeRef,
          costPerPerson: money("Cost per person"),
          note: z.string().max(240),
        }),
      )
      .max(4),
  }),
  tip: z.string().max(400),
});

const StayOptionSchema = z.object({
  name: z.string().min(1).max(140),
  placeId: placeRef,
  area: z.string().max(140),
  pricePerNight: money("Estimated price per night for the WHOLE group (all rooms/beds)"),
  why: z.string().max(400),
  bookingTip: z.string().max(300),
});

export const StaysSchema = z.object({
  recommendedTier: z.enum(TRIP_STYLES),
  tiers: z.object({
    backpacker: z.array(StayOptionSchema).min(1).max(3),
    mid: z.array(StayOptionSchema).min(1).max(3),
    luxury: z.array(StayOptionSchema).min(1).max(3),
  }),
  note: z.string().max(400),
});

const MealSchema = z.object({
  name: z.string().max(140).describe("Venue name from EATS, or a generic description like 'street stalls at X market'"),
  placeId: placeRef,
  dish: z.string().max(140),
  costPerPerson: money("Cost per person"),
});

export const FoodSchema = z.object({
  mustTry: z
    .array(
      z.object({
        dish: z.string().max(100),
        description: z.string().max(300),
        typicalCost: money("Typical price per portion"),
        street: z.boolean(),
        diet: z.array(z.string().max(30)).max(4).describe("e.g. vegetarian, vegan, halal, contains pork"),
      }),
    )
    .min(3)
    .max(10),
  daily: z
    .array(
      z.object({
        day: z.number().int().min(1).max(14),
        breakfast: MealSchema,
        lunch: MealSchema,
        dinner: MealSchema,
      }),
    )
    .min(1)
    .max(14),
  snacksPerPersonPerDay: money("Coffee, water, snacks per person per day"),
  dietNotes: z.string().max(500),
  waterAndHygiene: z.string().max(400),
  tipping: z.string().max(300),
});

export const TransportSchema = z.object({
  gettingThere: z
    .array(
      z.object({
        mode: z.enum(["flight", "train", "bus", "car", "ferry", "other"]),
        summary: z.string().max(240),
        durationText: z.string().max(80),
        costPerPersonRoundTrip: money("Round-trip estimate per person"),
        note: z.string().max(300),
      }),
    )
    .min(1)
    .max(4),
  recommended: z.number().int().min(0).max(3).describe("Index into gettingThere of the best-value option"),
  local: z
    .array(
      z.object({
        mode: z.string().max(60),
        howTo: z.string().max(300),
        typicalCost: z.string().max(100),
        bestFor: z.string().max(160),
      }),
    )
    .min(1)
    .max(6),
  passes: z
    .array(z.object({ name: z.string().max(100), price: money("Price"), worthIt: z.string().max(240) }))
    .max(4),
  airportTransfer: z.string().max(400),
});

export const ExtrasSchema = z.object({
  moneyHacks: z
    .array(z.object({ hack: z.string().max(300), saves: z.string().max(80) }))
    .min(3)
    .max(10),
  packing: z
    .array(z.object({ category: z.string().max(60), items: z.array(z.string().max(80)).max(14) }))
    .min(2)
    .max(6),
  safety: z.object({
    tips: z.array(z.string().max(300)).min(2).max(8),
    scams: z
      .array(z.object({ name: z.string().max(100), how: z.string().max(300), avoid: z.string().max(300) }))
      .max(6),
    emergency: z.object({
      police: z.string().max(30),
      ambulance: z.string().max(30),
      fire: z.string().max(30),
      touristPolice: z.string().max(60).nullable(),
      note: z.string().max(300),
    }),
    health: z.string().max(500),
  }),
  etiquette: z.array(z.string().max(240)).max(6),
  miscPerPersonPerDay: money("Shopping, SIM/data, tips, small extras per person per day"),
});

export const SECTION_SCHEMAS = {
  overview: OverviewSchema,
  day: DaySchema,
  stays: StaysSchema,
  food: FoodSchema,
  transport: TransportSchema,
  extras: ExtrasSchema,
};

/* ------------------------------------------------------------------ */
/* Saved / shared trips (validated leniently on load)                  */
/* ------------------------------------------------------------------ */

// Client-side enriched activity: server/client add id, coordinates, flags.
const EnrichedActivity = ActivitySchema.extend({
  id: z.string().max(64),
  lat: z.number().nullable().optional(),
  lon: z.number().nullable().optional(),
  verified: z.boolean().optional(),
  skipped: z.boolean().optional(),
  swapped: z.boolean().optional(),
  original: z.any().optional(),
});

const EnrichedDay = DaySchema.extend({
  key: z.string().max(64),
  activities: z.array(EnrichedActivity).max(16),
});

export const SavedTripSchema = z.object({
  v: z.literal(1),
  id: z.string().max(64),
  savedAt: z.string().max(40),
  request: TripRequestSchema,
  plan: z.object({
    overview: OverviewSchema.nullable().optional(),
    days: z.array(EnrichedDay).max(14),
    stays: StaysSchema.nullable().optional(),
    food: FoodSchema.nullable().optional(),
    transport: TransportSchema.nullable().optional(),
    extras: ExtrasSchema.nullable().optional(),
  }),
  choices: z
    .object({
      stayTier: z.enum(TRIP_STYLES),
      stayIndex: z.number().int().min(0).max(2),
      travelIndex: z.number().int().min(0).max(3),
    })
    .partial()
    .optional(),
});
