import { useEffect, useRef, useState } from 'react';
import type { AttendanceRound } from '../services/attendanceService';
import { GESTURE_LABELS, type DetectedGestureId } from '../services/gestures';

type Capture = { photo: string; detected: DetectedGestureId | ''; method: 'camera' | 'upload' };

export function AttendancePhoto({ round, busy, onSubmit }: {
  round: AttendanceRound;
  busy: boolean;
  onSubmit: (data: Capture & { consent: boolean }) => void;
}) {
  const [consent, setConsent] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const media = useRef<MediaStream | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const [working, setWorking] = useState(false);
  const [capture, setCapture] = useState<Capture | null>(null);
  const [error, setError] = useState('');
  useEffect(() => () => {
    generation.current++;
    media.current?.getTracks().forEach(track => track.stop());
  }, []);
  useEffect(() => { if (video.current) video.current.srcObject = stream; }, [stream]);
  function reset() {
    generation.current++;
    media.current?.getTracks().forEach(track => track.stop());
    media.current = null;
    setStream(null); setCapture(null); setError(''); setWorking(false);
  }
  async function camera() {
    reset();
    const current = generation.current;
    setWorking(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error();
      const opened = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: {ideal: 960} }, audio: false });
      if (generation.current !== current) { opened.getTracks().forEach(track => track.stop()); return; }
      media.current = opened;
      setStream(opened);
    } catch {
      if (generation.current === current) setError('无法开启相机。请检查相机权限，并通过 HTTPS 或本机地址打开页面。也可申请现场复核。');
    } finally { if (generation.current === current) setWorking(false); }
  }
  async function analyze(upload?: File) {
    const current = ++generation.current;
    setWorking(true); setError(''); setCapture(null);
    let url = '';
    try {
      let source: HTMLVideoElement | HTMLImageElement;
      if (upload) {
        if (upload.size > 12 * 1024 * 1024) throw new Error('请选择 12 MB 以内的照片。');
        url = URL.createObjectURL(upload);
        const img = new Image(); img.src = url; await img.decode(); source = img;
      } else {
        if (!video.current?.videoWidth) throw new Error('摄像头尚未就绪，请稍后拍摄。');
        source = video.current;
      }
      if (current !== generation.current) return;
      const w = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
      const h = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
      const scale = Math.min(1, 960 / Math.max(w,h));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1,Math.round(w*scale)); canvas.height = Math.max(1,Math.round(h*scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('浏览器无法处理照片。');
      ctx.drawImage(source,0,0,canvas.width,canvas.height);
      const photo = canvas.toDataURL('image/jpeg',0.76);
      media.current?.getTracks().forEach(track => track.stop()); media.current=null; setStream(null);
      let detected: Capture['detected'] = '';
      try {
        const { detectGestureFromSource } = await import('../services/gestureService');
        detected = (await detectGestureFromSource(canvas)).gestureId;
      } catch { /* Teacher can review the original frame. */ }
      if (current === generation.current) setCapture({ photo, detected, method: upload ? 'upload' : 'camera' });
    } catch (e) {
      if (current === generation.current) setError(e instanceof Error ? e.message : '无法读取照片，请重试。');
    } finally {
      if (url) URL.revokeObjectURL(url);
      if (current === generation.current) setWorking(false);
    }
  }
  return <section className="lesson-panel space-y-3">
    <h3>手势照片</h3>
    <p>请摆出{GESTURE_LABELS[round.gesture as DetectedGestureId]}{round.teacherInFrame && '，将授课教师拍入画面'}{round.boardInFrame && '，将黑板或教学屏拍入画面'}。</p>
    <label className="lesson-check"><input type="checkbox" checked={consent} disabled={busy} onChange={e => {reset(); setConsent(e.target.checked);}} />我同意提交本次照片供任课教师复核。照片在 24 小时后失效。</label>
    {stream && <video ref={video} className="w-full max-h-80 rounded-xl bg-slate-900" autoPlay playsInline muted />}
    {capture && <><img className="mx-auto max-h-72 rounded-xl" src={capture.photo} alt="待提交的签到照片" /><p>{capture.detected ? '设备识别结果：'+GESTURE_LABELS[capture.detected] : '设备未能运行识别，可提交照片由教师判断。'}</p></>}
    {error && <p role="alert">{error}</p>}
    <div className="flex flex-wrap gap-2">
      {capture ? <><button className="lesson-primary" disabled={busy} onClick={() => onSubmit({...capture,consent})}>提交照片复核</button><button disabled={busy} onClick={reset}>重新拍摄</button></> :
      <><button disabled={!consent || busy || working} onClick={() => stream ? void analyze() : void camera()}>{working ? '正在处理…' : stream ? '拍摄当前画面' : '开启摄像头'}</button>
      {!round.cameraOnly && <button disabled={!consent || busy || working} onClick={() => file.current?.click()}>选择照片</button>}
      {(stream || working) && <button onClick={reset}>取消</button>}</>}
    </div>
    <input hidden ref={file} type="file" accept="image/*" onChange={e => {const selected=e.target.files?.[0]; e.target.value=''; if(selected) void analyze(selected);}} />
  </section>;
}
