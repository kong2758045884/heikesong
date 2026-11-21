export interface TeachingClass {
  id: string;
  name: string;
  term: string;
  roster: { username: string; displayName: string }[];
}

export interface TeachingCourse {
  id: string;
  classId: string;
  name: string;
  description: string;
  joinCode: string;
  enrolled?: Record<string, { username: string; displayName: string }>;
}

export interface Topic {
  title: string;
  summary: string;
  page: number;
}

export interface TeachingSlide {
  id: string;
  title: string;
  source: string;
  elements: { id: string; kind: 'text' | 'image' | 'code' | 'formula'; text: string; image?: string }[];
}

interface DeckIdentity {
  id: string;
  courseId: string;
  title: string;
  filename: string;
  uploadedAt: string;
  topicMode: string;
}

export interface DeckBrief extends DeckIdentity {
  pageCount: number;
  topicCount: number;
}

export interface TeachingDeck extends DeckIdentity {
  pages: TeachingSlide[];
  topics: Topic[];
}

export interface TeachingWorkspaceData {
  classes: TeachingClass[];
  courses: TeachingCourse[];
  decks: DeckBrief[];
  aiAvailable: boolean;
  joinBaseUrl?: string;
}

export interface Enrollment {
  courseId: string;
  courseName: string;
  className: string;
  live: boolean;
  kind?: 'course' | 'lesson';
}

export interface LessonBrief {
  id: string;
  courseId: string;
  courseName: string;
  className: string;
  deckId: string;
  deckTitle: string;
  page: number;
  total: number;
}

export interface LiveLesson extends LessonBrief {
  slide: TeachingSlide;
  topics: Topic[];
  topicMode: string;
  joinCode?: string;
  joinBaseUrl?: string;
}

export interface ModelProfile {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  hasKey: boolean;
}

export interface ModelSettings {
  active: string;
  profiles: ModelProfile[];
}

export class TeachingError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiRequest<T>(
  path: string,
  { method = 'GET', body, signal }: { method?: string; body?: object | FormData; signal?: AbortSignal } = {},
): Promise<T> {
  const multipart = body instanceof FormData;
  const response = await fetch('/api/' + path, {
    method,
    signal,
    credentials: 'same-origin',
    cache: 'no-store',
    ...(body &&
      (multipart ? { body } : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new TeachingError(result?.error || '服务暂时不可用，请重试。', response.status);
  if (result === null) throw new Error('服务暂时不可用，请重试。');
  return result as T;
}

export const teaching = <T>(path: string, options?: Parameters<typeof apiRequest<T>>[1]) =>
  apiRequest<T>('teaching/' + path, options);

export const deckAsset = (deckId: string, file: string) => '/api/teaching/decks/' + deckId + '/' + file;
export const errorText = (error: unknown) => (error instanceof Error ? error.message : '操作失败，请重试。');
