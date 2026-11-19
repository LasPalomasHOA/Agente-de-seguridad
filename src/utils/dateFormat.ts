import { parseSqlUtcDate } from '../services/apiService';

export const formatHora = (timeStr?: string | null, fallbackIso?: string | null): string | null => {
  if (!timeStr || typeof timeStr !== 'string') {
    if (fallbackIso && typeof fallbackIso === 'string') {
      const d = new Date(parseSqlUtcDate(fallbackIso));
      if (!isNaN(d.getTime())) {
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      }
    }
    return null;
  }
  const clean = timeStr.trim();
  if (!clean || clean === 'null' || clean === 'undefined') return null;

  if (clean.includes('T') || clean.endsWith('Z') || (clean.includes('-') && clean.includes(':'))) {
    const d = new Date(parseSqlUtcDate(clean));
    if (!isNaN(d.getTime())) {
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
  }

  const match = clean.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    if (fallbackIso && typeof fallbackIso === 'string' && (fallbackIso.includes('T') || fallbackIso.includes('-'))) {
      const d = new Date(parseSqlUtcDate(fallbackIso));
      if (!isNaN(d.getTime())) {
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      }
    }

    let hour = parseInt(match[1], 10);
    const min = match[2];
    if (match[3] !== undefined) {
      hour = (hour - 7 + 24) % 24;
    }
    return `${String(hour).padStart(2, '0')}:${min}`;
  }

  return null;
};

export const formatFecha = (dateStr?: string | null, emptyFallback = ''): string => {
  if (!dateStr || typeof dateStr !== 'string') return emptyFallback;
  const clean = dateStr.trim();
  if (!clean || clean === 'null' || clean === 'undefined') return emptyFallback;

  if (clean.includes('T') || (clean.includes('-') && clean.includes(':'))) {
    const d = new Date(parseSqlUtcDate(clean));
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      return `${day}/${month}/${d.getFullYear()}`;
    }
  }

  if (!clean.includes('-') && !clean.includes('/')) {
    return emptyFallback;
  }

  const datePart = clean.includes('T') ? clean.split('T')[0] : clean.includes(' ') ? clean.split(' ')[0] : clean;
  const parts = datePart.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${d}/${m}/${y}`;
  }
  return datePart;
};
