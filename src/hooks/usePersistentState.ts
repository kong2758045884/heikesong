import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

/**
 * State that survives a page refresh. All student-side learning progress
 * (mastery, mistakes, check-ins, task completion) is kept in localStorage so
 * the mobile demo behaves like a real app instead of resetting on every reload.
 */
export function usePersistentState<T>(
  key: string,
  initialValue: T
): [T, Dispatch<SetStateAction<T>>, () => void] {
  const initialRef = useRef(initialValue);
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as T;
    } catch {
      // corrupted or unavailable storage: fall back to the seeded value
    }
    return initialValue;
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // storage full / private mode: keep the in-memory state working
    }
  }, [key, state]);

  const reset = () => {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
    setState(initialRef.current);
  };

  return [state, setState, reset];
}

/** True when the viewport is a touch-first phone (drives copy + gesture hints). */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 640;
  });

  useEffect(() => {
    const mql = window.matchMedia('(pointer: coarse)');
    const onChange = () => setCoarse(mql.matches || window.innerWidth < 640);
    mql.addEventListener('change', onChange);
    window.addEventListener('resize', onChange);
    return () => {
      mql.removeEventListener('change', onChange);
      window.removeEventListener('resize', onChange);
    };
  }, []);

  return coarse;
}

/** Respect the OS "reduce motion" setting instead of defaulting to animations. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
