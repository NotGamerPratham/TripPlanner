import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LoaderCircle, MapPin } from "lucide-react";
import { getJSON } from "../lib/api.js";
import { cx } from "./ui.jsx";

export const placeLabel = (p) => [p.name, p.admin1 !== p.name ? p.admin1 : null, p.country].filter(Boolean).join(", ");

/** Accessible combobox (ARIA 1.2 pattern) backed by Open-Meteo geocoding. */
export default function DestinationSearch({ id, value, onQueryChange, onSelect, selected, placeholder, invalid, describedBy }) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2 || (selected && placeLabel(selected) === value)) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);
      try {
        const { results } = await getJSON("/api/geocode", { q }, { signal: controller.signal });
        setResults(results);
        setActive(results.length ? 0 : -1);
        // Only pop the list open while the user is actually typing here.
        setOpen(document.activeElement === inputRef.current);
      } catch (err) {
        if (err.name !== "AbortError") setError(err.message);
      } finally {
        if (abortRef.current === controller) setLoading(false);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [value, selected]);

  const choose = (place) => {
    onSelect(place);
    setOpen(false);
    setResults([]);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && open && results[active]) {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const expanded = open && results.length > 0;

  return (
    <div className="relative">
      <MapPin aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/45" />
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => results.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className={cx("field pl-9", invalid && "border-red-400/60")}
      />
      {loading && <LoaderCircle aria-hidden className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-white/50" />}
      <AnimatePresence>
        {expanded && (
          <motion.ul
            id={listId}
            role="listbox"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute z-30 mt-2 max-h-72 w-full overflow-auto rounded-xl border border-white/12 bg-ink-800 p-1 shadow-2xl"
          >
            {results.map((r, i) => (
              <li
                key={r.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(r);
                }}
                onMouseEnter={() => setActive(i)}
                className={cx("flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm", i === active ? "bg-white/10" : "")}
              >
                <span>
                  <span className="font-medium text-white">{r.name}</span>
                  <span className="text-white/55">{[r.admin1 !== r.name ? r.admin1 : null, r.country].filter(Boolean).map((s) => `, ${s}`)}</span>
                </span>
                {r.countryCode && <span className="text-xs text-white/40">{r.countryCode}</span>}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
      {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
    </div>
  );
}
