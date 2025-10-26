// ================== Konstantes un sākotnējais stāvoklis ==================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });

function resize() {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
}
addEventListener('resize', resize); resize();

const UI = {
  start: document.getElementById('start'),
  over: document.getElementById('over'),
  map: document.getElementById('map'),
  btnPlay: document.getElementById('btnPlay'),
  btnMap: document.getElementById('btnMap'),
  btnRetry: document.getElementById('btnRetry'),
  btnToMap: document.getElementById('btnToMap'),
  btnRunFromMap: document.getElementById('btnRunFromMap'),
  btnReset: document.getElementById('btnReset'),
  btnBack: document.getElementById('btnBack'),
  score: document.getElementById('score'),
  best: document.getElementById('best'),
  coins: document.getElementById('coins'),
  finalDist: document.getElementById('finalDist'),
  finalCoins: document.getElementById('finalCoins'),
  progressPct: document.getElementById('progressPct'),
  mapCanvas: document.getElementById('mapCanvas'),
  mapProgress: document.getElementById('mapProgress'),
  mapRemain: document.getElementById('mapRemain'),
};

const STATE = {
  mode: 'menu', // menu | run | over | map | win
  rngSeed: Math.floor(Math.random()*1e9),
};

// "Lielā karte" — kopējais ceļš (metros) līdz mājām
const JOURNEY = {
  total: 5000, // 5 km (vari mainīt)
  progress: Number(localStorage.getItem('rainers_progress') || 0),
  coins: Number(localStorage.getItem('rainers_coins') || 0),
  best: Number(localStorage.getItem('rainers_best') || 0),
};
UI.best.textContent = JOURNEY.best.toString();

function saveJourney() {
  localStorage.setItem('rainers_progress', JOURNEY.progress);
  localStorage.setItem('rainers_coins', JOURNEY.coins);
  localStorage.setItem('rainers_best', JOURNEY.best);
}

// ================== Spēles konfigurācija ==================
const CFG = {
  groundH: 140,
  laneGap: 180,
  laneCount: 3,
  initSpeed: 380,         // px/s
  speedGain: 22,          // px/s pieaugums minūtē
  gravity: 2200,
  jumpV: 920,
  obstacleEvery: 0.85,    // s
  coinEvery: 0.55,        // s
  maxObstacles: 8,
  maxCoins: 20,
  parallax: [0.2, 0.5, 1], // fona slāņi
};

// ================== Spēles mainīgie (skrējiena laikā) ==================
let run = null;
function newRun() {
  const baseY = canvas.height - CFG.groundH;
  return {
    time: 0,
    speed: CFG.initSpeed,
    dist: 0, // metros ekvivalents (px -> m konversija zemāk)
    score: 0,
    coins: 0,
    player: {
      lane: 1, x: 0, y: baseY, vy: 0, w: 56, h: 64, jumping: false, invul: 0,
    },
    obstacles: [],
    coinsArr: [],
    spawnTimers: { obs: 0, coin: 0 },
    input: { left:false, right:false, jump:false },
    lastTs: performance.now(),
    skyT: Math.random()*1000,
    biome: 'city', // "city" | "park" | "industrial" | "oldtown"
    biomeT: 0,
  };
}

// ================== Ievade ==================
const KEYS = new Set();
addEventListener('keydown', (e)=>{
  if (['ArrowLeft','ArrowRight','KeyA','KeyD','KeyW','Space','KeyP','KeyM'].includes(e.code)) e.preventDefault();
  if (e.code==='ArrowLeft'||e.code==='KeyA') KEYS.add('left');
  if (e.code==='ArrowRight'||e.code==='KeyD') KEYS.add('right');
  if (e.code==='Space'||e.code==='KeyW') KEYS.add('jump');
  if (e.code==='KeyP') togglePause();
  if (e.code==='KeyM') openMap();
});
addEventListener('keyup', (e)=>{
  if (e.code==='ArrowLeft'||e.code==='KeyA') KEYS.delete('left');
  if (e.code==='ArrowRight'||e.code==='KeyD') KEYS.delete('right');
  if (e.code==='Space'||e.code==='KeyW') KEYS.delete('jump');
});

