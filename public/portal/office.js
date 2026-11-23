/* SandBox virtual office: an isometric office floor where students walk between rooms.
   Each student is a character dressed for their path (PM, UI/UX, FE, BE, QA, DevOps).
   Rooms: meeting room, idea room, coffee room, my office, department.
   Exposes window.VOffice = { mount(el, opts), unmount() }. */
(function () {
  "use strict";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- isometric projection ---------- */
  const C = 20.78, S = 12, Z = 26;
  const P = (x, y, z = 0) => [(x - y) * C, (x + y) * S - z * Z];
  const pt = (x, y, z) => P(x, y, z).map((n) => n.toFixed(1)).join(",");
  const poly = (pts, attrs = "") => `<polygon points="${pts.map((p) => pt(p[0], p[1], p[2] || 0)).join(" ")}" ${attrs}/>`;
  const line = (pts, attrs = "") => `<polyline points="${pts.map((p) => pt(p[0], p[1], p[2] || 0)).join(" ")}" fill="none" ${attrs}/>`;
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * f))));
    return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  // A solid box. Long boxes are cut into 1-tile chunks so the painter's sort stays right around them.
  function box(objs, x, y, w, d, z, h, top, extra = 0) {
    const along = w >= d ? "x" : "y", len = along === "x" ? w : d;
    const n = Math.max(1, Math.round(len));
    for (let i = 0; i < n; i++) {
      const cx = along === "x" ? x + (w / n) * i : x, cy = along === "y" ? y + (d / n) * i : y;
      const cw = along === "x" ? w / n : w, cd = along === "y" ? d / n : d;
      const svg = poly([[cx, cy + cd, z], [cx + cw, cy + cd, z], [cx + cw, cy + cd, z + h], [cx, cy + cd, z + h]], `fill="${shade(top, 0.62)}"`) +
        poly([[cx + cw, cy, z], [cx + cw, cy + cd, z], [cx + cw, cy + cd, z + h], [cx + cw, cy, z + h]], `fill="${shade(top, 0.78)}"`) +
        poly([[cx, cy, z + h], [cx + cw, cy, z + h], [cx + cw, cy + cd, z + h], [cx, cy + cd, z + h]], `fill="${top}"`);
      objs.push({ d: cx + cw / 2 + cy + cd / 2 + extra, svg });
    }
  }
  const ellipse = (x, y, z, rx, ry, attrs) => { const [X, Y] = P(x, y, z); return `<ellipse cx="${X.toFixed(1)}" cy="${Y.toFixed(1)}" rx="${rx}" ry="${ry}" ${attrs}/>`; };

  /* ---------- floor plan (in tiles) ---------- */
  const W = 22, D = 15, HALL_Y = 7;
  const ROOMS = {
    meeting: { name: "Meeting room", emoji: "🎧", rect: [0, 0, 8, 6], door: 4, floor: "#1c2c58", blurb: "Team calls and stand-ups happen here." },
    idea: { name: "Idea room", emoji: "💡", rect: [8, 0, 14, 6], door: 11, floor: "#2a2156", blurb: "Pin ideas for the team and vote on the best ones." },
    coffee: { name: "Coffee room", emoji: "☕", rect: [14, 0, 22, 6], door: 18, floor: "#30261f", blurb: "Take a break and chat with your team." },
    dept: { name: "Department", emoji: "🏢", rect: [0, 8, 13, 15], door: 6.5, floor: "#152248", blurb: "Desks for every path. You sit with the people on your path." },
    own: { name: "My office", emoji: "🏠", rect: [13, 8, 22, 15], door: 17.5, floor: "#17313d", blurb: "Your own desk. Pick up your next module from here." },
  };
  const ROOM_ORDER = ["meeting", "idea", "coffee", "own", "dept"];
  const isTop = (r) => ROOMS[r].rect[3] <= 6;
  const doorIn = (r) => [ROOMS[r].door, isTop(r) ? 5.3 : 8.7];
  function roomAt(x, y) {
    for (const k of ROOM_ORDER) { const [x0, y0, x1, y1] = ROOMS[k].rect; if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return k; }
    return "hall";
  }
  const CLUSTERS = Array.from({ length: 6 }, (_, i) => [0.7 + (i % 3) * 4.2, 8.7 + Math.floor(i / 3) * 3.3]);
  const SPOTS = {
    meeting: [[2.3, 4.6], [5.1, 4.6], [3.7, 1.5], [6.4, 1.5], [3.7, 4.6], [6.4, 4.6], [2.3, 1.5], [5.1, 1.5], [7.3, 3], [0.9, 3]],
    idea: [[9.6, 3.6], [12.4, 3.6], [11, 4.9], [9.7, 1.4], [11, 1.4], [12.3, 1.4], [10.3, 2.6], [11.8, 2.6]],
    coffee: [[16.3, 4.4], [15.3, 3.5], [17.3, 3.5], [19.6, 4.4], [18.6, 3.5], [20.6, 3.5], [16, 1.6], [17.6, 1.6], [19.2, 1.6]],
    own: [[17.4, 11.9]],
  };
  const clusterSpots = (i) => { const [cx, cy] = CLUSTERS[i]; return [[cx + 0.8, cy + 1.45], [cx + 2.6, cy + 1.45], [cx + 1.3, cy + 2.25], [cx + 2.3, cy + 2.25], [cx + 3.3, cy + 2.25]]; };

  /* ---------- the room scenery ---------- */
  function scenery(paths, myAccent) {
    const bg = [], objs = [], tags = [];
    // floor slab
    bg.push(poly([[0, D, -0.4], [W, D, -0.4], [W, D, 0], [0, D, 0]], `fill="#0d1636"`));
    bg.push(poly([[W, 0, -0.4], [W, D, -0.4], [W, D, 0], [W, 0, 0]], `fill="#121d44"`));
    bg.push(poly([[0, 6], [W, 6], [W, 8], [0, 8]], `fill="#101a3a"`));
    for (const k of ROOM_ORDER) {
      const [x0, y0, x1, y1] = ROOMS[k].rect;
      bg.push(poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], `class="vo-floor" data-room="${k}" fill="${ROOMS[k].floor}"`));
    }
    let grid = "";
    for (let x = 1; x < W; x++) grid += line([[x, 0], [x, D]]);
    for (let y = 1; y < D; y++) grid += line([[0, y], [W, y]]);
    bg.push(`<g class="vo-grid">${grid}</g>`);
    // rug in my office
    bg.push(poly([[15, 12.7], [20.2, 12.7], [20.2, 14.6], [15, 14.6]], `fill="${myAccent}" opacity=".22"`));
    // department wires to the server rack, like a circuit on the floor
    let wires = "";
    CLUSTERS.forEach(([cx, cy], i) => {
      const col = i % 3;
      [[cx + 0.8, 4.5], [cx + 2.6, 8.7]].forEach(([dx, chan], j) => {
        const ch = col === 0 ? 4.5 : col === 2 ? 8.7 : j === 0 ? 4.5 : 8.7;
        const pts = cy < 10 ? [[dx, cy + 0.1], [dx, 8.35], [12.25, 8.35]] : [[dx, cy + 0.1], [dx, cy - 0.35], [ch, cy - 0.35], [ch, 8.35], [12.25, 8.35]];
        wires += line(pts, `class="vo-wire-base"`) + line(pts, `class="vo-wire" style="animation-delay:${-(i * 0.37 + j * 0.2).toFixed(2)}s"`);
      });
    });
    bg.push(`<g>${wires}</g>`);
    // outer walls with windows
    bg.push(poly([[0, -0.3, 0], [W, -0.3, 0], [W, -0.3, 3.4], [0, -0.3, 3.4]], `fill="#16224a"`));
    bg.push(poly([[0, 0, 0], [W, 0, 0], [W, 0, 3.2], [0, 0, 3.2]], `fill="#1b2955"`));
    bg.push(poly([[0, -0.3, 3.2], [W, -0.3, 3.2], [W, 0, 3.2], [0, 0, 3.2]], `fill="#2a3a70"`));
    bg.push(poly([[-0.3, 0, 0], [-0.3, D, 0], [-0.3, D, 3.2], [-0.3, 0, 3.2]], `fill="#121c40"`));
    bg.push(poly([[0, 0, 0], [0, D, 0], [0, D, 3.2], [0, 0, 3.2]], `fill="#16224b"`));
    bg.push(poly([[-0.3, -0.3, 3.2], [0, -0.3, 3.2], [0, D, 3.2], [-0.3, D, 3.2]], `fill="#27376a"`));
    const winY = (y0, y1) => poly([[0, y0, 1.2], [0, y1, 1.2], [0, y1, 2.7], [0, y0, 2.7]], `class="vo-window"`);
    const winX = (x0, x1, z0 = 1.2, z1 = 2.7) => poly([[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]], `class="vo-window"`);
    bg.push(winY(1, 3), winY(3.4, 5.4), winY(9, 11), winY(11.6, 13.6), winX(0.6, 1.8), winX(6.4, 7.6), winX(20.6, 21.6));
    // meeting room screen with a chart
    bg.push(poly([[2.2, 0, 1], [5.8, 0, 1], [5.8, 0, 2.6], [2.2, 0, 2.6]], `fill="#0b1026"`));
    bg.push(poly([[2.35, 0, 1.1], [5.65, 0, 1.1], [5.65, 0, 2.5], [2.35, 0, 2.5]], `class="vo-screen"`));
    [[2.7, 0.5], [3.3, 0.9], [3.9, 0.7], [4.5, 1.15], [5.1, 1]].forEach(([x, hgt]) => bg.push(poly([[x, 0, 1.25], [x + 0.35, 0, 1.25], [x + 0.35, 0, 1.25 + hgt], [x, 0, 1.25 + hgt]], `fill="#5ee3bc" opacity=".85"`)));
    // idea room whiteboard and sticky notes
    bg.push(poly([[8.8, 0, 0.9], [13.2, 0, 0.9], [13.2, 0, 2.6], [8.8, 0, 2.6]], `fill="#e7ebf3"`));
    [["#ffd35a", 9.1, 2.0], ["#ff8fb1", 9.8, 2.1], ["#7cc4ff", 10.6, 1.9], ["#5ee3bc", 11.4, 2.05], ["#ffd35a", 12.2, 1.95], ["#c4a7ff", 9.5, 1.3], ["#ff8a7a", 10.3, 1.25], ["#ffd35a", 11.9, 1.3]].forEach(([c, x, z]) =>
      bg.push(poly([[x, 0, z], [x + 0.55, 0, z], [x + 0.55, 0, z + 0.45], [x, 0, z + 0.45]], `fill="${c}"`)));
    bg.push(line([[10.9, 0, 1.5], [11.35, 0, 1.6], [11.7, 0, 1.45]], `stroke="#4b5bd6" stroke-width="1.6"`));
    // coffee menu board
    bg.push(poly([[17.2, 0, 1.6], [20.2, 0, 1.6], [20.2, 0, 2.7], [17.2, 0, 2.7]], `fill="#1d2c24"`));
    [1.85, 2.1, 2.35].forEach((z) => bg.push(line([[17.5, 0, z], [19.4, 0, z]], `stroke="#e8e2d0" stroke-width="1" opacity=".55"`)));
    // glass partitions (with door gaps)
    const glass = [[[8, 0], [8, 6]], [[14, 0], [14, 6]], [[13, 8], [13, 15]], [[0, 6], [3.2, 6]], [[4.8, 6], [10.2, 6]], [[11.8, 6], [17.2, 6]], [[18.8, 6], [W, 6]],
      [[0, 8], [5.7, 8]], [[7.3, 8], [16.7, 8]], [[18.3, 8], [W, 8]]];
    for (const [[ax, ay], [bx, by]] of glass) bg.push(poly([[ax, ay, 0], [bx, by, 0], [bx, by, 1.3], [ax, ay, 1.3]], `class="vo-glass"`) + line([[ax, ay, 1.3], [bx, by, 1.3]], `class="vo-rail"`));

    /* furniture */
    const desk = (x, y, wood = "#a8743f", screens = 1) => {
      box(objs, x, y, 1.6, 0.9, 0, 0.76, wood);
      const dd = x + 0.8 + y + 0.45 + 0.02;
      let s = "";
      for (let k = 0; k < screens; k++) {
        const mx = x + 0.2 + k * 0.7, mw = screens > 1 ? 0.62 : 1.05;
        s += poly([[mx + mw / 2 - 0.05, y + 0.18, 0.76], [mx + mw / 2 + 0.05, y + 0.18, 0.76], [mx + mw / 2 + 0.05, y + 0.18, 0.9], [mx + mw / 2 - 0.05, y + 0.18, 0.9]], `fill="#2a3142"`);
        s += poly([[mx, y + 0.14, 0.88], [mx + mw, y + 0.14, 0.88], [mx + mw, y + 0.14, 1.42], [mx, y + 0.14, 1.42]], `fill="#1e2636"`);
        s += poly([[mx + 0.04, y + 0.15, 0.92], [mx + mw - 0.04, y + 0.15, 0.92], [mx + mw - 0.04, y + 0.15, 1.38], [mx + 0.04, y + 0.15, 1.38]], `class="vo-monitor"`);
        s += line([[mx + 0.12, y + 0.15, 1.27], [mx + mw * 0.6, y + 0.15, 1.27]], `stroke="#4b6fd6" stroke-width="1.4"`);
        s += line([[mx + 0.12, y + 0.15, 1.14], [mx + mw * 0.8, y + 0.15, 1.14]], `stroke="#9fb4e8" stroke-width="1"`);
      }
      s += poly([[x + 0.45, y + 0.5, 0.77], [x + 1.15, y + 0.5, 0.77], [x + 1.15, y + 0.68, 0.77], [x + 0.45, y + 0.68, 0.77]], `fill="#2b3448"`);
      // desk lamp and its warm pool of light
      s += ellipse(x + 1.25, y + 0.5, 0.76, 30, 14, `class="vo-glow"`);
      s += line([[x + 1.45, y + 0.2, 0.76], [x + 1.45, y + 0.2, 1.25], [x + 1.28, y + 0.35, 1.32]], `stroke="#d7b25a" stroke-width="1.6"`);
      s += ellipse(x + 1.27, y + 0.37, 1.3, 4.5, 3, `fill="#ffcf5e"`);
      objs.push({ d: dd, svg: s });
    };
    const stool = (x, y) => objs.push({ d: x + y - 0.05, svg: ellipse(x, y, 0, 7, 3.2, `fill="#0b1124" opacity=".6"`) + line([[x, y, 0], [x, y, 0.4]], `stroke="#3a4257" stroke-width="2"`) + ellipse(x, y, 0.42, 9, 4.5, `fill="#343c52"`) });
    const plant = (x, y) => {
      box(objs, x - 0.25, y - 0.25, 0.5, 0.5, 0, 0.45, "#c46b45");
      const [X, Y] = P(x, y, 0.45);
      objs.push({ d: x + y + 0.05, svg: `<g fill="#3fae6a"><circle cx="${X}" cy="${Y - 10}" r="9"/><circle cx="${X - 7}" cy="${Y - 4}" r="6"/><circle cx="${X + 7}" cy="${Y - 5}" r="6.5"/></g><circle cx="${X + 2}" cy="${Y - 15}" r="5" fill="#57c784"/>` });
    };
    // meeting room: long table, laptops
    box(objs, 1.6, 2.2, 5.3, 1.7, 0, 0.72, "#6b4c35");
    [[2.1, 3.3], [3.5, 3.3], [4.9, 3.3], [3.5, 2.3], [4.9, 2.3]].forEach(([x, y]) => objs.push({ d: x + y + 0.6, svg: poly([[x, y, 0.73], [x + 0.6, y, 0.73], [x + 0.6, y + 0.35, 0.73], [x, y + 0.35, 0.73]], `fill="#c9ced8"`) + poly([[x, y, 0.73], [x + 0.6, y, 0.73], [x + 0.6, y, 1.05], [x, y, 1.05]], `class="vo-monitor"`) }));
    SPOTS.meeting.slice(0, 8).forEach(([x, y]) => stool(x, y));
    plant(7.4, 0.6);
    // idea room: beanbags and a floating bulb
    [["#8b5cf6", 9.6, 3.6], ["#14b8a6", 12.4, 3.6], ["#f97316", 11, 4.9]].forEach(([c, x, y]) => objs.push({ d: x + y - 0.05, svg: ellipse(x, y, 0.12, 15, 8, `fill="${shade(c, 0.6)}"`) + ellipse(x, y, 0.3, 13, 6.5, `fill="${c}"`) }));
    { const [X, Y] = P(11, 2.8, 2.6); objs.push({ d: 30, svg: `<g class="vo-bulb"><circle cx="${X}" cy="${Y}" r="16" fill="#ffd35a" opacity=".18"/><text x="${X}" y="${Y + 6}" text-anchor="middle" font-size="18">💡</text></g>` }); }
    // coffee room: counter, machine, tables, plant
    box(objs, 14.6, 0.15, 6.4, 0.9, 0, 0.95, "#d9d4cc");
    box(objs, 15.1, 0.25, 0.6, 0.5, 0.95, 0.75, "#33333d", 0.4);
    objs.push({ d: 16.4, svg: ellipse(15.45, 0.78, 1.25, 2, 2, `fill="#ff5a5a"`) + ellipse(16.4, 0.6, 0.98, 4, 2, `fill="#f5f1ea"`) + ellipse(16.9, 0.55, 0.98, 4, 2, `fill="#f5f1ea"`) });
    [[16.3, 3.4], [19.6, 3.4]].forEach(([x, y]) => objs.push({ d: x + y, svg: ellipse(x, y, 0, 8, 3.5, `fill="#0b1124" opacity=".6"`) + line([[x, y, 0], [x, y, 0.72]], `stroke="#8a6a4b" stroke-width="2.4"`) + ellipse(x, y, 0.74, 19, 9.5, `fill="#c9a27a"`) + ellipse(x + 0.1, y + 0.1, 0.76, 3.5, 1.8, `fill="#f5f1ea"`) }));
    SPOTS.coffee.slice(0, 6).forEach(([x, y]) => stool(x, y));
    plant(21.3, 5.3); plant(14.5, 5.4);
    // department: one desk cluster per path, plus the server rack the wires run to
    CLUSTERS.forEach(([cx, cy], i) => {
      if (paths[i]) bg.push(poly([[cx - 0.25, cy - 0.2], [cx + 3.65, cy - 0.2], [cx + 3.65, cy + 2.75], [cx - 0.25, cy + 2.75]], `fill="${paths[i].accent}" opacity=".17" stroke="${paths[i].accent}" stroke-opacity=".6" stroke-dasharray="4 4"`));
      desk(cx, cy); desk(cx + 1.8, cy);
      stool(cx + 0.8, cy + 1.45); stool(cx + 2.6, cy + 1.45);
      const p = paths[i];
      if (p) { const [X, Y] = P(cx + 3.4, cy + 1.75); tags.push( `<g class="vo-cluster-tag"><rect x="${(X - 24).toFixed(1)}" y="${(Y - 9).toFixed(1)}" width="48" height="16" rx="8" fill="#0b1226" stroke="${p.accent}" stroke-opacity=".7"/><text x="${X.toFixed(1)}" y="${(Y + 3).toFixed(1)}" text-anchor="middle" fill="${p.accent}">${esc(p.code)}</text></g>`); }
    });
    box(objs, 12.2, 8.15, 0.6, 0.6, 0, 1.5, "#2a3350");
    { let leds = ""; for (let k = 0; k < 4; k++) leds += ellipse(12.82, 8.3 + k * 0.12, 1.2 - k * 0.2, 1.3, 1.3, `class="vo-led" style="animation-delay:${k * 0.4}s"`); objs.push({ d: 21.2, svg: leds }); }
    plant(0.5, 14.4);
    // my office: big desk with two screens, bookshelf, couch, plant
    box(objs, 16, 10.2, 2.8, 1, 0, 0.78, "#8b5e34");
    { const s0 = objs.length; desk(16.6, 10.25, "#8b5e34", 2); objs.splice(s0, 2); }
    stool(17.4, 11.9);
    box(objs, 13.15, 8.8, 0.5, 2.8, 0, 1.9, "#5b3b26");
    { let books = ""; [0.25, 0.85, 1.45].forEach((z) => { for (let k = 0; k < 6; k++) { const y = 9 + k * 0.42; books += poly([[13.66, y, z], [13.66, y + 0.32, z], [13.66, y + 0.32, z + 0.45], [13.66, y, z + 0.45]], `fill="${["#e06c5a", "#5ea7e0", "#f2c14e", "#6cc08b", "#b48ce0", "#e8e2d0"][(k + z * 10) % 6 | 0]}"`); } }); objs.push({ d: 13.4 + 10.2 + 0.1, svg: books }); }
    box(objs, 19.8, 13.2, 1.8, 1.2, 0, 0.42, "#3d5a80");
    box(objs, 21.3, 13.2, 0.35, 1.2, 0.42, 0.45, "#34506f");
    plant(21.4, 8.7);
    return { bg: bg.join(""), objs, tags: tags.join("") };
  }

  /* ---------- characters ---------- */
  const SKINS = ["#f6d2b8", "#e9b48f", "#c98e65", "#a8694a", "#7a4a33"];
  const HAIRS = ["#1d1a1f", "#3b2618", "#6b3f22", "#a8743f", "#2b2340", "#c2452f"];
  const hash = (n) => { let h = (n * 2654435761) >>> 0; h ^= h >>> 13; return h >>> 0; };
  function sprite(p) {
    const h = hash(p.studentId), skin = SKINS[h % 5], hair = HAIRS[(h >> 4) % 6], style = (h >> 8) % 3;
    const shirt = p.accent || "#9aa4b2", dark = shade(shirt, 0.72), pants = "#283044";
    const path = p.path;
    let behind = "", body = "", head = "", hand = "";
    if (path === "be") behind = `<path d="M-9.5 -24 Q0 -45 9.5 -24 Z" fill="${dark}"/>`;
    if (path === "pm") { body = `<path d="M0 -24 l1.8 2.2 -1.8 7.5 -1.8 -7.5z" fill="#c8323c"/>`; hand = `<rect x="6.5" y="-21" width="6.5" height="8.5" rx="1" fill="#efe3c6" stroke="#7a5230" stroke-width="1"/><line x1="8" y1="-18" x2="11.5" y2="-18" stroke="#9aa4b2"/><line x1="8" y1="-16" x2="11.5" y2="-16" stroke="#9aa4b2"/>`; }
    if (path === "be") body = `<line x1="-2" y1="-23" x2="-2" y2="-18" stroke="#e8e2d0" stroke-width="1"/><line x1="2" y1="-23" x2="2" y2="-18" stroke="#e8e2d0" stroke-width="1"/>`;
    if (path === "qa") hand = `<line x1="9.2" y1="-14.5" x2="7.2" y2="-11.5" stroke="#d7dde8" stroke-width="2" stroke-linecap="round"/><circle cx="11" cy="-17.5" r="3.6" fill="rgba(170,220,255,.45)" stroke="#d7dde8" stroke-width="1.4"/>`;
    if (path === "uiux") hand = `<rect x="8" y="-22" width="2" height="10" rx="1" transform="rotate(25 9 -17)" fill="#ffd35a"/>`;
    let hairSvg = [
      `<path d="M-8.3 -32 A8.3 8.3 0 0 1 8.3 -32 Q4 -36.5 0 -35 Q-4 -36.5 -8.3 -32Z" fill="${hair}"/>`,
      `<path d="M-8.8 -32 A8.8 8.8 0 0 1 8.8 -32 V-23 H5.8 V-30 Q0 -34 -5.8 -30 V-23 H-8.8Z" fill="${hair}"/>`,
      `<path d="M-8.3 -32 A8.3 8.3 0 0 1 8.3 -32 Q0 -37 -8.3 -32Z" fill="${hair}"/><circle cx="0" cy="-41.5" r="3.8" fill="${hair}"/>`,
    ][style];
    if (path === "devops") hairSvg = `<path d="M-9.2 -33.5 A9.2 8.5 0 0 1 9.2 -33.5Z" fill="#f2c12e"/><rect x="-10.5" y="-34.6" width="21" height="2.4" rx="1.2" fill="#d9a400"/><rect x="-1.2" y="-42" width="2.4" height="8" rx="1" fill="#d9a400"/>`;
    if (path === "fe") head = `<path d="M-8.8 -32 A8.8 8.8 0 0 1 8.8 -32" stroke="#2d3346" stroke-width="2.2" fill="none"/><rect x="-10.8" y="-34.5" width="3.8" height="6.5" rx="1.6" fill="#ff6b8b"/><rect x="7" y="-34.5" width="3.8" height="6.5" rx="1.6" fill="#ff6b8b"/>`;
    if (path === "uiux") head = `<ellipse cx="1.5" cy="-38.6" rx="8.8" ry="3.3" fill="#e0457b"/><circle cx="2.2" cy="-41.8" r="1.4" fill="#e0457b"/>`;
    const star = p.isLead ? `<path class="av-star" d="M0 -54 l1.9 3.9 4.3.6 -3.1 3 .7 4.3 -3.8-2 -3.8 2 .7-4.3 -3.1-3 4.3-.6z" fill="#ffd35a" stroke="#8a6a00" stroke-width=".6"/>` : "";
    return `<ellipse class="av-shadow" cx="0" cy="0" rx="9.5" ry="4"/>
      <g class="av-body">
        <rect class="leg leg-l" x="-4.7" y="-11.5" width="4" height="11.5" rx="1.8" fill="${pants}"/>
        <rect class="leg leg-r" x="0.7" y="-11.5" width="4" height="11.5" rx="1.8" fill="${pants}"/>
        ${behind}
        <rect class="arm arm-l" x="-10" y="-23.5" width="3.6" height="11.5" rx="1.8" fill="${dark}"/>
        <rect class="arm arm-r" x="6.4" y="-23.5" width="3.6" height="11.5" rx="1.8" fill="${dark}"/>
        <rect x="-7.2" y="-25.5" width="14.4" height="15.5" rx="5.5" fill="${shirt}"/>
        ${body}${hand}
        <circle cx="0" cy="-32" r="8.2" fill="${skin}"/>
        ${hairSvg}
        <circle cx="-2.7" cy="-31.2" r="1.15" fill="#1d1d24"/><circle cx="2.7" cy="-31.2" r="1.15" fill="#1d1d24"/>
        <path d="M-2.2 -27.6 Q0 -26 2.2 -27.6" stroke="#1d1d24" stroke-width=".95" fill="none" stroke-linecap="round"/>
        ${head}${star}
      </g>`;
  }
  const firstName = (n) => String(n || "").split(/\s+/)[0] || "?";

  /* ---------- state ---------- */
  const st = {
    root: null, opts: {}, data: null, room: null, project: null, timer: null, beat: null, tick: 0, visible: true, io: null,
    av: new Map(), shownEmote: new Map(), shownChat: new Set(), loading: false, placed: false, err: "",
  };
  const api = async (url, o = {}) => {
    const r = await fetch(url, { credentials: "same-origin", headers: { "Content-Type": "application/json" }, ...o });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.error || "Something went wrong."); e.status = r.status; throw e; }
    return d;
  };
  const toast = (m) => (window.toast ? window.toast(m) : console.warn(m));
  const me = () => st.data && st.data.people.find((p) => p.you);
  const pathIndex = (pid) => { const i = st.data.paths.findIndex((p) => p.id === pid); return i < 0 ? 5 : i % 6; };
  const ago = (iso) => { const s = (Date.now() - new Date(iso)) / 1000; if (s < 90) return "just now"; if (s < 3600) return Math.round(s / 60) + " min ago"; if (s < 86400) return Math.round(s / 3600) + " h ago"; return Math.round(s / 86400) + " d ago"; };
  const hm = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  /* ---------- layout: who stands where ---------- */
  function targets() {
    const out = new Map(), byRoom = {};
    for (const p of st.data.people) {
      let room, away = false;
      if (p.you) room = st.room;
      else if (!p.online) { if (!p.teammate) continue; room = "dept"; away = true; }
      else if (p.room === "own") continue;
      else room = p.room;
      (byRoom[room] = byRoom[room] || []).push({ p, away });
    }
    const place = (list, spots) => {
      list.sort((a, b) => (a.p.you - b.p.you) || (a.away - b.away) || (a.p.studentId - b.p.studentId));
      list.forEach((e, i) => {
        const base = spots[i % spots.length], lap = Math.floor(i / spots.length);
        out.set(e.p.studentId, { x: base[0] + lap * 0.45, y: base[1] - lap * 0.35, room: e.p.you ? st.room : e.away ? "dept" : e.p.room, away: e.away, p: e.p });
      });
    };
    for (const [room, list] of Object.entries(byRoom)) {
      if (room === "dept") {
        const groups = {};
        list.forEach((e) => (groups[pathIndex(e.p.path)] = groups[pathIndex(e.p.path)] || []).push(e));
        for (const [ci, g] of Object.entries(groups)) place(g, clusterSpots(+ci));
      } else place(list, SPOTS[room]);
    }
    return out;
  }
  function route(from, to) {
    const a = roomAt(from.x, from.y), b = to.room;
    const pts = [];
    if (a !== b) {
      if (a === "hall") pts.push([from.x, HALL_Y]);
      else { pts.push(doorIn(a)); pts.push([ROOMS[a].door, HALL_Y]); }
      pts.push([ROOMS[b].door, HALL_Y]); pts.push(doorIn(b));
    }
    pts.push([to.x, to.y]);
    return pts.filter((p, i) => i === 0 ? Math.hypot(p[0] - from.x, p[1] - from.y) > 0.05 : Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.05);
  }
  const tf = (x, y) => { const [X, Y] = P(x, y); return `translate(${X.toFixed(1)}px, ${Y.toFixed(1)}px)`; };

  function avatarEl(p) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "av" + (p.you ? " av-you" : ""));
    g.dataset.id = p.studentId;
    const name = p.you ? "You" : firstName(p.name);
    const w = Math.max(30, name.length * 5.8 + 14);
    g.innerHTML = `<g class="av-s">${p.you ? `<ellipse class="av-ring" cx="0" cy="0" rx="14" ry="6.5" stroke="${p.accent || "#f4cf82"}"/>` : ""}
      <g class="av-flip">${sprite(p)}</g>
      <g class="av-tag"><rect x="${(-w / 2).toFixed(1)}" y="-${p.isLead ? 70 : 60}" width="${w.toFixed(1)}" height="14" rx="7"/><text x="0" y="-${p.isLead ? 60 : 50}" text-anchor="middle">${esc(name)}</text></g>
      <g class="av-zz"><text x="10" y="-40">💤</text></g>
      <g class="av-say" hidden></g></g>`;
    const t = document.createElementNS("http://www.w3.org/2000/svg", "title");
    t.textContent = `${p.you ? "You" : p.name}${p.pathName ? " · " + p.pathName : ""}${p.role ? " · " + p.role : ""}`;
    g.prepend(t);
    return g;
  }
  function sortLayer() {
    const layer = st.root && st.root.querySelector(".vo-objs");
    if (!layer) return;
    const kids = [...layer.children].filter((k) => !k.classList.contains("walking"));
    kids.sort((a, b) => a.dataset.d - b.dataset.d).forEach((k) => layer.appendChild(k));
    layer.querySelectorAll(".av.walking").forEach((k) => layer.appendChild(k));
  }
  async function walk(a, to) {
    const token = (a.token = (a.token || 0) + 1);
    const el = a.el;
    el.getAnimations().forEach((x) => x.cancel());
    const pts = route(a, to);
    if (reduce() || !pts.length) { a.x = to.x; a.y = to.y; el.style.transform = tf(a.x, a.y); el.dataset.d = a.x + a.y + 0.05; sortLayer(); return; }
    el.classList.add("walking");
    const layer = el.parentNode; layer.appendChild(el);
    for (const [x, y] of pts) {
      if (a.token !== token) return;
      const dist = Math.hypot(x - a.x, y - a.y);
      const [X0] = P(a.x, a.y), [X1] = P(x, y);
      if (Math.abs(X1 - X0) > 0.5) el.querySelector(".av-flip").classList.toggle("left", X1 < X0);
      const anim = el.animate([{ transform: tf(a.x, a.y) }, { transform: tf(x, y) }], { duration: (dist / 4.2) * 1000, easing: "linear", fill: "forwards" });
      try { await anim.finished; } catch { return; }
      if (a.token !== token) return;
      a.x = x; a.y = y; el.style.transform = tf(x, y); anim.cancel();
    }
    el.classList.remove("walking");
    el.querySelector(".av-flip").classList.remove("left");
    el.dataset.d = a.x + a.y + 0.05;
    sortLayer();
  }
  function layout(initial) {
    const layer = st.root.querySelector(".vo-objs");
    const tg = targets();
    for (const [id, a] of st.av) {
      if (!tg.has(id)) {
        st.av.delete(id); a.token++; a.el.classList.add("av-leave");
        setTimeout(() => a.el.remove(), 450);
      }
    }
    for (const [id, t] of tg) {
      let a = st.av.get(id);
      if (!a) {
        const el = avatarEl(t.p);
        const spawn = initial || t.away || reduce() ? { x: t.x, y: t.y } : { x: W + 0.6, y: HALL_Y };
        a = { el, x: spawn.x, y: spawn.y, token: 0 };
        el.style.transform = tf(a.x, a.y); el.dataset.d = a.x + a.y + 0.05;
        layer.appendChild(el); st.av.set(id, a);
        el.addEventListener("click", () => { if (t.p.you) return; const cur = st.data.people.find((q) => q.studentId === id); if (cur && cur.online && cur.room !== "own") go(cur.room); });
      }
      a.el.classList.toggle("av-away", t.away);
      a.p = t.p;
      if (Math.hypot(a.x - t.x, a.y - t.y) > 0.05 || a.room !== t.room) { a.room = t.room; walk(a, t); }
    }
    sortLayer();
    showBubbles();
  }
  function say(id, html, ms, cls) {
    const a = st.av.get(id); if (!a) return;
    const g = a.el.querySelector(".av-say");
    g.innerHTML = html; g.setAttribute("class", "av-say " + cls); g.removeAttribute("hidden");
    clearTimeout(a.sayT); a.sayT = setTimeout(() => g.setAttribute("hidden", ""), ms);
  }
  const emoteHtml = (e) => `<circle cx="13" cy="-62" r="11"/><text x="13" y="-57.5" text-anchor="middle" font-size="13">${e}</text>`;
  function chatHtml(text) {
    const t = text.length > 26 ? text.slice(0, 25) + "…" : text;
    const w = Math.min(170, t.length * 5.4 + 16);
    return `<rect x="${(-w / 2).toFixed(1)}" y="-92" width="${w.toFixed(1)}" height="20" rx="10"/><path d="M-4 -72.5 L0 -66 L4 -72.5Z"/><text x="0" y="-78.5" text-anchor="middle">${esc(t)}</text>`;
  }
  function showBubbles() {
    const now = new Date(st.data.now).getTime();
    for (const p of st.data.people) {
      if (!p.emote || p.you) continue;
      const left = 6500 - (now - new Date(p.emoteAt).getTime());
      if (left > 600 && st.shownEmote.get(p.studentId) !== p.emoteAt) { st.shownEmote.set(p.studentId, p.emoteAt); say(p.studentId, emoteHtml(p.emote), left, "av-emote"); }
    }
    for (const m of st.data.coffee) {
      if (st.shownChat.has(m.id)) continue;
      st.shownChat.add(m.id);
      const fresh = now - new Date(m.createdAt).getTime() < 20000;
      const a = st.av.get(m.authorId);
      if (fresh && st.placed && a && a.room === "coffee") say(m.authorId, chatHtml(m.body), 6000, "av-chat");
    }
  }

  /* ---------- the side panel ---------- */
  function whereText(p) {
    if (!p.online) return p.lastSeen ? `Offline · seen ${ago(p.lastSeen)}` : "Hasn’t visited yet";
    if (p.room === "own") return "🏠 In their office";
    if (p.room === "dept") return `🏢 ${p.pathCode || ""} department`.replace("  ", " ");
    return `${ROOMS[p.room].emoji} ${ROOMS[p.room].name}`;
  }
  const dot = (p) => `<span class="vo-dot${p.online ? " on" : ""}" aria-hidden="true"></span>`;
  const chip = (p) => `<span class="vo-chip" style="--c:${esc(p.accent || "#9aa4b2")}">${esc(firstName(p.name))}</span>`;
  function hereHtml() {
    const others = st.data.people.filter((p) => !p.you && p.online && p.room === st.room && (st.room !== "dept" || p.path === me().path));
    return others.length ? `<p class="vo-here-list">Here with you: ${others.map(chip).join(" ")}</p>` : `<p class="vo-here-list muted">No one else is here right now.</p>`;
  }
  function ideasHtml() {
    const list = st.data.ideas.slice().sort((a, b) => b.likes - a.likes || b.id - a.id);
    if (!list.length) return `<p class="muted vo-empty">No ideas pinned yet. Be the first!</p>`;
    return list.map((n) => `<div class="vo-idea" style="--c:${esc(n.accent || "#ffd35a")}"><p>${esc(n.body)}</p>
      <div class="vo-idea-meta"><span>${esc(n.mine ? "You" : firstName(n.author))} · ${ago(n.createdAt)}</span>
      <span><button type="button" class="vo-like" data-like="${n.id}" aria-pressed="${n.liked}" aria-label="Like this idea, ${n.likes} likes">👍 ${n.likes}</button>${n.mine ? `<button type="button" class="vo-x" data-del="${n.id}" aria-label="Remove your idea">✕</button>` : ""}</span></div></div>`).join("");
  }
  function coffeeHtml() {
    if (!st.data.coffee.length) return `<p class="muted vo-empty">It’s quiet in here. Say hi! ☕</p>`;
    return st.data.coffee.map((m) => `<div class="vo-line${m.mine ? " me" : ""}"><b>${esc(m.mine ? "You" : firstName(m.author))}</b> ${esc(m.body)} <time>${hm(m.createdAt)}</time></div>`).join("");
  }
  function deptHtml() {
    const mine = st.data.people.filter((p) => p.dept);
    const on = mine.filter((p) => p.online).length;
    return `<p class="vo-sub">${on} of ${mine.length} online</p><ul class="vo-list">${mine.map((p) => `<li>${dot(p)}<span class="vo-n">${esc(p.you ? "You" : p.name)}</span><span class="vo-w">${p.you ? "here" : esc(whereText(p))}</span></li>`).join("")}</ul>`;
  }
  function deskHtml() {
    const d = st.opts.desk ? st.opts.desk() : null, m = me();
    const proj = st.data.project, mem = proj && proj.members;
    let html = `<div class="vo-me"><svg viewBox="-16 -58 32 62" class="vo-me-av" aria-hidden="true">${sprite(m)}</svg><div><strong>${esc(m.name)}</strong><span>${esc(m.pathName || "")}</span>${m.role && m.role !== m.pathName ? `<span>${esc(m.role)}</span>` : ""}${m.isLead ? `<span>⭐ Team lead</span>` : ""}</div></div>`;
    if (d) {
      html += `<div class="vo-todo">`;
      if (d.returned) html += `<button type="button" class="vo-act" data-mod="${esc(d.returned.id)}">🔁 Fix “${esc(d.returned.title)}”</button>`;
      if (d.next) html += `<button type="button" class="vo-act" data-mod="${esc(d.next.id)}">▶ Next up: ${esc(d.next.title)}</button>`;
      if (d.waiting) html += `<p class="muted">⏳ ${d.waiting} output${d.waiting > 1 ? "s" : ""} waiting for review</p>`;
      if (!d.returned && !d.next && !d.waiting) html += `<p class="muted">🎉 Every module is done. Nice work!</p>`;
      html += `</div>`;
    }
    void mem;
    return html;
  }
  function roomBody(r) {
    const proj = st.data.project, label = esc(st.data.scopeLabel);
    if (r === "meeting") {
      if (!proj) return `<p class="muted">The meeting room is for project teams. When the SandBox team puts you on a project, your calls start here.</p>`;
      return `<div class="vo-btns">${proj.meetingUrl ? `<a class="btn btn-accent btn-sm" href="${esc(proj.meetingUrl)}" target="_blank" rel="noopener noreferrer">🎧 Join the video call</a>` : `<p class="muted">No call link yet. The SandBox team will add one.</p>`}
        ${proj.repoUrl ? `<a class="btn btn-ghost btn-sm" href="${esc(proj.repoUrl)}" target="_blank" rel="noopener noreferrer">📁 Project files</a>` : ""}</div>`;
    }
    if (r === "idea") return `<form class="vo-form" data-kind="idea" novalidate><label class="sr-only" for="voIdea">Your idea</label><textarea id="voIdea" name="body" rows="2" maxlength="280" placeholder="Pin an idea for ${label}…"></textarea>
        <div class="vo-form-row"><span class="form-err" role="alert"></span><button class="btn btn-accent btn-sm" type="submit">📌 Pin idea</button></div></form><div class="vo-ideas" data-dyn="ideas">${ideasHtml()}</div>`;
    if (r === "coffee") return `<div class="vo-chat" data-dyn="coffee" aria-live="polite">${coffeeHtml()}</div>
        <form class="vo-form vo-chat-form" data-kind="coffee" novalidate><div class="vo-quick">${["☕", "🍩", "👋", "😂", "🙌"].map((e) => `<button type="button" data-ins="${e}" aria-label="Add ${e}">${e}</button>`).join("")}</div>
        <div class="vo-form-row"><label class="sr-only" for="voCoffee">Message</label><input id="voCoffee" name="body" maxlength="300" autocomplete="off" placeholder="Chat with ${label}"><button class="btn btn-accent btn-sm" type="submit">Send</button></div><span class="form-err" role="alert"></span></form>`;
    if (r === "own") return `<div data-dyn="desk">${deskHtml()}</div>`;
    return `<div data-dyn="dept">${deptHtml()}</div>`;
  }
  function peopleHtml() {
    const list = st.data.people.filter((p) => !p.you).sort((a, b) => (b.teammate - a.teammate) || (b.online - a.online) || a.name.localeCompare(b.name));
    if (!list.length) return `<p class="muted">No one else here yet. Teammates and people on your path show up as they join.</p>`;
    const row = (p) => `<li>${dot(p)}<span class="vo-mini" style="--c:${esc(p.accent || "#9aa4b2")}" aria-hidden="true">${esc(firstName(p.name)[0])}</span>
      <span class="vo-who"><span class="vo-n">${esc(p.name)}${p.isLead ? " ⭐" : ""}</span><span class="vo-r">${esc(p.role || p.pathName || "")}${p.teammate ? "" : " · department"}</span></span>
      <span class="vo-w">${esc(whereText(p))}</span>
      ${p.online && p.room !== "own" && p.room !== st.room ? `<button type="button" class="vo-go" data-go="${p.room}" aria-label="Go to ${esc(ROOMS[p.room].name)}">Go</button>` : p.email ? `<a class="vo-go" href="mailto:${esc(p.email)}" aria-label="Email ${esc(p.name)}">✉️</a>` : ""}</li>`;
    return `<ul class="vo-list">${list.map(row).join("")}</ul>`;
  }
  function renderPanel() {
    const r = st.room, R = ROOMS[r];
    const name = r === "dept" ? `${me().pathCode || ""} department`.trim() : R.name;
    st.root.querySelector(".vo-room").innerHTML = `<div class="vo-here-top"><span class="vo-here-emoji" aria-hidden="true">${R.emoji}</span><div><span class="label">You’re in</span><h3>${esc(name)}</h3></div></div>
      <p class="vo-blurb">${esc(R.blurb)}</p><div data-dyn="here">${hereHtml()}</div>${roomBody(r)}`;
    st.root.querySelectorAll(".vo-rooms button").forEach((b) => b.setAttribute("aria-current", b.dataset.room === r));
    st.root.querySelectorAll(".vo-label").forEach((g) => g.classList.toggle("is-here", g.dataset.room === r));
    const chat = st.root.querySelector(".vo-chat"); if (chat) chat.scrollTop = chat.scrollHeight;
    updateDynamic();
  }
  function updateDynamic() {
    const set = (k, html) => { const el = st.root.querySelector(`[data-dyn="${k}"]`); if (el && el.innerHTML !== html) { if (k === "coffee") { const near = el.scrollHeight - el.scrollTop - el.clientHeight < 40; el.innerHTML = html; if (near) el.scrollTop = el.scrollHeight; } else el.innerHTML = html; } };
    set("here", hereHtml()); set("ideas", ideasHtml()); set("coffee", coffeeHtml()); set("dept", deptHtml());
    if (!st.root.querySelector(".vo-room [data-dyn=desk]:focus-within")) set("desk", deskHtml());
    const ppl = st.root.querySelector(".vo-people-list"); const html = peopleHtml(); if (ppl.innerHTML !== html) ppl.innerHTML = html;
    st.root.querySelectorAll(".vo-label").forEach((g) => {
      const k = g.dataset.room;
      const n = st.data.people.filter((p) => (p.you ? st.room === k : p.online && p.room === k)).length;
      g.querySelector(".vo-count").textContent = n ? ` · ${n}` : "";
    });
    const on = st.data.people.filter((p) => !p.you && p.online).length;
    st.root.querySelector(".vo-online").textContent = on ? `${on} online now` : "Only you right now";
  }

  /* ---------- building the widget ---------- */
  function build() {
    const d = st.data, m = me();
    const { bg, objs, tags } = scenery(d.paths, m.accent || "#f4cf82");
    objs.sort((a, b) => a.d - b.d);
    const labels = ROOM_ORDER.map((k) => {
      const [x0, , x1, y1] = ROOMS[k].rect;
      const [X, Y] = P(k === "dept" ? 9.3 : (x0 + x1) / 2, y1 - 0.35);
      const text = k === "dept" ? `${ROOMS[k].emoji} ${m.pathCode || ""} Department`.replace("  ", " ") : `${ROOMS[k].emoji} ${ROOMS[k].name}`;
      const w = text.length * 6.1 + 30;
      return `<g class="vo-label" data-room="${k}" role="button" tabindex="-1"><rect x="${(X - w / 2).toFixed(1)}" y="${(Y - 11).toFixed(1)}" width="${w.toFixed(1)}" height="20" rx="10"/><text x="${X.toFixed(1)}" y="${(Y + 3.5).toFixed(1)}" text-anchor="middle">${esc(text)}<tspan class="vo-count"></tspan></text></g>`;
    }).join("");
    const projSel = d.projects.length > 1 ? `<label class="vo-proj"><span class="sr-only">Project</span><select>${d.projects.map((p) => `<option value="${p.id}"${d.project && p.id === d.project.id ? " selected" : ""}>${esc(p.name)}${p.status === "completed" ? " (done)" : ""}</option>`).join("")}</select></label>` : "";
    st.root.innerHTML = `<div class="vo-top">
        <nav class="vo-rooms" aria-label="Rooms">${ROOM_ORDER.map((k) => `<button type="button" data-room="${k}">${ROOMS[k].emoji} ${k === "dept" ? "Department" : ROOMS[k].name}</button>`).join("")}</nav>
        <div class="vo-emotes" role="group" aria-label="React">${d.emotes.slice(0, 5).map((e) => `<button type="button" data-emote="${e}" aria-label="React with ${e}">${e}</button>`).join("")}</div>
      </div>
      <div class="vo-main">
        <div class="vo-map-wrap"><div class="vo-map">
          <svg viewBox="-335 -105 805 575" role="img" aria-label="Office floor with the meeting room, idea room, coffee room, your office and the department. Your character is labelled You.">
            <defs><radialGradient id="voGlow"><stop offset="0" stop-color="#ffc861" stop-opacity=".55"/><stop offset="1" stop-color="#ffc861" stop-opacity="0"/></radialGradient>
            <linearGradient id="voScreen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a64d8"/><stop offset="1" stop-color="#1a2d72"/></linearGradient></defs>
            <g class="vo-bg">${bg}</g>
            <g class="vo-objs">${objs.map((o) => `<g data-d="${o.d.toFixed(2)}">${o.svg}</g>`).join("")}</g>
            <g class="vo-labels">${tags}${labels}</g>
          </svg></div>
          <div class="vo-legend"><span class="vo-online"></span><span class="vo-hint">Tap a room to walk there</span>${projSel}</div>
        </div>
        <aside class="vo-side">
          <div class="vo-card vo-room"></div>
          <div class="vo-card vo-people"><h3>Who’s where</h3><div class="vo-people-list"></div></div>
        </aside>
      </div>`;
    st.av.clear();
    layout(true);
    st.placed = true;
    renderPanel();
    centerOnMe();
  }
  function centerOnMe() {
    const wrap = st.root.querySelector(".vo-map-wrap"), a = st.av.get(me().studentId);
    if (!wrap || !a || wrap.scrollWidth <= wrap.clientWidth) return;
    const [X] = P(a.x, a.y);
    wrap.scrollLeft = ((X + 335) / 805) * wrap.scrollWidth - wrap.clientWidth / 2;
  }

  /* ---------- actions ---------- */
  function go(room) {
    if (!ROOMS[room] || room === st.room) return;
    st.room = room;
    const m = me(); if (m) m.room = room;
    layout(false); renderPanel();
    api("/api/student/office/presence", { method: "PUT", body: JSON.stringify({ room }) }).catch(() => {});
  }
  function emote(e) {
    say(me().studentId, emoteHtml(e), 6000, "av-emote");
    api("/api/student/office/presence", { method: "PUT", body: JSON.stringify({ room: st.room, emote: e }) }).catch(() => {});
  }
  async function load(first) {
    if (st.loading) return;
    st.loading = true;
    try {
      const q = st.project ? "?project=" + st.project : "";
      const d = await api("/api/student/office" + q);
      const firstLoad = !st.data || first;
      st.data = d; st.err = "";
      if (firstLoad) {
        const m = me();
        st.room = m.lastSeen && Date.now() - new Date(m.lastSeen) < 30 * 60 * 1000 && ROOMS[m.room] ? m.room : "own";
        m.room = st.room; m.online = true;
        d.coffee.forEach((c) => st.shownChat.add(c.id));
        build();
        api("/api/student/office/presence", { method: "PUT", body: JSON.stringify({ room: st.room }) }).catch(() => {});
      } else {
        const m = me(); m.room = st.room; m.online = true;
        layout(false); updateDynamic();
      }
    } catch (err) {
      if (!st.data && st.root) st.root.innerHTML = `<p class="muted">${esc(err.message)}</p>`;
    } finally { st.loading = false; }
  }
  function onClick(e) {
    const t = e.target;
    const roomBtn = t.closest(".vo-rooms button, .vo-label, .vo-go[data-go]");
    if (roomBtn) { go(roomBtn.dataset.room || roomBtn.dataset.go); return; }
    const floor = t.closest(".vo-floor"); if (floor) { go(floor.dataset.room); return; }
    const em = t.closest("[data-emote]"); if (em) { emote(em.dataset.emote); return; }
    const like = t.closest("[data-like]");
    if (like) {
      like.disabled = true;
      api(`/api/student/office/notes/${like.dataset.like}/like`, { method: "POST" }).then((r) => {
        const n = st.data.ideas.find((x) => x.id === +like.dataset.like); if (n) { n.likes = r.likes; n.liked = r.liked; }
        updateDynamic();
      }).catch((er) => { toast(er.message); like.disabled = false; });
      return;
    }
    const del = t.closest("[data-del]");
    if (del) {
      api(`/api/student/office/notes/${del.dataset.del}`, { method: "DELETE" }).then(() => { st.data.ideas = st.data.ideas.filter((x) => x.id !== +del.dataset.del); updateDynamic(); }).catch((er) => toast(er.message));
      return;
    }
    const ins = t.closest("[data-ins]");
    if (ins) { const inp = st.root.querySelector("#voCoffee"); inp.value += ins.dataset.ins; inp.focus(); return; }
    const mod = t.closest("[data-mod]");
    if (mod && window.Portal) window.Portal.showModule(mod.dataset.mod);
  }
  async function onSubmit(e) {
    const f = e.target.closest(".vo-form"); if (!f) return;
    e.preventDefault();
    const kind = f.dataset.kind, inp = f.body, err = f.querySelector(".form-err");
    const body = inp.value.trim(); err.textContent = "";
    if (!body) { err.textContent = kind === "idea" ? "Write your idea first." : "Write a message first."; inp.focus(); return; }
    const btn = f.querySelector("[type=submit]"); btn.disabled = true;
    try {
      await api("/api/student/office/notes", { method: "POST", body: JSON.stringify({ kind, body, project: st.data.project ? st.data.project.id : undefined }) });
      inp.value = "";
      if (kind === "coffee") say(me().studentId, chatHtml(body), 6000, "av-chat");
      await load();
      const chat = st.root.querySelector(".vo-chat"); if (chat) chat.scrollTop = chat.scrollHeight;
    } catch (er) { err.textContent = er.message; }
    finally { btn.disabled = false; inp.focus(); }
  }
  function onKey(e) {
    const g = e.target.closest && e.target.closest(".vo-label");
    if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); go(g.dataset.room); }
  }
  function onChange(e) {
    if (e.target.closest(".vo-proj")) { st.project = +e.target.value; st.shownChat.clear(); load(true); }
  }
  function heartbeat() { if (!document.hidden && st.room) api("/api/student/office/presence", { method: "PUT", body: JSON.stringify({ room: st.room }) }).catch(() => {}); }
  function poll() { st.tick++; if (document.hidden) return; if (st.visible || st.tick % 5 === 0) load(); }
  const onVis = () => { if (!document.hidden && st.root) { heartbeat(); load(); } };
  const onLeave = () => { try { navigator.sendBeacon("/api/student/office/leave"); } catch { /* ignore */ } };

  function mount(container, opts = {}) {
    if (!container) return unmount();
    st.opts = opts;
    if (!st.root) {
      st.root = document.createElement("div");
      st.root.className = "vo";
      st.root.addEventListener("click", onClick);
      st.root.addEventListener("submit", onSubmit);
      st.root.addEventListener("keydown", onKey);
      st.root.addEventListener("change", onChange);
      st.root.innerHTML = `<p class="muted vo-loading">Opening the office…</p>`;
    }
    if (st.root.parentNode !== container) container.appendChild(st.root);
    if (!st.timer) {
      st.timer = setInterval(poll, 6000);
      st.beat = setInterval(heartbeat, 25000);
      document.addEventListener("visibilitychange", onVis);
      addEventListener("pagehide", onLeave);
      if ("IntersectionObserver" in window) { st.io = new IntersectionObserver((es) => { st.visible = es.some((x) => x.isIntersecting); }); st.io.observe(st.root); }
      load(true);
    } else if (st.data) updateDynamic();
  }
  function unmount() {
    if (!st.root) return;
    clearInterval(st.timer); clearInterval(st.beat); st.timer = st.beat = null;
    document.removeEventListener("visibilitychange", onVis);
    removeEventListener("pagehide", onLeave);
    if (st.io) st.io.disconnect();
    onLeave();
    st.root.remove(); st.root = null; st.data = null; st.av.clear(); st.placed = false;
  }
  window.VOffice = { mount, unmount, go };
})();
