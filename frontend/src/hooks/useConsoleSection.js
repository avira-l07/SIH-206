import { useEffect, useState, useCallback } from 'react';
import { readSection, navigateSections } from '../services/consoleNavigation';

export default function useConsoleSection(allowed, fallback, parameter = 'section') {
  const key = JSON.stringify(allowed);
  const [value, setValue] = useState(() => readSection(window.location.search, allowed, fallback, parameter));
  useEffect(() => {
    const sync = () => setValue(readSection(window.location.search, JSON.parse(key), fallback, parameter));
    sync(); window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [key, fallback, parameter]);
  const change = useCallback(next => {
    if (JSON.parse(key).includes(next)) navigateSections({ [parameter]: next });
  }, [key, parameter]);
  return [value, change];
}
