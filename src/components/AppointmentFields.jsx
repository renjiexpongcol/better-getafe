import { useEffect, useId, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatResidentDate, formatResidentTime, residentWeekStart } from '../services/residentPreferences';
import './AppointmentFields.css';

const dayDate = value => new Date(`${value}T12:00:00+08:00`);
const dateLabel = value => formatResidentDate(dayDate(value), { weekday: 'short' });
const timeLabel = value => formatResidentTime(new Date(`2026-01-01T${value}:00+08:00`));
export const appointmentContact = value => String(value || '').replace(/\s+/g, '');
export function appointmentIssue(value, availability) {
  const day = availability?.dates?.find(item => item.date === value.date);
  if (!day?.slots?.some(slot => slot.time === value.time && slot.available > 0)) return 'Choose an available date and time.';
  if (!/^09\d{9}$/.test(appointmentContact(value.contact))) return 'Enter an 11-digit Philippine mobile number starting with 09.';
  if (!value.reason?.trim() || value.reason.length > 1000) return 'Enter a reason of up to 1,000 characters.';
  return '';
}

// Calendar options come exclusively from server availability, including closures and capacity.
export default function AppointmentFields({ value, onChange, availability, disabled = false, loading = false, error = '', onRetry, attempted = false }) {
  const id = useId(), root = useRef(null), trigger = useRef(null);
  const [open, setOpen] = useState(false), [month, setMonth] = useState(''), [touched, setTouched] = useState({});
  const days = availability?.dates || [], allowed = days.filter(day => day.slots.some(slot => slot.available > 0));
  const selected = days.find(day => day.date === value.date), slots = selected?.slots.filter(slot => slot.available > 0) || [];
  const calendarMonth = month || (value.date || allowed[0]?.date || '').slice(0, 7);
  const current = calendarMonth ? new Date(`${calendarMonth}-01T12:00:00`) : null;
  const adjacentMonth = delta => { const next = new Date(current.getFullYear(), current.getMonth() + delta, 1); return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`; };
  const offset = current ? (current.getDay() - residentWeekStart() + 7) % 7 : 0;
  const total = current ? new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate() : 0;
  const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const dateError = (attempted || touched.date) && !allowed.some(day => day.date === value.date) ? 'Choose an available date.' : '';
  const timeError = (attempted || touched.time) && value.date && !slots.some(slot => slot.time === value.time) ? 'Choose an available time.' : '';
  const contactError = (attempted || touched.contact) && !/^09\d{9}$/.test(appointmentContact(value.contact)) ? 'Enter 11 digits starting with 09 (for example, 09123456789).' : '';
  const reasonError = (attempted || touched.reason) && !value.reason.trim() ? 'Tell us what you need help with.' : '';
  const close = () => { setOpen(false); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const outside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside);
    root.current?.addEventListener('keydown', escape);
    const element = root.current;
    element?.querySelector('.appointment-calendar-days button:not(:disabled)')?.focus();
    return () => { document.removeEventListener('pointerdown', outside); element?.removeEventListener('keydown', escape); };
  }, [open]);
  useEffect(() => { if (disabled || loading) setOpen(false); }, [disabled, loading]);
  const change = next => onChange({ ...value, ...next });
  const invalid = field => event => { event.preventDefault(); setTouched(previous => ({ ...previous, [field]: true })); };
  return <div className="appointment-fields">
    <div className="appointment-date-time">
      <div className="appointment-field appointment-date" ref={root}>
        <label id={`${id}-date-label`}>Date</label>
        <button type="button" ref={trigger} className="appointment-control appointment-date-trigger" aria-labelledby={`${id}-date-label ${id}-date-value`} aria-expanded={open} aria-controls={`${id}-calendar`} aria-invalid={!!dateError} aria-describedby={dateError ? `${id}-date-error` : undefined} disabled={disabled || loading || !allowed.length} onClick={() => { setMonth(value.date.slice(0, 7)); setOpen(!open); }}><span id={`${id}-date-value`}>{value.date ? dateLabel(value.date) : 'Choose a date'}</span><CalendarDays size={18} aria-hidden="true" /></button>
        {open && <div id={`${id}-calendar`} className="appointment-calendar" role="group" aria-label="Available appointment dates" onBlur={event => { if (event.relatedTarget && !event.currentTarget.parentElement.contains(event.relatedTarget)) setOpen(false); }}>
          <header><button type="button" data-icon-button="ghost" aria-label="Previous month" disabled={calendarMonth <= allowed[0].date.slice(0, 7)} onClick={() => setMonth(adjacentMonth(-1))}><ChevronLeft size={18}/></button><strong aria-live="polite">{formatResidentDate(dayDate(`${calendarMonth}-01`), { month: 'long', year: 'numeric', day: undefined })}</strong><button type="button" data-icon-button="ghost" aria-label="Next month" disabled={calendarMonth >= allowed.at(-1).date.slice(0, 7)} onClick={() => setMonth(adjacentMonth(1))}><ChevronRight size={18}/></button></header>
          <div className="appointment-calendar-weekdays" aria-hidden="true">{weekdays.slice(residentWeekStart()).concat(weekdays.slice(0, residentWeekStart())).map(day => <span key={day}>{day}</span>)}</div>
          <div className="appointment-calendar-days">{Array.from({ length: offset + total }, (_, index) => {
            if (index < offset) return <span key={`blank-${index}`}/>;
            const key = `${calendarMonth}-${String(index - offset + 1).padStart(2, '0')}`;
            return <button type="button" key={key} aria-label={dateLabel(key)} aria-pressed={value.date === key} disabled={disabled || !allowed.some(day => day.date === key)} onClick={() => { change({ date: key, time: '' }); setTouched(previous => ({ ...previous, date: true, time: false })); close(); }}>{index - offset + 1}</button>;
          })}</div>
        </div>}
        {dateError && <small id={`${id}-date-error`} className="appointment-field-error">{dateError}</small>}
      </div>
      <div className="appointment-field"><label htmlFor={`${id}-time`}>Time</label><select id={`${id}-time`} className="appointment-control" required size={1} disabled={disabled || loading || !value.date || !slots.length} value={value.time} onInvalid={invalid('time')} onBlur={() => setTouched(previous => ({ ...previous, time: true }))} aria-invalid={!!timeError} aria-describedby={timeError ? `${id}-time-error` : undefined} onChange={event => change({ time: event.target.value })}><option value="">{!value.date ? 'Select a date first' : !slots.length ? 'No available times' : 'Choose a time'}</option>{slots.map(slot => <option key={slot.time} value={slot.time}>{timeLabel(slot.time)}{slot.available <= 2 ? ` · ${slot.available} left` : ''}</option>)}</select>{timeError && <small id={`${id}-time-error`} className="appointment-field-error">{timeError}</small>}</div>
    </div>
    {loading ? <p className="appointment-support" role="status">Loading available dates and times…</p> : error ? <div className="appointment-support"><p role="alert">{error}</p>{onRetry && <button type="button" className="es-secondary" disabled={disabled} onClick={onRetry}>Try loading appointment slots again</button>}</div> : !allowed.length ? <p className="appointment-support" role="status">No appointment slots are available. Please try again later.</p> : value.date && !slots.length ? <p className="appointment-support" role="status">No times remain for this date. Choose another date.</p> : null}
    {availability?.config?.location && <p className="appointment-location"><strong>Location</strong><span>{availability.config.location}</span></p>}
    <div className="appointment-field"><label htmlFor={`${id}-contact`}>Contact number</label><input id={`${id}-contact`} className="appointment-control" type="tel" inputMode="tel" autoComplete="tel" required maxLength={24} pattern="09[0-9 ]{9,22}" placeholder="09123456789" disabled={disabled} value={value.contact} onChange={event => change({ contact: event.target.value })} onBlur={() => setTouched(previous => ({ ...previous, contact: true }))} onInvalid={invalid('contact')} aria-invalid={!!contactError} aria-describedby={`${id}-contact-help`}/><small id={`${id}-contact-help`} className={contactError ? 'appointment-field-error' : 'appointment-hint'}>{contactError || 'We’ll use this number to contact you about your appointment.'}</small></div>
    <div className="appointment-field"><label htmlFor={`${id}-reason`}>Reason for appointment</label><textarea id={`${id}-reason`} className="appointment-control" required rows={3} maxLength={1000} disabled={disabled} placeholder="Briefly describe what you need help with…" value={value.reason} onChange={event => change({ reason: event.target.value })} onBlur={() => setTouched(previous => ({ ...previous, reason: true }))} onInvalid={invalid('reason')} aria-invalid={!!reasonError} aria-describedby={`${id}-reason-help`}/><small id={`${id}-reason-help`} className={reasonError ? 'appointment-field-error' : 'appointment-hint'}>{reasonError || `${value.reason.length}/1,000 characters`}</small></div>
  </div>;
}
