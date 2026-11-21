export type DetectedGestureId =
  | 'v'
  | 'thumb'
  | 'ok'
  | 'heart'
  | 'open'
  | 'fist'
  | 'unknown'
  | 'none';

export const GESTURE_LABELS: Record<DetectedGestureId, string> = {
  v: '✌️ 剪刀手',
  thumb: '👍 竖起大拇指',
  ok: '👌 OK 手势',
  heart: '🫶 比心手势',
  open: '🖐️ 张开手掌',
  fist: '✊ 握拳',
  unknown: '🤔 其他手势',
  none: '未检测到手部',
};
