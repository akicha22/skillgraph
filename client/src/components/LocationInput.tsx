import { Input } from "./ui/Field";
import { useEffect, useId, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { searchLocations } from "../services/assessments";
import type { LocationSuggestion } from "../types/assessments";

type Props = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

/**
 * A location field with suggestions. Typing narrows a free, curated city list; picking a suggestion
 * fills the field, and a place that is not on the list can still be typed and kept.
 */
export default function LocationInput({
  id,
  value,
  onChange,
  placeholder = "Start typing a city",
  className = "",
}: Props) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listId = `${inputId}-locations`;
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<LocationSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Debounced lookup while the field is open; the response for a stale query is discarded.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      searchLocations(value.trim())
        .then((result) => {
          if (cancelled) return;
          setOptions(result.locations);
          setError(null);
          setActiveIndex(-1);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setOptions([]);
          setError(err instanceof Error ? err.message : "Could not load locations.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value, open]);

  function choose(location: LocationSuggestion) {
    onChange(location.name);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) setOpen(true);
      setActiveIndex((index) => Math.min(options.length - 1, index + 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(-1, index - 1));
      return;
    }
    if (event.key === "Enter" && open && activeIndex >= 0 && options[activeIndex]) {
      event.preventDefault();
      choose(options[activeIndex]);
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onBlur={(event) => {
        if (!wrapperRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <MapPin
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600"
        aria-hidden
      />
      <Input
        id={inputId}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          activeIndex >= 0 && options[activeIndex] ? `${listId}-${activeIndex}` : undefined
        }
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true);
          setLoading(true);
        }}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setLoading(true);
        }}
        onKeyDown={handleKeyDown}
        className={`pl-9 ${className}`}
      />

      {open && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-control border border-slate-200 bg-white shadow-overlay">
          {loading && options.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-500">Searching locations…</p>
          ) : options.length > 0 ? (
            <ul id={listId} role="listbox" aria-label="Location suggestions" className="max-h-60 overflow-auto py-1">
              {options.map((location, index) => (
                <li key={`${location.name}-${location.country}`}>
                  <button
                    type="button"
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(location)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`flex min-h-11 w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 text-left text-sm focus-visible:-outline-offset-2 ${
                      index === activeIndex ? "bg-brand-50 text-brand-900" : "text-slate-700"
                    }`}
                  >
                    <span className="font-medium">{location.name}</span>
                    <span className="text-xs text-slate-500">
                      {location.region}
                      {location.country !== "India" ? `, ${location.country}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-2 text-xs text-slate-500">
              {error
                ? error
                : value.trim().length > 0
                  ? `No match for “${value.trim()}” — keep it if it is right.`
                  : "Start typing to see cities."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