// Mobilais (swipe)
let touch = { active:false, sx:0, sy:0, dx:0, dy:0 };
canvas.addEventListener('pointerdown', (e)=>{ touch.active=true; touch.sx=e.clientX; touch.sy=e.clientY; touch.dx=0; touch.dy=0; });
canvas.addEventListener('pointermove', (e)=>{ if(touch.active){ touch.dx=e.clientX - touch.sx; touch.dy=e.clientY - touch.sy; }});
canvas.addEventListener('pointerup', ()=>{
  if (!touch.active) return;
  const TH = 40;
  if (Math.abs(touch.dx) > Math.abs(touch.dy)) {
    if (touch.dx > TH) laneRight();
    else if (touch.dx < -TH) laneLeft();
  } else if (-touch.dy > TH) jump();
  touch.active=false;
});

// ================== UI pogas ==================
UI.btnPlay.onclick = ()=> startRun();
UI.btnMap.onclick = ()=> openMap();
UI.btnRetry.onclick = ()=> startRun();
UI.btnToMap.onclick = ()=> openMap();
UI.btnRunFromMap.onclick = ()=> { closeMap(); startRun(); };
UI.btnReset.onclick = ()=> {
  JOURNEY.progress = 0; JOURNEY.coins = 0;
  saveJourney(); drawMap();
  updateMapStats();
};
UI.btnBack.onclick = ()=> closeMap();

// ================== Stāvoklis / režīmi ==================
function show(el){ el.classList.add('show'); }
function hide(el){ el.classList.remove('show'); }

function startRun() {
  hide(UI.start); hide(UI.over); hide(UI.map);
  STATE.mode = 'run';
  run = newRun();
  loop();
}

function endRun() {
  STATE.mode = 'over';
  // dist px pārvēršam “metros” — aptuveni: 100 px ~ 1 m (pielāgots sajūtai)
  const meters = Math.round(run.dist / 100);
  JOURNEY.progress = Math.min(JOURNEY.total, JOURNEY.progress + meters);
  JOURNEY.coins += run.coins;
  JOURNEY.best = Math.max(JOURNEY.best, meters);
  saveJourney();

  UI.finalDist.textContent = meters + ' m';
  UI.finalCoins.textContent = run.coins.toString();
  UI.progressPct.textContent = Math.round(JOURNEY.progress/JOURNEY.total*100) + '%';
  UI.best.textContent = JOURNEY.best.toString();

  show(UI.over);
}

function openMap() {
  if (STATE.mode==='run') return; // karti atveram no izvēlnes/over
  STATE.mode = 'map';
  drawMap();
  updateMapStats();
  show(UI.map);
}
function closeMap() {
  hide(UI.map);
  STATE.mode = 'menu';
  show(UI.start);
}

function togglePause(){
  if (STATE.mode!=='run') return;
  // Vienkārši parādām puscaurspīdīgu plāksni
  STATE.mode = 'pause';
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#fff'; ctx.font='bold 42px system-ui'; ctx.textAlign='center';
  ctx.fillText('PAUZE (P)', canvas.width/2, canvas.height/2);
}
addEventListener('keydown', (e)=> {
  if (e.code==='KeyP' && STATE.mode==='pause'){ STATE.mode='run'; run.lastTs = performance.now(); loop(); }
});

