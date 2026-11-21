export type UserRole = 'teacher' | 'student' | 'admin';

export type NavPage =
  | 'dashboard'
  | 'checkin'
  | 'classroom'
  | 'knowledge-graph'
  | 'virtual-lab'
  | 'diagnostics'
  | 'group-collab'
  | 'report';

export type MasteryStatus = 'mastered' | 'needs-review' | 'weak' | 'unlearned';

export interface KnowledgeNode {
  id: string;
  label: string;
  chapter: string;
  position: [number, number, number];
  prerequisites: string[];
  studentMastery: number; // 0-100
  classMastery: number; // 0-100
  status: MasteryStatus;
  classStatus: MasteryStatus;
  description: string;
  evidence: {
    quizScore: number;
    homeworkScore: number;
    prereqScore: number;
  };
  mistakeCount: number;
  recommendedLab?: 'recursion' | 'sorting' | 'tree';
  keyFormula?: string;
}

export interface SlideItem {
  id: string;
  pageNumber: number;
  chapter: string;
  title: string;
  subtitle: string;
  keyPoints: string[];
  codeSnippet?: string;
  formula?: string;
  aiSummary: string;
  commonPitfall: string;
}

export interface SubtitleEntry {
  id: string;
  time: string;
  zh: string;
  en: string;
  term?: {
    word: string;
    definition: string;
  };
  starred?: boolean;
}

export interface CheckInRecord {
  id: string;
  /** 课堂 id；演示数据缺省视为主班 */
  classId?: string;
  studentId: string;
  studentName: string;
  time: string;
  status: 'verified' | 'late' | 'review-needed' | 'absent';
  gesture: string;
  confidence: number;
  reason?: string;
  photoUrl?: string;
  checks: {
    studentPresent: boolean;
    teacherPresent: boolean;
    blackboardVisible: boolean;
    gestureMatched: boolean;
    livenessPassed: boolean;
    qualityOk: boolean;
  };
}

export interface MistakeItem {
  id: string;
  nodeId: string;
  nodeLabel: string;
  question: string;
  studentCode: string;
  correctCode: string;
  errorDimension: '概念混淆' | '递归出口遗漏' | '栈帧理解偏差' | '边界条件错误';
  aiDiagnosis: string;
  knowledgeSupplement: string;
  variantQuestion: {
    prompt: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  };
  resolved: boolean;
}

export interface TeachingSuggestion {
  id: string;
  priority: 'high' | 'medium';
  nodeLabel: string;
  errorRate: number;
  title: string;
  detail: string;
  actionLabel: string;
  status: 'pending' | 'adopted' | 'edited' | 'ignored';
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  stats: number[]; // votes per option
  published: boolean;
}

export interface GroupTask {
  id: string;
  title: string;
  assignee: string;
  status: 'todo' | 'doing' | 'done';
  contribution: number;
}

export interface AIConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  useRealApi: boolean;
}

/** A class section the student is enrolled in (front-end demo data). */
export interface StudentClass {
  id: string;
  name: string;
  code: string;
  teacher: string;
  teacherTitle: string;
  term: string;
  schedule: string;
  room: string;
  studentCount: number;
  progress: number;
  status: 'ongoing' | 'upcoming' | 'ended';
  /** 是否正在直播（仅主班演示为 true） */
  live?: boolean;
  theme: 'sky' | 'violet' | 'emerald';
  nextSession: string;
  attendance: number;
  unread: number;
  /** Gesture the teacher has designated for this class's check-in. */
  checkInGesture: 'v' | 'thumb' | 'ok' | 'heart';
}
