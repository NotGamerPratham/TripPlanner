import { useState } from 'react';
import type { ItineraryPlan, LiveContext } from '../types';

export default function ChatAssistant({ plan, context }: { plan: ItineraryPlan; context: LiveContext }) {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);

  async function send() {
    if (!draft.trim()) return;
    const question = draft.trim();
    setDraft('');
    setMessages((m) => [...m, { role: 'user', text: question }]);
    setLoading(true);
    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, plan, context }) });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { answer: string };
      setMessages((m) => [...m, { role: 'assistant', text: data.answer }]);
    } catch (error) {
      setMessages((m) => [...m, { role: 'assistant', text: `Chat unavailable: ${error instanceof Error ? error.message : 'unknown error'}` }]);
    } finally { setLoading(false); }
  }

  return <section className="glass-panel p-5"><div><p className="eyebrow">Companion</p><h2 className="mt-1 text-xl font-semibold">Ask about the plan</h2></div><div className="mt-5 max-h-64 space-y-3 overflow-auto pr-1">{messages.length === 0 && <p className="text-sm text-white/50">Try: “Make day 2 less rushed”, “What should I swap if it rains?”, or “Can I cut ₹3,000 from this plan?”</p>}{messages.map((m, i) => <div key={i} className={m.role === 'user' ? 'chat user' : 'chat'}>{m.text}</div>)}</div><div className="mt-5 flex gap-2"><input className="flex-1" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send(); }} placeholder="Ask the trip assistant" /><button className="primary-button px-5" disabled={loading} onClick={send}>{loading ? '...' : 'Send'}</button></div><div className="mt-3 text-xs text-white/40">Live source data is authoritative; Claude should not turn unavailable data into facts.</div></section>;
}
