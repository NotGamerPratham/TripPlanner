import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';
import type { ItineraryPlan } from '../types';
import { money, shortDate } from '../lib/format';

interface Props {
  plan: ItineraryPlan;
  onPlanChange: (next: ItineraryPlan) => void;
}

export default function ItineraryBoard({ plan, onPlanChange }: Props) {
  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = plan.days.findIndex((x) => `day-${x.day}` === active.id);
    const newIndex = plan.days.findIndex((x) => `day-${x.day}` === over.id);
    const days = arrayMove(plan.days, oldIndex, newIndex).map((day, index) => ({ ...day, day: index + 1 }));
    onPlanChange({ ...plan, days });
  }

  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-4"><div><p className="eyebrow">Field plan</p><h2 className="text-2xl font-semibold">{plan.title}</h2></div><div className="text-right text-sm text-white/50">Drag a day to reorder</div></div>
      <DndContext collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={plan.days.map((x) => `day-${x.day}`)} strategy={verticalListSortingStrategy}>
          <div className="grid gap-4">
            {plan.days.map((day) => <SortableDay key={day.day} day={day} currency={plan.currency} />)}
          </div>
        </SortableContext>
      </DndContext>
    </section>
  );
}

function SortableDay({ day, currency }: { day: ItineraryPlan['days'][number]; currency: string }) {
  const sortable = useSortable({ id: `day-${day.day}` });
  const style = { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition };
  return (
    <motion.article ref={sortable.setNodeRef} style={style} layout className="glass-panel overflow-hidden" whileHover={{ y: -2 }}>
      <div className="flex cursor-grab items-start gap-4 border-b border-white/10 px-5 py-5" {...sortable.attributes} {...sortable.listeners}>
        <div className="day-index">{String(day.day).padStart(2, '0')}</div>
        <div className="min-w-0 flex-1"><div className="text-xs uppercase tracking-[0.18em] text-white/40">{shortDate(day.date)}</div><h3 className="mt-1 text-lg font-semibold">{day.theme}</h3></div>
        <div className="text-right"><div className="text-sm">{Math.round(day.weather.rainRisk)}% rain</div><div className="text-xs text-white/40">{day.weather.forecast}</div></div>
      </div>
      <div className="divide-y divide-white/10">
        {day.activities.map((activity) => <div key={activity.id} className="grid gap-3 px-5 py-4 md:grid-cols-[88px_1fr_160px]"><div className="text-sm font-semibold">{activity.start}</div><div><h4 className="font-medium">{activity.title}</h4><p className="mt-1 text-sm leading-6 text-white/60">{activity.description}</p><div className="mt-2 flex flex-wrap gap-2 text-xs text-white/40"><span>{activity.location}</span><span>{activity.travelMinutesFromPrevious} min</span><span>{activity.entryFee.status === 'verified' ? money(activity.entryFee.amount, activity.entryFee.currency) : 'Fee unknown'}</span></div>{activity.rainPlanB && <p className="mt-2 text-xs text-white/55"><strong className="text-white/80">Plan B:</strong> {activity.rainPlanB}</p>}</div><div className="text-sm text-white/60 md:text-right">{activity.category}</div></div>)}
      </div>
      <div className="border-t border-white/10 px-5 py-4 text-sm text-white/60">Estimated day spend <span className="float-right font-medium text-white">{money(day.estimatedDailyCost, currency)}</span></div>
    </motion.article>
  );
}
