import { useState } from 'react';
import type { BudgetCurrency, PlannerInput, TravelStyle } from '../types';

const INTERESTS = ['culture', 'food', 'nature', 'history', 'photography', 'nightlife', 'architecture', 'hidden gems', 'shopping', 'adventure'];

interface Props {
  loading: boolean;
  onSubmit: (input: PlannerInput) => void;
}

export default function PlannerForm({ loading, onSubmit }: Props) {
  const [form, setForm] = useState<PlannerInput>({
    destination: 'Jaipur, India',
    startCity: 'New Delhi, India',
    startDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    endDate: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
    days: 4,
    travelers: 2,
    budget: 25000,
    currency: 'INR',
    style: 'mid',
    interests: ['culture', 'food', 'history', 'photography'],
    foodPreference: 'No restriction',
    transportPreference: 'Public transport + walking'
  });

  function update<K extends keyof PlannerInput>(key: K, value: PlannerInput[K]) {
    setForm((x) => ({ ...x, [key]: value }));
  }

  function toggleInterest(value: string) {
    update('interests', form.interests.includes(value) ? form.interests.filter((x) => x !== value) : [...form.interests, value]);
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="glass-panel p-5 md:p-7">
      <div className="grid gap-5 md:grid-cols-2">
        <label className="field"><span>Destination</span><input value={form.destination} onChange={(e) => update('destination', e.target.value)} required /></label>
        <label className="field"><span>Start city</span><input value={form.startCity} onChange={(e) => update('startCity', e.target.value)} required /></label>
        <label className="field"><span>Start date</span><input type="date" value={form.startDate} onChange={(e) => update('startDate', e.target.value)} required /></label>
        <label className="field"><span>End date</span><input type="date" value={form.endDate} onChange={(e) => update('endDate', e.target.value)} required /></label>
        <label className="field"><span>Days</span><input type="number" min={1} max={21} value={form.days} onChange={(e) => update('days', Number(e.target.value))} /></label>
        <label className="field"><span>Travelers</span><input type="number" min={1} max={20} value={form.travelers} onChange={(e) => update('travelers', Number(e.target.value))} /></label>
        <label className="field"><span>Total budget</span><input type="number" min={0} value={form.budget} onChange={(e) => update('budget', Number(e.target.value))} /></label>
        <label className="field"><span>Currency</span><select value={form.currency} onChange={(e) => update('currency', e.target.value as BudgetCurrency)}><option>INR</option><option>USD</option><option>EUR</option></select></label>
        <div className="field"><span>Travel style</span><div className="segmented">{(['backpacker', 'mid', 'luxury'] as TravelStyle[]).map((style) => <button key={style} type="button" onClick={() => update('style', style)} className={form.style === style ? 'active' : ''}>{style}</button>)}</div></div>
        <label className="field"><span>Food preference</span><input value={form.foodPreference} onChange={(e) => update('foodPreference', e.target.value)} placeholder="Vegetarian, halal, vegan, no restriction..." /></label>
        <label className="field md:col-span-2"><span>Transport preference</span><input value={form.transportPreference} onChange={(e) => update('transportPreference', e.target.value)} /></label>
      </div>
      <div className="mt-6">
        <span className="field-label">Interests</span>
        <div className="chip-wrap">
          {INTERESTS.map((interest) => <button type="button" key={interest} onClick={() => toggleInterest(interest)} className={`chip ${form.interests.includes(interest) ? 'selected' : ''}`}>{interest}</button>)}
        </div>
      </div>
      <button className="primary-button mt-7 w-full" disabled={loading}>{loading ? 'Reading live signals...' : 'Build situational trip'}</button>
    </form>
  );
}