// ================== Spēles cikls ==================
function loop(ts){
  if (STATE.mode!=='run') return;
  const now = performance.now();
  const dt = Math.min(0.033, (now - run.lastTs)/1000);
  run.lastTs = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

// ================== Loģika ==================
function update(dt){
  run.time += dt;
  // ātrums pieaug
  run.speed += (CFG.speedGain/60) * dt * 60;

  // ievade
  if (KEYS.has('left'))  laneLeft();
  if (KEYS.has('right')) laneRight();
  if (KEYS.has('jump'))  jump();

  // spēlētājs — kustība starp joslām (gluds)
  const targetX = laneX(run.player.lane);
  const dx = targetX - run.player.x;
  run.player.x += Math.sign(dx) * Math.min(Math.abs(dx), 14 + run.speed*0.02);

  // gravitācija / lēciens
  if (run.player.jumping) {
    run.player.vy += CFG.gravity * dt;
    run.player.y += run.player.vy * dt;
    const baseY = canvas.height - CFG.groundH;
    if (run.player.y >= baseY){ run.player.y = baseY; run.player.jumping = false; run.player.vy = 0; }
  }

  // spawn — šķēršļi
  run.spawnTimers.obs += dt;
  if (run.spawnTimers.obs >= CFG.obstacleEvery){
    run.spawnTimers.obs = 0;
    if (run.obstacles.length < CFG.maxObstacles) spawnObstacle();
  }
  // spawn — monētas
  run.spawnTimers.coin += dt;
  if (run.spawnTimers.coin >= CFG.coinEvery){
    run.spawnTimers.coin = 0;
    if (run.coinsArr.length < CFG.maxCoins) spawnCoinRow();
  }

  // kustība uz leju (kamera brauc uz priekšu)
  const vy = run.speed * dt;
  for (const o of run.obstacles) o.y += vy;
  for (const c of run.coinsArr) c.y += vy;

  // izsijājam aiz ekrāna
  run.obstacles = run.obstacles.filter(o => o.y < canvas.height + 120);
  run.coinsArr = run.coinsArr.filter(c => c.y < canvas.height + 120 && !c.collected);

  // sadursmes
  for (const o of run.obstacles){
    if (o.hit) continue;
    if (o.lane === run.player.lane && aabb(
      run.player.x - run.player.w/2, run.player.y - run.player.h, run.player.w, run.player.h,
      o.x - 32, o.y - 32, 64, 64
    )){
      if (run.player.invul <= 0){
        endRun();
        return;
      } else {
        o.hit = true;
      }
    }
  }
  for (const c of run.coinsArr){
    if (!c.collected && c.lane === run.player.lane && dist(run.player.x, run.player.y-32, c.x, c.y) < 46){
      c.collected = true;
      run.coins += 1;
      JOURNEY.coins += 1;
    }
  }

  // distance (px → m aptuveni /100)
  run.dist += run.speed * dt;

  // biome maiņai — ik pēc ~1200 m
  run.biomeT += run.speed * dt;
  if (run.biomeT > 120000) { // ~1200m
    run.biomeT = 0;
    run.biome = nextBiome(run.biome);
  }

  // UI
  UI.score.textContent = Math.round(run.dist/100) + ' m';
  UI.coins.textContent = String(JOURNEY.coins);
  UI.best.textContent = String(Math.max(JOURNEY.best, Math.round(run.dist/100)));
}

// ================== Palīgfunkcijas ==================
function laneX(idx){
  const mid = canvas.width/2;
  return mid + (idx - (CFG.laneCount-1)/2) * CFG.laneGap;
}
function laneLeft(){ if (STATE.mode==='run') run.player.lane = Math.max(0, run.player.lane-1); }
function laneRight(){ if (STATE.mode==='run') run.player.lane = Math.min(CFG.laneCount-1, run.player.lane+1); }
function jump(){
  if (STATE.mode!=='run') return;
  if (!run.player.jumping){
    run.player.jumping = true;
    run.player.vy = -CFG.jumpV;
  }
}
function aabb(ax,ay,aw,ah, bx,by,bw,bh){
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}
function dist(ax,ay,bx,by){ const dx=ax-bx, dy=ay-by; return Math.hypot(dx,dy); }

function spawnObstacle(){
  const lane = Math.floor(Math.random()*CFG.laneCount);
  const x = laneX(lane);
  const y = -80; // virs ekrāna
  const type = ['cone','barrier','puddle'][Math.floor(Math.random()*3)];
  run.obstacles.push({ lane, x, y, type, hit:false });
}
function spawnCoinRow(){
  const lane = Math.floor(Math.random()*CFG.laneCount);
  const x = laneX(lane);
  const startY = -200 - Math.random()*200;
  const n = 4 + Math.floor(Math.random()*4);
  for (let i=0;i<n;i++){
    run.coinsArr.push({ lane, x, y: startY - i*60, collected:false });
  }
}
function nextBiome(b){
  const order = ['city','park','industrial','oldtown'];
  const i = order.indexOf(b);
  return order[(i+1)%order.length];
}

// ================== Zīmēšana ==================
function draw(){
  // fons
  drawBackground();

  // ceļš
  drawRoad();

  // monētas
  for (const c of run.coinsArr){ if (!c.collected) drawCoin(c.x, c.y); }

  // šķēršļi
  for (const o of run.obstacles) drawObstacle(o);

  // spēlētājs
  drawPlayer();
}

function drawBackground(){
  const t = performance.now()*0.0002 + run.time*0.05;
  // debesis pēc bioma
  const grad = ctx.createLinearGradient(0,0,0,canvas.height);
  const sky = {
    city: ['#0b1222','#0a0f1a'],
    park: ['#0a1c1a','#071013'],
    industrial: ['#14110f','#0a0a0a'],
    oldtown: ['#0d0e1a','#0a0b14'],
  }[run.biome];
  grad.addColorStop(0, sky[0]);
  grad.addColorStop(1, sky[1]);
  ctx.fillStyle = grad; ctx.fillRect(0,0,canvas.width,canvas.height);

  // tāla panorāma (silhueti)
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#8ac6ff';
  const h = canvas.height - CFG.groundH - 80;
  for (let i=0;i<18;i++){
    const x = (i*220 + (t*120 % 220)) % (canvas.width+220) - 110;
    const w = 60 + (i%4)*20, hh = 60 + (i%5)*26;
    ctx.fillRect(x, h - hh, w, hh);
  }
  ctx.globalAlpha = 1;
}

function drawRoad(){
  // ceļa tumšais laukums
  const y = canvas.height - CFG.groundH;
  ctx.fillStyle = '#1b2433';
  ctx.fillRect(0, y, canvas.width, CFG.groundH);

  // joslu marķējumi
  ctx.strokeStyle = 'rgba(255,255,255,.22)';
  ctx.lineWidth = 2;
  const mid = canvas.width/2;
  for (let i=1;i<CFG.laneCount;i++){
    const lx = mid + (i - (CFG.laneCount/2)) * CFG.laneGap;
    ctx.setLineDash([16, 24]);
    ctx.beginPath(); ctx.moveTo(lx, y+6); ctx.lineTo(lx, canvas.height-6); ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawPlayer(){
  const p = run.player;
  // ēna
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(p.x, canvas.height - CFG.groundH + 24, 38, 12, 0, 0, Math.PI*2); ctx.fill();
  ctx.globalAlpha = 1;
  // ķermenis
  ctx.fillStyle = '#34c759';
  ctx.strokeStyle = '#bdfcc9';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(p.x-28, p.y-64, 56, 64, 12); ctx.fill(); ctx.stroke();
  // galva
  ctx.beginPath(); ctx.arc(p.x, p.y-78, 18, 0, Math.PI*2); ctx.fillStyle='#5ac8fa'; ctx.fill(); ctx.strokeStyle='#b9efff'; ctx.stroke();
}

function drawObstacle(o){
  ctx.save(); ctx.translate(o.x, o.y);
  if (o.type==='cone'){
    ctx.fillStyle = '#ff6b6b';
    ctx.strokeStyle = '#ffdede';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-22, 24); ctx.lineTo(0, -24); ctx.lineTo(22, 24); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#fff'; ctx.fillRect(-18, 8, 36, 6);
  } else if (o.type==='barrier'){
    ctx.fillStyle = '#f39c12';
    ctx.strokeStyle = '#ffe0b2';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(-36, -12, 72, 36, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#333'; ctx.fillRect(-36, 0, 72, 8);
  } else if (o.type==='puddle'){
    ctx.fillStyle = 'rgba(80,140,220,0.9)';
    ctx.beginPath(); ctx.ellipse(0, 12, 46, 18, 0, 0, Math.PI*2); ctx.fill();
  }
  ctx.restore();
}

function drawCoin(x,y){
  ctx.save(); ctx.translate(x,y);
  const t = performance.now()*0.005;
  const r = 16 + Math.sin(t)*1.5;
  ctx.fillStyle = '#ffd54f';
  ctx.strokeStyle = '#fff1c2';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffecb3';
  ctx.beginPath(); ctx.arc(0,0, r*0.55,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

// ================== KARTE (virszemes progress) ==================
let MAP = null;
function buildMap() {
  // Ģenerējam polilīniju ar ~50 punktiem (virziens no “Start” → “Mājas”)
  const w = UI.mapCanvas.width, h = UI.mapCanvas.height;
  const margin = 50;
  const pts = [];
  let x = margin, y = h - margin;
  const dx = (w - margin*2) / 12;
  for (let i=0;i<13;i++){
    pts.push([x, y]);
    x += dx;
    // nedaudz “pļāpīgs” ceļš
    y += (i%2===0 ? -1 : 1) * (30 + Math.random()*40);
    y = Math.max(margin, Math.min(h-margin, y));
  }
  // pievieno dažus izvirzījumus
  for (let k=0;k<3;k++){
    const i = 2 + k*3;
    pts.splice(i, 0, [pts[i][0]-dx*0.3, pts[i][1] + (k%2?40:-40)]);
  }
  // aprēķinām segmentu garumus un kopgarumu (kartes mērogā — izmantosim kā procentus)
  const seg = [];
  let total = 0;
  for (let i=0;i<pts.length-1;i++){
    const a=pts[i], b=pts[i+1];
    const d = Math.hypot(b[0]-a[0], b[1]-a[1]);
    seg.push(d); total += d;
  }
  MAP = { pts, seg, total };
}

function drawMap(){
  if (!MAP) buildMap();
  const ctxm = UI.mapCanvas.getContext('2d');
  const w = UI.mapCanvas.width, h = UI.mapCanvas.height;
  ctxm.clearRect(0,0,w,h);

  // fons
  const g = ctxm.createLinearGradient(0,0,0,h);
  g.addColorStop(0,'#0b1526'); g.addColorStop(1,'#06101b');
  ctxm.fillStyle = g; ctxm.fillRect(0,0,w,h);

  // stilizēti rajoni
  for (let i=0;i<6;i++){
    ctxm.fillStyle = `rgba(90,200,250,${0.06 + (i%3)*0.02})`;
    const rx = 40 + i*140, ry = 80 + (i%2)*60;
    ctxm.beginPath();
    ctxm.ellipse(rx, ry, 120, 46, 0, 0, Math.PI*2); ctxm.fill();
  }

  // ceļš
  ctxm.lineWidth = 8;
  ctxm.lineCap = 'round';
  ctxm.strokeStyle = '#2f9bff';
  ctxm.beginPath();
  const p0 = MAP.pts[0];
  ctxm.moveTo(p0[0], p0[1]);
  for (let i=1;i<MAP.pts.length;i++) ctxm.lineTo(MAP.pts[i][0], MAP.pts[i][1]);
  ctxm.stroke();

  // progress punkts
  const ratio = JOURNEY.progress / JOURNEY.total; // 0..1
  const pos = pointAtRatio(ratio);
  // aizpildām līdz progress
  ctxm.strokeStyle = '#34c759';
  ctxm.beginPath();
  ctxm.moveTo(MAP.pts[0][0], MAP.pts[0][1]);
  for (let i=1;i<pos.i;i++) ctxm.lineTo(MAP.pts[i][0], MAP.pts[i][1]);
  ctxm.lineTo(pos.x, pos.y);
  ctxm.stroke();

  // “Mājas” ikona
  const last = MAP.pts[MAP.pts.length-1];
  drawHouse(ctxm, last[0], last[1], '#ffd54f');
  // “Start” ikona
  drawFlag(ctxm, MAP.pts[0][0], MAP.pts[0][1], '#ff6b6b');

  // marķieris progresam
  drawMarker(ctxm, pos.x, pos.y, '#34c759');
}

function updateMapStats(){
  const pct = Math.round(JOURNEY.progress/JOURNEY.total*100);
  UI.mapProgress.textContent = pct + '%';
  UI.mapRemain.textContent = (JOURNEY.total - JOURNEY.progress) + ' m';
}

function pointAtRatio(ratio){
  if (!MAP) buildMap();
  let need = ratio * MAP.total;
  let x = MAP.pts[0][0], y = MAP.pts[0][1], i=1;
  for (; i<MAP.pts.length; i++){
    const a = MAP.pts[i-1], b = MAP.pts[i];
    const d = MAP.seg[i-1];
    if (need <= d){
      const t = d===0 ? 0 : need/d;
      x = a[0] + (b[0]-a[0])*t;
      y = a[1] + (b[1]-a[1])*t;
      break;
    } else need -= d;
  }
  return { x, y, i };
}
function drawMarker(ctxm,x,y,color){
  ctxm.fillStyle = color; ctxm.strokeStyle = '#eaffea'; ctxm.lineWidth=2;
  ctxm.beginPath(); ctxm.arc(x, y, 10, 0, Math.PI*2); ctxm.fill(); ctxm.stroke();
}
function drawHouse(ctxm,x,y,color){
  ctxm.save(); ctxm.translate(x,y);
  ctxm.fillStyle=color; ctxm.strokeStyle='#fff3c0'; ctxm.lineWidth=2;
  ctxm.beginPath();
  ctxm.moveTo(-16,6); ctxm.lineTo(0,-16); ctxm.lineTo(16,6); ctxm.closePath(); ctxm.fill(); ctxm.stroke();
  ctxm.fillStyle='#fff'; ctxm.fillRect(-10,6,20,12); ctxm.restore();
}
function drawFlag(ctxm,x,y,color){
  ctxm.save(); ctxm.translate(x,y);
  ctxm.strokeStyle=color; ctxm.lineWidth=3;
  ctxm.beginPath(); ctxm.moveTo(0, -18); ctxm.lineTo(0, 16); ctxm.stroke();
  ctxm.fillStyle=color; ctxm.beginPath();
  ctxm.moveTo(0,-18); ctxm.lineTo(18,-12); ctxm.lineTo(0,-6); ctxm.closePath(); ctxm.fill();
  ctxm.restore();
}

// ================== Sākotnējā vizuālizācija ==================
show(UI.start);
drawSplash();

function drawSplash(){
  // fona demo, lai izvēlnē smuki izskatās
  ctx.fillStyle = '#09121e'; ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = '#0f1c2e'; for (let i=0;i<24;i++){ const w=80+Math.random()*120, h=40+Math.random()*60, x=Math.random()*canvas.width, y=Math.random()*canvas.height*0.7; ctx.fillRect(x,y,w,h); }
  ctx.fillStyle='#fff'; ctx.font='bold 42px system-ui'; ctx.textAlign='center';
  ctx.fillText('Rainers: Ceļš uz mājām', canvas.width/2, canvas.height*0.4);
}

// === Tēla galvas bilde ===
const headImg = new Image();
// ja fails ir "Rain.png", raksti tieši tā (ar paplašinājumu!)
headImg.src = 'Rain.png';
let headReady = false;
headImg.onload = () => { headReady = true; };
headImg.onerror = () => {
  console.warn('Neizdevās ielādēt Rain.png. Pārbaudi faila nosaukumu/ceļu.');
};
