import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest, errorText } from './teachingService';

export interface AttendanceRules {
  classId: string;
  title: string;
  gesture: string;
  minutes: number;
  teacherInFrame: boolean;
  boardInFrame: boolean;
  cameraOnly: boolean;
  allowCode: boolean;
}

export interface AttendanceEntry {
  studentId: string;
  name: string;
  username: string;
  submitted: string;
  method: 'manual' | 'code' | 'camera' | 'upload';
  status: 'verified' | 'late' | 'pending' | 'rejected';
  photoId?: string;
  detected?: string;
  reviewedAt?: string;
}

export interface AttendanceRound extends AttendanceRules {
  className?: string;
  roster?: { username: string; displayName: string }[];
  joined?: boolean;
  id: string;
  code?: string;
  teacher: string;
  created: string;
  onTime: string;
  ends: string;
  closed: boolean;
  entries: AttendanceEntry[];
}

export const attendancePost = (path: string, body: object = {}) =>
  apiRequest<AttendanceRound>('attendance/' + path, { method: 'POST', body });

export function useAttendance(enabled: boolean) {
  const [rounds, setRounds] = useState<AttendanceRound[]>([]);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const version = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    let timer: number;
    async function poll() {
      const current = version.current;
      try {
        const data = await apiRequest<AttendanceRound[]>('attendance/rounds', { signal: abort.signal });
        if (!abort.signal.aborted && current === version.current) {
          setRounds(data);
          setLoaded(true);
          setError('');
        }
      } catch (err) {
        if (!abort.signal.aborted) setError(errorText(err));
      } finally {
        if (!abort.signal.aborted) timer = window.setTimeout(poll, 3500);
      }
    }
    void poll();
    return () => { abort.abort(); clearTimeout(timer); };
  }, [enabled]);
  const accept = useCallback((round: AttendanceRound) => {
    version.current++;
    setRounds(previous => [round, ...previous.filter(r => r.id !== round.id)].sort((a,b) => b.created.localeCompare(a.created)));
    setLoaded(true);
    setError('');
  }, []);
  return { rounds, error, loaded, accept };
}

export type AttendanceState = ReturnType<typeof useAttendance>;
