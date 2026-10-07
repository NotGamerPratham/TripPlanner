import type { ItineraryPlan, LiveContext } from '../types';

export function totalPlanCost(plan: ItineraryPlan) {
  return plan.days.reduce((sum, day) => sum + day.estimatedDailyCost, 0);
}

export function reorderDay(plan: ItineraryPlan, from: number, to: number): ItineraryPlan {
  const days = [...plan.days];
  const [moved] = days.splice(from, 1);
  days.splice(to, 0, moved);
  return { ...plan, days: days.map((day, index) => ({ ...day, day: index + 1 })) };
}

export function hydrateEmergencyDefaults(plan: ItineraryPlan, context: LiveContext) {
  if (plan.emergencyNumbers.some((x) => x.status === 'verified')) return plan;
  return {
    ...plan,
    safetyTips: [
      ...plan.safetyTips,
      'Verify local emergency numbers from an authoritative government, embassy or destination safety source before travel.'
    ]
  };
}
