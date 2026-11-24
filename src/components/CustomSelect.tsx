import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface CustomSelectOption {
  value: string;
  label: string;
  code?: string;
}

interface CustomSelectProps {
  id?: string;
  value: string;
  onChange: (nextValue: string) => void;
  options: CustomSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  hasError?: boolean;
  ariaLabel?: string;
}

export default function CustomSelect({
  id,
  value,
  onChange,
  options,
  placeholder = 'Selecciona una opción',
  disabled = false,
  hasError = false,
  ariaLabel,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    if (!open) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (options.length === 0) return;
      const currentIdx = options.findIndex((o) => o.value === value);
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const nextIdx =
        currentIdx === -1
          ? 0
          : (currentIdx + delta + options.length) % options.length;
      onChange(options[nextIdx].value);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => {
          if (!disabled) setOpen((prev) => !prev);
        }}
        onKeyDown={handleTriggerKeyDown}
        className={`flex w-full items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium outline-none transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-55 ${
          hasError
            ? 'border border-red-500 bg-red-50/40 text-slate-900'
            : 'border-0 bg-[#F4F6F5] text-slate-800 hover:bg-[#ECF0EE]'
        }`}
      >
        <span className={`min-w-0 flex-1 truncate ${selectedOption ? 'text-slate-800' : 'text-slate-400'}`}>
          {selectedOption ? (
            selectedOption.code ? (
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  title={selectedOption.code}
                  className="max-w-[5.5rem] shrink-0 truncate font-mono text-xs tracking-tight text-slate-400 tabular-nums"
                >
                  {selectedOption.code}
                </span>
                <span className="min-w-0 flex-1 truncate">{selectedOption.label}</span>
              </span>
            ) : (
              selectedOption.label
            )
          ) : (
            placeholder
          )}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
          strokeWidth={1.75}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          className="auth-stagger-rise custom-scrollbar absolute left-0 right-0 z-50 mt-1.5 max-h-60 overflow-y-auto rounded-2xl border border-slate-100 bg-white py-1.5 shadow-xl"
        >
          {options.length === 0 ? (
            <li className="px-3.5 py-2 text-xs text-slate-400">Sin opciones disponibles</li>
          ) : (
            options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <li key={opt.value} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-2 px-3.5 py-2 text-left text-sm transition-colors ${
                      isSelected
                        ? 'bg-[#E2EFE6] font-semibold text-[#1B432C]'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      {opt.code ? (
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span
                            title={opt.code}
                            className={`max-w-[5.5rem] shrink-0 truncate font-mono text-xs tracking-tight tabular-nums ${
                              isSelected ? 'text-[#1B432C]/75' : 'text-slate-400'
                            }`}
                          >
                            {opt.code}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                        </span>
                      ) : (
                        <span className="block truncate">{opt.label}</span>
                      )}
                    </span>
                    {isSelected && (
                      <Check className="h-4 w-4 shrink-0 text-[#1B432C]" strokeWidth={2} />
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
