import { COMMON_COUNTRIES, OTHER_COUNTRIES } from "../../shared/phone";

export interface PhoneValue {
  dial: string; // e.g. "974"
  local: string; // what the person typed
}

/** Country code picker (Qatar first, then the most common codes) + number input. */
export function PhoneField({
  id,
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  hint,
  error,
}: {
  id: string;
  label: string;
  value: PhoneValue;
  onChange: (v: PhoneValue) => void;
  onBlur?: () => void;
  placeholder?: string;
  hint?: React.ReactNode;
  error?: string | null;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="flex gap-2">
        <select
          aria-label={`${label}: country code`}
          value={value.dial}
          onChange={(e) => onChange({ ...value, dial: e.target.value })}
          className="h-[54px] w-[118px] shrink-0 rounded-xl border border-field bg-surface px-2.5 text-[15px] outline-none focus:border-ink"
        >
          {COMMON_COUNTRIES.map((c) => (
            <option key={c.iso} value={c.dial}>
              {c.iso} +{c.dial}
            </option>
          ))}
          <optgroup label="All countries">
            {OTHER_COUNTRIES.map((c) => (
              <option key={c.iso} value={c.dial}>
                {c.iso} +{c.dial} · {c.name}
              </option>
            ))}
          </optgroup>
        </select>
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={value.local}
          placeholder={placeholder}
          onChange={(e) => onChange({ ...value, local: e.target.value })}
          onBlur={onBlur}
          aria-invalid={!!error}
          aria-describedby={error || hint ? `${id}-note` : undefined}
          className="field"
        />
      </div>
      {(error || hint) && (
        <span id={`${id}-note`} className={`text-[13px] ${error ? "text-bad-ink" : "text-muted"}`}>
          {error || hint}
        </span>
      )}
    </div>
  );
}
