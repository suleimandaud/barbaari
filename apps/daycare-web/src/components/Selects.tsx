import { useEffect, useMemo, useRef, useState } from "react";
import { childLabel, classroomLabel, guardianLabel } from "../utils/labels";

type Option<T> = { value: string; label: string; item: T };

export function SearchableSelect<T>({ label, placeholder, value, options, onChange }: { label: string; placeholder?: string; value?: string; options: Option<T>[]; onChange: (value: string, item?: T) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((option) => option.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  useEffect(() => {
    function close(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div className="select-stack searchable-select" ref={rootRef}>
      <label>{label}</label>
      <button type="button" className="select-trigger" onClick={() => setOpen((current) => !current)}>
        <span>{selected?.label ?? placeholder ?? label}</span>
      </button>
      {open ? (
        <div className="select-popover">
          <input value={query} autoFocus onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${label.toLowerCase()}`} />
          <button type="button" className="select-option muted-option" onClick={() => { onChange(""); setQuery(""); setOpen(false); }}>{placeholder ?? label}</button>
          {filtered.map((option) => (
            <button type="button" className="select-option" key={option.value} onClick={() => {
              onChange(option.value, option.item);
              setQuery("");
              setOpen(false);
            }}>{option.label}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ChildSelect({ children, value, onChange, label = "Select child", placeholder }: { children: any[]; value?: string; label?: string; placeholder?: string; onChange: (id: string, child?: any) => void }) {
  return <SearchableSelect label={label} placeholder={placeholder} value={value} onChange={onChange} options={children.map((child) => ({ value: String(child.id), label: childLabel(child), item: child }))} />;
}

export function ClassroomSelect({ classrooms, value, onChange, label = "Select classroom" }: { classrooms: any[]; value?: string; label?: string; onChange: (id: string, classroom?: any) => void }) {
  return <SearchableSelect label={label} value={value} onChange={onChange} options={classrooms.map((classroom) => ({ value: String(classroom.id), label: classroomLabel(classroom), item: classroom }))} />;
}

export function GuardianSelect({ guardians, value, onChange, label = "Select guardian" }: { guardians: any[]; value?: string; label?: string; onChange: (id: string, guardian?: any) => void }) {
  return <SearchableSelect label={label} value={value} onChange={onChange} options={guardians.map((guardian) => ({ value: String(guardian.id), label: guardianLabel(guardian), item: guardian }))} />;
}
