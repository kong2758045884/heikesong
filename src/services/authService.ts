import type { NavPage, UserRole } from '../types';

export interface Account {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
}

export interface Session {
  user: Account | null;
  pages: NavPage[];
}

export const ROLE_NAMES: Record<UserRole, string> = {
  teacher: '教师端',
  student: '学生端',
  admin: '管理端',
};

export const WORKSPACE_PAGES: NavPage[] = [
  'dashboard', 'checkin', 'classroom', 'knowledge-graph', 'virtual-lab', 'diagnostics', 'group-collab',
];

export class AuthError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request(path: string, body?: object, signal?: AbortSignal): Promise<Session> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...(body && {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    signal,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new AuthError(payload?.error || '账户服务暂时不可用，请重试。', response.status);
  if (!payload || !Array.isArray(payload.pages)) throw new Error('账户服务暂时不可用，请重试。');
  return payload as Session;
}

export const getSession = (signal?: AbortSignal) => request('/api/auth/me', undefined, signal);
export const checkPage = (page: NavPage, signal: AbortSignal) => request('/api/pages/' + page, undefined, signal);
export const endSession = () => request('/api/auth/logout', {});

interface Credentials {
  username: string;
  password: string;
  displayName?: string;
  role?: 'student' | 'teacher';
  inviteCode?: string;
}

export const startSession = (mode: 'login' | 'register', credentials: Credentials) =>
  request('/api/auth/' + mode, credentials);
