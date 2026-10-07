export type TravelStyle = 'backpacker' | 'mid' | 'luxury';
export type BudgetCurrency = 'INR' | 'USD' | 'EUR';

export interface PlannerInput {
  destination: string;
  startCity: string;
  startDate: string;
  endDate: string;
  days: number;
  travelers: number;
  budget: number;
  currency: BudgetCurrency;
  style: TravelStyle;
  interests: string[];
  foodPreference: string;
  transportPreference: string;
}

export interface GeoLocation {
  name: string;
  lat: number;
  lon: number;
  displayName: string;
  timezone?: string;
}

export interface WeatherDay {
  date: string;
  weatherCode: number;
  weatherLabel: string;
  tempMax: number;
  tempMin: number;
  precipitationProbability: number;
  precipitation: number;
  sunrise?: string;
  sunset?: string;
}

export interface LiveWeather {
  timezone: string;
  current: {
    temperature: number;
    apparentTemperature: number;
    humidity: number;
    precipitation: number;
    windSpeed: number;
    weatherCode: number;
    weatherLabel: string;
    observationTime: string;
  };
  daily: WeatherDay[];
}

export interface Place {
  id: string;
  name: string;
  lat: number;
  lon: number;
  distanceKm: number;
  category: string;
  subcategory?: string;
  tags: Record<string, string>;
  source: 'openstreetmap';
  entryFee?: { amount: number; currency: string; source: string } | null;
}

export interface LiveSignal<T> {
  status: 'available' | 'unavailable';
  source: string;
  fetchedAt: string;
  data: T | null;
  message?: string;
}

export interface SafetyAlert {
  title: string;
  description: string;
  severity: 'info' | 'watch' | 'warning' | 'critical';
  sourceUrl?: string;
}

export interface EventItem {
  id: string;
  name: string;
  startAt: string;
  venue?: string;
  url?: string;
  price?: string;
}

export interface CrowdData {
  level: 'low' | 'moderate' | 'high' | 'unknown';
  score?: number;
  method: string;
}

export interface LiveContext {
  destination: GeoLocation;
  weather: LiveWeather | null;
  nearby: {
    r5km: Place[];
    r25km: Place[];
    r100km: Place[];
  };
  events: LiveSignal<EventItem[]>;
  closures: LiveSignal<Array<{ name: string; reason: string; until?: string }>>;
  safety: LiveSignal<SafetyAlert[]>;
  crowd: LiveSignal<CrowdData>;
  gatheredAt: string;
}

export interface Activity {
  id: string;
  start: string;
  end: string;
  title: string;
  description: string;
  placeId?: string;
  location: string;
  category: string;
  weatherFit: 'outdoor' | 'indoor' | 'mixed';
  entryFee: { amount: number; currency: string; status: 'verified' | 'unknown' };
  travelMinutesFromPrevious: number;
  travelCost: { amount: number; currency: string; status: 'estimated' | 'unknown' };
  rainPlanB?: string;
}

export interface StayOption {
  id: string;
  name: string;
  tier: TravelStyle;
  location: string;
  nightly: { amount: number; currency: string; status: 'verified' | 'unknown' };
  source: 'openstreetmap' | 'provider';
  notes: string;
}

export interface FoodItem {
  meal: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  dish: string;
  why: string;
  estimatedCost: { amount: number; currency: string; status: 'verified' | 'estimated' | 'unknown' };
}

export interface DayPlan {
  day: number;
  date: string;
  theme: string;
  weather: {
    forecast: string;
    rainRisk: number;
    source: 'open-meteo' | 'unavailable';
  };
  activities: Activity[];
  food: FoodItem[];
  estimatedDailyCost: number;
}

export interface ItineraryPlan {
  title: string;
  summary: string;
  destination: string;
  currency: string;
  travelers: number;
  totalBudget: number;
  bufferPercent: number;
  stays: StayOption[];
  days: DayPlan[];
  transportPlan: string[];
  moneySavingHacks: string[];
  packingList: string[];
  safetyTips: string[];
  emergencyNumbers: Array<{ label: string; number: string; source: string; status: 'verified' | 'unknown' }>;
  sources: Array<{ name: string; url: string; usedFor: string }>;
}

export interface StreamEvent {
  type: 'status' | 'section' | 'complete' | 'error';
  section?: keyof ItineraryPlan;
  payload?: unknown;
  message?: string;
}
