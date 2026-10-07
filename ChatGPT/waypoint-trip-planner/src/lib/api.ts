import type { GeoLocation, LiveContext, PlannerInput, ItineraryPlan, StreamEvent } from '../types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

export async function geocode(query: string) {
  return request<GeoLocation>(`/api/geocode?q=${encodeURIComponent(query)}`);
}

export async function getContext(input: PlannerInput, destination: GeoLocation) {
  const params = new URLSearchParams({
    lat: String(destination.lat),
    lon: String(destination.lon),
    destination: input.destination,
    startDate: input.startDate,
    endDate: input.endDate,
    timezone: destination.timezone ?? 'auto'
  });
  return request<LiveContext>(`/api/context?${params}`);
}

export async function getRoute(coordinates: Array<[number, number]>) {
  const encoded = coordinates.map(([lat, lon]) => `${lon},${lat}`).join(';');
  return request<{ geometry: [number, number][]; durationSeconds: number; distanceMeters: number }>(`/api/route?coordinates=${encodeURIComponent(encoded)}`);
}

export async function streamPlan(
  input: PlannerInput,
  context: LiveContext,
  onEvent: (event: StreamEvent) => void,
  mode: 'create' | 'cheaper' = 'create',
  existingPlan?: ItineraryPlan
) {
  const res = await fetch('/api/plan/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input, context, mode, existingPlan })
  });

  if (!res.ok || !res.body) throw new Error(await res.text());
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      onEvent(JSON.parse(line) as StreamEvent);
    }
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer) as StreamEvent);
}
