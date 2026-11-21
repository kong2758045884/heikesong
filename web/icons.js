const paths = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  board:
    '<rect x="3" y="3" width="18" height="14" rx="2"/><path d="m8 21 4-4 4 4M7 13l3-3 3 1 4-5"/>',
  book: '<path d="M3 5q5-2 9 1 4-3 9-1v14q-5-2-9 1-4-3-9-1zM12 6v14"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.6 2.6 0 0 1 5 1c0 2-2.5 2-2.5 4m0 2.5v.2"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20v-2a7 7 0 0 1 14 0v2"/>',
  layers: '<path d="m3 7 9-4 9 4-9 4zM3 12l9 4 9-4M3 17l9 4 9-4"/>',
  spark:
    '<path d="m10 3 2.2 6.8L19 12l-6.8 2.2L10 21l-2.2-6.8L1 12l6.8-2.2zM19 2l1 3 3 1-3 1-1 3-1-3-3-1 3-1z"/>',
  edit: '<path d="m14 5 5 5M3 21l5-1 13-13a2 2 0 0 0-5-5L3 16z"/>',
  play: '<path d="m7 3 14 9-14 9z" fill="currentColor" stroke="none"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v13h5"/>',
  screen:
    '<rect x="2" y="3" width="20" height="15" rx="2"/><path d="M8 21h8m-4-3v3"/>',
  expand: '<path d="M3 9V3h6m6 0h6v6m0 6v6h-6m-6 0H3v-6"/>',
  link: '<path d="m10 8 3-3a5 5 0 0 1 7 7l-3 3m-3 1-3 3a5 5 0 0 1-7-7l3-3m1 7 8-8"/>',
  signal: '<path d="M3 17v3m6-9v9m6-13v13m6-18v18"/>',
  retest: '<path d="M3 10a9 9 0 1 1 2 8M3 3v7h7"/>',
  settings:
    '<path d="M3 6h7m4 0h7M3 12h13m4 0h1M3 18h1m4 0h13"/><circle cx="12" cy="6" r="2"/><circle cx="18" cy="12" r="2"/><circle cx="6" cy="18" r="2"/>',
  close: '<path d="m5 5 14 14m0-14L5 19"/>',
  more: '<path d="m7 10 5 5 5-5"/>',
  rotate: '<path d="m8 3 5 3-5 3m5-3c-7-1-12 3-11 7s8 6 14 4m0-3 5 3-4 4"/>',
  people:
    '<circle cx="9" cy="8" r="3"/><path d="M2 20a7 7 0 0 1 14 0m-1-15a3 3 0 0 1 0 6m3 3a5 5 0 0 1 4 5"/>',
  focus:
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  exit: '<path d="M5 3h10v4M5 3v18h10v-4m-5-5h11m-4-4 4 4-4 4"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/>',
  bulb: '<path d="M8 16c0-3-3-3-3-7a7 7 0 0 1 14 0c0 4-3 4-3 7zM9 20h6"/>',
  pencil: '<path d="m4 20 1-5L16 4l4 4L9 19zM13 7l4 4"/>',
  chev: '<path d="m9 5 7 7-7 7"/>',
  wifi: '<path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0m-11 4a6 6 0 0 1 8 0m-4 4h.01"/>',
};
export const icon = (name, size = 18) =>
  '<svg aria-hidden="true" width="' +
  size +
  '" height="' +
  size +
  '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
  (paths[name] || "") +
  "</svg>";
