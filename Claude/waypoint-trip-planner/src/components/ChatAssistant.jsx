import { Fragment, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, LoaderCircle, MessageCircle, RotateCcw, Send, X } from "lucide-react";
import { useTrip } from "../store/useTrip.js";
import { cx } from "./ui.jsx";

/** Minimal, safe markdown: paragraphs, bullet/numbered lists, **bold**. No HTML injection. */
function Markdown({ text }) {
  const inline = (s) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={i} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      ),
    );
  const blocks = [];
  let list = null;
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      if (!list) {
        list = [];
        blocks.push({ type: "list", items: list });
      }
      list.push(bullet[1]);
    } else {
      list = null;
      if (line.trim()) blocks.push({ type: "p", text: line.replace(/^#+\s*/, "") });
    }
  }
  return (
    <div className="space-y-2">
      {blocks.map((b, i) =>
        b.type === "list" ? (
          <ul key={i} className="list-disc space-y-1 pl-4">
            {b.items.map((it, j) => (
              <li key={j}>{inline(it)}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{inline(b.text)}</p>
        ),
      )}
    </div>
  );
}

const SUGGESTIONS = [
  "What if it rains on day 2?",
  "Cheapest way to eat well here?",
  "Is it safe to walk around at night?",
  "What should I book in advance?",
];

export default function ChatAssistant() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const chat = useTrip((s) => s.chat);
  const status = useTrip((s) => s.chatStatus);
  const sendChat = useTrip((s) => s.sendChat);
  const clearChat = useTrip((s) => s.clearChat);
  const request = useTrip((s) => s.request);
  const health = useTrip((s) => s.health);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [chat]);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = (q) => {
    const value = (q ?? text).trim();
    if (!value || status === "streaming") return;
    sendChat(value);
    setText("");
  };

  return (
    <div className="no-print">
      <AnimatePresence>
        {open && (
          <motion.section
            role="dialog"
            aria-label="Trip assistant chat"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ type: "spring", bounce: 0.18, duration: 0.45 }}
            className="glass-strong fixed right-3 bottom-24 left-3 z-50 flex max-h-[min(640px,calc(100svh-8rem))] flex-col overflow-hidden rounded-2xl shadow-2xl sm:left-auto sm:w-[400px]"
          >
            <header className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
              <p className="flex items-center gap-2 font-semibold text-white">
                <Bot aria-hidden className="size-5 text-sun" /> Trip assistant
              </p>
              <div className="flex gap-1">
                {chat.length > 0 && (
                  <button type="button" onClick={clearChat} className="rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Clear conversation">
                    <RotateCcw className="size-4" />
                  </button>
                )}
                <button type="button" onClick={() => setOpen(false)} className="rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Close chat">
                  <X className="size-4" />
                </button>
              </div>
            </header>

            <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm" aria-live="polite" aria-busy={status === "streaming"}>
              {chat.length === 0 && (
                <div className="text-white/65">
                  <p>
                    {request
                      ? `Ask anything about your ${request.destination.name} trip — I can see your plan and the live conditions.`
                      : "Ask anything about travel planning. Build a plan first and I'll answer with your live data."}
                  </p>
                  {health && !health.ai && <p className="mt-2 text-amber-200/90">Claude isn't configured on the server, so chat is offline.</p>}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => submit(s)}
                        className="rounded-full border border-white/12 px-3 py-1.5 text-xs text-white/75 hover:border-white/30 hover:text-white"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {chat.map((m) => (
                <div key={m.id} className={cx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <div
                    className={cx(
                      "max-w-[88%] rounded-2xl px-3.5 py-2.5 leading-relaxed",
                      m.role === "user" ? "bg-gradient-to-r from-sun to-coral text-ink-950" : m.error ? "border border-red-300/30 bg-red-500/10 text-red-100" : "bg-white/[0.06] text-white/85",
                    )}
                  >
                    {m.role === "assistant" && !m.content && status === "streaming" ? (
                      <LoaderCircle aria-label="Thinking" className="size-4 animate-spin" />
                    ) : m.role === "assistant" ? (
                      <Markdown text={m.content} />
                    ) : (
                      m.content
                    )}
                  </div>
                </div>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              className="flex items-end gap-2 border-t border-white/10 p-3"
            >
              <label htmlFor="chat-input" className="sr-only">
                Message
              </label>
              <textarea
                id="chat-input"
                ref={inputRef}
                rows={1}
                maxLength={2000}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder="Ask about your trip…"
                className="field max-h-32 min-h-10 resize-none py-2"
              />
              <button
                type="submit"
                disabled={!text.trim() || status === "streaming"}
                className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-r from-sun to-coral text-ink-950 disabled:opacity-40"
                aria-label="Send"
              >
                {status === "streaming" ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
              </button>
            </form>
          </motion.section>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "Close trip assistant" : "Open trip assistant"}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="fixed right-4 bottom-5 z-50 flex h-14 items-center gap-2 rounded-full bg-gradient-to-r from-sun to-coral px-5 font-semibold text-ink-950 shadow-[0_14px_40px_-12px_rgb(255_122_89/0.8)]"
      >
        {open ? <X className="size-5" /> : <MessageCircle className="size-5" />}
        <span className="hidden sm:inline">{open ? "Close" : "Ask Waypoint"}</span>
      </motion.button>
    </div>
  );
}
