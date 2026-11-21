import { useCallback, useEffect, useState } from 'react';
import type { NavPage, UserRole } from '../types';

const PAGES: NavPage[] = [
  'dashboard',
  'checkin',
  'classroom',
  'knowledge-graph',
  'virtual-lab',
  'diagnostics',
  'group-collab',
  'report',
];

const ROLES: UserRole[] = ['student', 'teacher', 'admin'];

export interface AppRoute {
  role: UserRole;
  page: NavPage;
}

export const DEFAULT_ROUTE: AppRoute = { role: 'student', page: 'dashboard' };

function parseHash(): AppRoute | null {
  const raw = window.location.hash.replace(/^#\/?/, '').trim();
  if (!raw) return null;
  const [rolePart, pagePart] = raw.split('/');
  if (!ROLES.includes(rolePart as UserRole)) return null;
  if (!PAGES.includes(pagePart as NavPage)) return null;
  return { role: rolePart as UserRole, page: pagePart as NavPage };
}

function routeToHash(route: AppRoute) {
  return `#/${route.role}/${route.page}`;
}

/**
 * Shareable, back-button friendly routes such as `#/student/checkin`.
 * The cloned prototype was a single-page demo with no way to link to a screen;
 * this keeps deep links working for screenshots, QA and future app shells.
 */
export function useHashRoute(): {
  route: AppRoute;
  navigate: (page: NavPage, options?: { replace?: boolean }) => void;
  changeRole: (role: UserRole) => void;
} {
  const [route, setRoute] = useState<AppRoute>(() => {
    if (typeof window === 'undefined') return DEFAULT_ROUTE;
    return parseHash() ?? DEFAULT_ROUTE;
  });

  useEffect(() => {
    const sync = () => {
      const next = parseHash();
      if (next) {
        setRoute(next);
      } else {
        const fallback = DEFAULT_ROUTE;
        window.history.replaceState(null, '', routeToHash(fallback));
        setRoute(fallback);
      }
    };

    if (!parseHash()) {
      window.history.replaceState(null, '', routeToHash(DEFAULT_ROUTE));
    }

    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  const navigate = useCallback(
    (page: NavPage, options?: { replace?: boolean }) => {
      setRoute((current) => {
        const next = { ...current, page };
        const hash = routeToHash(next);
        if (options?.replace) {
          window.history.replaceState(null, '', hash);
        } else if (window.location.hash !== hash) {
          window.history.pushState(null, '', hash);
        }
        return next;
      });
    },
    []
  );

  const changeRole = useCallback((role: UserRole) => {
    setRoute(() => {
      const next: AppRoute = { role, page: 'dashboard' };
      const hash = routeToHash(next);
      if (window.location.hash !== hash) window.history.pushState(null, '', hash);
      return next;
    });
  }, []);

  return { route, navigate, changeRole };
}
