import React, { useEffect, useRef, useState } from 'react';

interface Point { x: number; y: number; }
interface GameObject { x: number; y: number; radius: number; }
interface Bullet extends GameObject { vx: number; vy: number; id: number; pierceCount: number; type?: 'normal' | 'mega' | 'nova'; }
interface Enemy extends GameObject { hp: number; maxHp: number; id: number; }
interface Loot extends GameObject { type: 'bread' | 'ammo' | 'xp'; id: number; }
interface Obstacle { x: number; y: number; width: number; height: number; }

const WORLD_SIZE = 3000;
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

const ABILITIES = [
  { id: 'fireRate', name: '急速射击', desc: '射击速度提升 25%', type: 'passive' },
  { id: 'pierce', name: '穿透弹药', desc: '子弹可额外穿透 1 个敌人', type: 'passive' },
  { id: 'damage', name: '重型水炮', desc: '子弹伤害提升 30%', type: 'passive' },
  { id: 'megaShot', name: '巨型冲击波 (空格键)', desc: '获得发射超大范围冲击波的能力', type: 'weapon' },
  { id: 'waterNova', name: '水之新星 (空格键)', desc: '向四周发射一圈高速水弹', type: 'weapon' },
  { id: 'iceTrap', name: '冰霜陷阱', desc: '每隔 5 秒在身后留下一个范围伤害区', type: 'skill' },
  { id: 'regen', name: '紧急修复', desc: '立即恢复 30% 生命值', type: 'skill' },
  { id: 'speed', name: '极速冲刺', desc: '移动速度提升 15%', type: 'passive' },
];

const Game: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [persistentStats, setPersistentStats] = useState({ totalBread: 0, speedLevel: 1, ammoLevel: 1, damageLevel: 1 });
  const [view, setView] = useState<'start' | 'playing' | 'shop' | 'result' | 'levelup'>('start');
  const [choices, setChoices] = useState<any[]>([]);

  const gameState = useRef({
    player: { 
      x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, radius: 22, angle: 0, 
      breadCount: 0, ammo: 20, xp: 0, level: 1, nextLevelXp: 100,
      fireRate: 200, pierce: 0, hp: 100, maxHp: 100,
      moveSpeedMult: 1, damageMult: 1,
      skills: [] as string[],
      skillCooldowns: { megaShot: 0, waterNova: 0, iceTrap: 0 }
    },
    bullets: [] as Bullet[],
    enemies: [] as Enemy[],
    loots: [] as Loot[],
    obstacles: [] as Obstacle[],
    extractionZone: null as (GameObject & { active: boolean }) | null,
    status: 'playing',
    timer: 60,
    lastShot: 0,
    nextId: 1,
    lastTime: 0
  });

  const [ui, setUi] = useState({ bread: 0, ammo: 0, timer: 60, status: 'playing', xp: 0, level: 1, nextLevelXp: 100, hp: 100 });

  const keysPressed = useRef<{ [key: string]: boolean }>({});
  const mousePos = useRef<Point>({ x: 0, y: 0 });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => (keysPressed.current[e.code] = true);
    const handleKeyUp = (e: KeyboardEvent) => (keysPressed.current[e.code] = false);
    const handleMouseMove = (e: MouseEvent) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      mousePos.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const handleMouseDown = () => (keysPressed.current['mousedown'] = true);
    const handleMouseUp = () => (keysPressed.current['mousedown'] = false);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const checkCircleRectCollision = (cx: number, cy: number, cr: number, rx: number, ry: number, rw: number, rh: number) => {
    const closestX = Math.max(rx, Math.min(cx, rx + rw));
    const closestY = Math.max(ry, Math.min(cy, ry + rh));
    return Math.hypot(cx - closestX, cy - closestY) < cr;
  };

  const startGame = () => {
    const s = gameState.current;
    s.player = { 
      x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, radius: 22, angle: 0, breadCount: 0, 
      ammo: 20 + (persistentStats.ammoLevel - 1) * 10, xp: 0, level: 1, nextLevelXp: 100,
      fireRate: 200, pierce: 0, hp: 100, maxHp: 100, moveSpeedMult: 1, damageMult: 1,
      skills: [], skillCooldowns: { megaShot: 0, waterNova: 0, iceTrap: 0 }
    };
    s.bullets = []; s.enemies = []; s.loots = []; s.obstacles = []; s.extractionZone = null; s.status = 'playing'; s.timer = 60;
    s.lastTime = performance.now();

    const gridSize = 400;
    for (let gx = 0; gx < WORLD_SIZE; gx += gridSize) {
      for (let gy = 0; gy < WORLD_SIZE; gy += gridSize) {
        if (Math.random() > 0.4) {
          const w = 150 + Math.random() * 150, h = 150 + Math.random() * 150;
          const x = gx + (gridSize - w) / 2, y = gy + (gridSize - h) / 2;
          if (Math.hypot(x + w/2 - s.player.x, y + h/2 - s.player.y) > 300) s.obstacles.push({ x, y, width: w, height: h });
        }
      }
    }
    const isInside = (x: number, y: number, r: number) => s.obstacles.some(o => checkCircleRectCollision(x, y, r, o.x, o.y, o.width, o.height));
    for (let i = 0; i < 40; i++) {
      let ex, ey, isElite; do { ex = Math.random() * WORLD_SIZE; ey = Math.random() * WORLD_SIZE; isElite = Math.random() > 0.85; } while (isInside(ex, ey, 35) || Math.hypot(ex - s.player.x, ey - s.player.y) < 500);
      const hp = isElite ? 12 : 3; s.enemies.push({ x: ex, y: ey, radius: isElite ? 35 : 25, hp, maxHp: hp, id: s.nextId++ });
    }
    for (let i = 0; i < 80; i++) {
      let lx, ly; do { lx = Math.random() * WORLD_SIZE; ly = Math.random() * WORLD_SIZE; } while (isInside(lx, ly, 15));
      s.loots.push({ x: lx, y: ly, radius: 10, type: Math.random() > 0.25 ? 'bread' : 'ammo', id: s.nextId++ });
    }
    setView('playing'); requestAnimationFrame(gameLoop);
  };

  const gameLoop = (time: number) => {
    if (gameState.current.status !== 'playing') return;
    const dt = (time - gameState.current.lastTime) / 1000;
    gameState.current.lastTime = time;
    update(dt); draw();
    requestAnimationFrame(gameLoop);
  };

  const useSkill = (skillId: string) => {
    const s = gameState.current; const p = s.player;
    if (skillId === 'megaShot' && p.skillCooldowns.megaShot <= 0) {
      const dist = p.radius + 30;
      s.bullets.push({
        x: p.x + Math.cos(p.angle) * dist, y: p.y + Math.sin(p.angle) * dist,
        vx: Math.cos(p.angle) * 12, vy: Math.sin(p.angle) * 12,
        radius: 60, id: s.nextId++, pierceCount: 10, type: 'mega'
      });
      p.skillCooldowns.megaShot = 3000;
    }
    if (skillId === 'waterNova' && p.skillCooldowns.waterNova <= 0) {
      for (let i = 0; i < 12; i++) {
        const a = (Math.PI * 2 / 12) * i;
        s.bullets.push({ x: p.x, y: p.y, vx: Math.cos(a) * 10, vy: Math.sin(a) * 10, radius: 8, id: s.nextId++, pierceCount: 1, type: 'nova' });
      }
      p.skillCooldowns.waterNova = 5000;
    }
  };

  const update = (dt: number) => {
    const s = gameState.current; const p = s.player;
    if (p.xp >= p.nextLevelXp) {
      p.xp -= p.nextLevelXp; p.level++; p.nextLevelXp = Math.floor(p.nextLevelXp * 1.3);
      setChoices([...ABILITIES].sort(() => 0.5 - Math.random()).slice(0, 3));
      setView('levelup'); s.status = 'paused'; return;
    }

    // Cooldowns
    Object.keys(p.skillCooldowns).forEach(k => { if (p.skillCooldowns[k as keyof typeof p.skillCooldowns] > 0) p.skillCooldowns[k as keyof typeof p.skillCooldowns] -= dt * 1000; });

    // Inputs
    p.angle = Math.atan2(mousePos.current.y - CANVAS_HEIGHT / 2, mousePos.current.x - CANVAS_WIDTH / 2);
    const now = Date.now();
    if (keysPressed.current['mousedown'] && now - s.lastShot > p.fireRate && p.ammo > 0) {
      s.bullets.push({ x: p.x + Math.cos(p.angle) * 35, y: p.y + Math.sin(p.angle) * 35, vx: Math.cos(p.angle) * 15, vy: Math.sin(p.angle) * 15, radius: 6, id: s.nextId++, pierceCount: p.pierce });
      p.ammo--; s.lastShot = now;
    }
    if (keysPressed.current['Space']) {
      if (p.skills.includes('megaShot')) useSkill('megaShot');
      if (p.skills.includes('waterNova')) useSkill('waterNova');
    }

    // Movement
    const speed = (5 + (persistentStats.speedLevel - 1) * 0.5) * p.moveSpeedMult;
    let dx = 0, dy = 0;
    if (keysPressed.current['KeyW']) dy -= speed; if (keysPressed.current['KeyS']) dy += speed;
    if (keysPressed.current['KeyA']) dx -= speed; if (keysPressed.current['KeyD']) dx += speed;
    let nx = p.x + dx, ny = p.y + dy;
    nx = Math.max(p.radius, Math.min(WORLD_SIZE - p.radius, nx)); ny = Math.max(p.radius, Math.min(WORLD_SIZE - p.radius, ny));
    for (const o of s.obstacles) {
      if (checkCircleRectCollision(nx, p.y, p.radius, o.x, o.y, o.width, o.height)) nx = p.x;
      if (checkCircleRectCollision(p.x, ny, p.radius, o.x, o.y, o.width, o.height)) ny = p.y;
    }
    p.x = nx; p.y = ny;

    if (p.breadCount >= 5) {
      if (!s.extractionZone) {
        let ex, ey; do { ex = 300 + Math.random() * (WORLD_SIZE-600); ey = 300 + Math.random() * (WORLD_SIZE-600); } while (Math.hypot(ex-p.x, ey-p.y) < 1200);
        s.extractionZone = { x: ex, y: ey, radius: 120, active: true };
      }
      s.timer -= dt; if (s.timer <= 0) { s.status = 'dead'; setView('result'); }
    }

    s.loots = s.loots.filter(l => {
      if (Math.hypot(l.x - p.x, l.y - p.y) < p.radius + l.radius) {
        if (l.type === 'bread') p.breadCount++; else if (l.type === 'ammo') p.ammo += 15; else if (l.type === 'xp') p.xp += 30;
        return false;
      }
      return true;
    });

    s.enemies.forEach(e => {
      const angle = Math.atan2(p.y - e.y, p.x - e.x);
      let ex = e.x + Math.cos(angle) * 2.2, ey = e.y + Math.sin(angle) * 2.2;
      for (const o of s.obstacles) {
        if (checkCircleRectCollision(ex, e.y, e.radius, o.x, o.y, o.width, o.height)) ex = e.x;
        if (checkCircleRectCollision(e.x, ey, e.radius, o.x, o.y, o.width, o.height)) ey = e.y;
      }
      e.x = ex; e.y = ey;
      if (Math.hypot(e.x - p.x, e.y - p.y) < e.radius + p.radius) { p.hp -= 0.6; if (p.hp <= 0) { s.status = 'dead'; setView('result'); } }
    });

    s.bullets.forEach(b => { b.x += b.vx; b.y += b.vy; });
    s.bullets = s.bullets.filter(b => {
      if (b.x < 0 || b.x > WORLD_SIZE || b.y < 0 || b.y > WORLD_SIZE) return false;
      for (const o of s.obstacles) if (checkCircleRectCollision(b.x, b.y, b.radius, o.x, o.y, o.width, o.height)) return false;
      let hit = false;
      for (const e of s.enemies) {
        if (Math.hypot(b.x - e.x, b.y - e.y) < b.radius + e.radius) {
          e.hp -= (b.type === 'mega' ? 10 : b.type === 'nova' ? 2 : 1.2) * (1 + (persistentStats.damageLevel - 1) * 0.4) * p.damageMult;
          if (e.hp <= 0) s.loots.push({ x: e.x, y: e.y, radius: 8, type: 'xp', id: s.nextId++ });
          if (b.pierceCount > 0) b.pierceCount--; else hit = true; break;
        }
      }
      return !hit;
    });
    s.enemies = s.enemies.filter(e => e.hp > 0);
    if (s.extractionZone && Math.hypot(p.x - s.extractionZone.x, p.y - s.extractionZone.y) < s.extractionZone.radius) {
      s.status = 'extracted'; setPersistentStats(prev => ({ ...prev, totalBread: prev.totalBread + p.breadCount })); setView('result');
    }
    setUi({ bread: p.breadCount, ammo: p.ammo, timer: Math.max(0, Math.ceil(s.timer)), status: s.status, xp: p.xp, level: p.level, nextLevelXp: p.nextLevelXp, hp: Math.ceil(p.hp) });
  };

  const draw = () => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const s = gameState.current; const ox = CANVAS_WIDTH / 2 - s.player.x, oy = CANVAS_HEIGHT / 2 - s.player.y;
    ctx.fillStyle = '#1e272e'; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.strokeStyle = '#2f3640'; ctx.lineWidth = 1;
    for (let i = 0; i <= WORLD_SIZE; i += 200) { ctx.beginPath(); ctx.moveTo(i + ox, oy); ctx.lineTo(i + ox, WORLD_SIZE + oy); ctx.stroke(); ctx.beginPath(); ctx.moveTo(ox, i + oy); ctx.lineTo(WORLD_SIZE + ox, i + oy); ctx.stroke(); }
    ctx.fillStyle = '#485460'; s.obstacles.forEach(o => ctx.fillRect(o.x + ox, o.y + oy, o.width, o.height));
    if (s.extractionZone) {
      ctx.beginPath(); ctx.arc(s.extractionZone.x + ox, s.extractionZone.y + oy, s.extractionZone.radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(46, 204, 113, 0.2)'; ctx.fill(); ctx.strokeStyle = '#2ecc71'; ctx.lineWidth = 3; ctx.stroke();
      const angle = Math.atan2(s.extractionZone.y - s.player.y, s.extractionZone.x - s.player.x);
      ctx.save(); ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2); ctx.rotate(angle);
      ctx.beginPath(); ctx.moveTo(55, -12); ctx.lineTo(75, 0); ctx.lineTo(55, 12); ctx.closePath(); ctx.fillStyle = '#2ecc71'; ctx.fill(); ctx.restore();
    }
    s.loots.forEach(l => {
      ctx.beginPath(); ctx.arc(l.x + ox, l.y + oy, l.radius, 0, Math.PI * 2);
      ctx.fillStyle = l.type === 'bread' ? '#f1c40f' : l.type === 'ammo' ? '#3498db' : '#8e44ad'; ctx.fill();
    });
    s.bullets.forEach(b => {
      ctx.beginPath(); ctx.arc(b.x + ox, b.y + oy, b.radius, 0, Math.PI * 2);
      ctx.fillStyle = b.type === 'mega' ? '#e67e22' : b.type === 'nova' ? '#3498db' : '#e74c3c'; ctx.fill();
      if (b.type === 'mega') { ctx.strokeStyle = 'white'; ctx.stroke(); }
    });
    s.enemies.forEach(e => {
      const isElite = e.maxHp > 4; ctx.beginPath(); ctx.arc(e.x + ox, e.y + oy, e.radius, 0, Math.PI * 2);
      ctx.fillStyle = isElite ? '#8e44ad' : '#ecf0f1'; ctx.fill(); ctx.strokeStyle = isElite ? '#2c3e50' : '#c0392b'; ctx.lineWidth = isElite ? 4 : 2; ctx.stroke();
      const bw = e.radius * 1.6; ctx.fillStyle = '#c0392b'; ctx.fillRect(e.x + ox - bw/2, e.y + oy - e.radius - 15, bw, 6);
      ctx.fillStyle = '#2ecc71'; ctx.fillRect(e.x + ox - bw/2, e.y + oy - e.radius - 15, (e.hp / e.maxHp) * bw, 6);
    });
    // Draw Duck
    const p = s.player; ctx.save(); ctx.translate(CANVAS_WIDTH/2, CANVAS_HEIGHT/2); ctx.rotate(p.angle);
    ctx.beginPath(); ctx.ellipse(0, 0, 22, 15, 0, 0, Math.PI*2); ctx.fillStyle = '#FFEB3B'; ctx.fill();
    ctx.beginPath(); ctx.arc(14, -5, 11, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(18, -8, 2.5, 0, Math.PI*2); ctx.fillStyle = 'black'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(22, -5); ctx.lineTo(32, -3); ctx.lineTo(22, 0); ctx.closePath(); ctx.fillStyle = '#FF9800'; ctx.fill(); ctx.restore();
  };

  const handleLevelUp = (ability: any) => {
    const p = gameState.current.player;
    if (ability.id === 'fireRate') p.fireRate *= ability.type === 'passive' ? 0.75 : 1;
    if (ability.id === 'pierce') p.pierce += 1;
    if (ability.id === 'damage') p.damageMult *= 1.3;
    if (ability.id === 'speed') p.moveSpeedMult *= 1.15;
    if (ability.id === 'regen') p.hp = Math.min(p.maxHp, p.hp + 30);
    if (ability.type === 'weapon') p.skills.push(ability.id);
    gameState.current.status = 'playing'; gameState.current.lastTime = performance.now(); setView('playing'); requestAnimationFrame(gameLoop);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: '#111', minHeight: '100vh', color: 'white', fontFamily: 'Microsoft YaHei, Arial', overflow: 'hidden' }}>
      {view === 'start' && (
        <div style={{ textAlign: 'center', marginTop: '100px' }}>
          <h1 style={{ fontSize: '72px', color: '#f1c40f' }}>🦆 鸭口脱险</h1>
          <p style={{ fontSize: '24px', color: '#aaa' }}>战术收集 · 割草升级 · 极限撤离</p>
          <div style={{ background: '#222', padding: '30px', borderRadius: '20px', margin: '30px', border: '1px solid #444' }}>
            <h2>仓库储备: {persistentStats.totalBread} 🥖</h2>
            <button onClick={() => setView('shop')} style={{ padding: '12px 30px', margin: '10px', fontSize: '18px', cursor: 'pointer', borderRadius: '8px' }}>进入基地商店</button>
            <button onClick={startGame} style={{ padding: '12px 30px', margin: '10px', fontSize: '18px', background: '#2ecc71', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>开始执行任务</button>
          </div>
          <p style={{ color: '#666' }}>操作: WASD 移动 | 鼠标左键 射击 | 空格键 特殊技能</p>
        </div>
      )}

      {view === 'playing' && (
        <div style={{ position: 'relative', marginTop: '20px' }}>
          <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} style={{ border: '5px solid #333', borderRadius: '12px' }} />
          <div style={{ position: 'absolute', top: 15, left: 15, width: '220px', background: 'rgba(0,0,0,0.85)', padding: '15px', borderRadius: '10px', border: '1px solid #444' }}>
            <div style={{ color: ui.bread >= 5 ? '#2ecc71' : '#f1c40f', fontWeight: 'bold', fontSize: '18px' }}>{ui.bread >= 5 ? '✅ 任务完成！快去撤离！' : `🥖 收集面包: ${ui.bread} / 5`}</div>
            <div style={{ color: '#3498db' }}>💧 剩余弹药: {ui.ammo}</div>
            <div style={{ color: '#e74c3c' }}>❤️ 生命值: {ui.hp}</div>
            <div style={{ marginTop: '10px' }}>
              <div style={{ fontSize: '12px', color: '#9b59b6' }}>等级 {ui.level}</div>
              <div style={{ width: '100%', height: '8px', background: '#333', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${(ui.xp / ui.nextLevelXp) * 100}%`, height: '100%', background: '#9b59b6', boxShadow: '0 0 10px #9b59b6' }} />
              </div>
            </div>
            {ui.bread >= 5 && <div style={{ color: '#e74c3c', fontSize: '24px', fontWeight: 'bold', marginTop: '10px', textAlign: 'center' }}>⏳ {ui.timer}s</div>}
          </div>
        </div>
      )}

      {view === 'levelup' && (
        <div style={{ textAlign: 'center', marginTop: '100px', background: 'rgba(0,0,0,0.95)', padding: '40px', borderRadius: '20px', border: '2px solid #9b59b6', boxShadow: '0 0 30px #9b59b6' }}>
          <h1 style={{ color: '#9b59b6', fontSize: '48px', margin: '0 0 20px 0' }}>等级提升！</h1>
          <p style={{ fontSize: '18px', color: '#ccc' }}>选择一项能力来强化你的战斗力：</p>
          <div style={{ display: 'flex', gap: '20px', marginTop: '30px' }}>
            {choices.map(c => (
              <div key={c.id} onClick={() => handleLevelUp(c)} style={{ background: '#222', padding: '20px', borderRadius: '15px', width: '200px', cursor: 'pointer', border: '1px solid #444', transition: 'all 0.2s', hover: { transform: 'scale(1.05)', borderColor: '#f1c40f' } }}>
                <div style={{ color: c.type === 'weapon' ? '#e67e22' : '#f1c40f', fontSize: '20px', fontWeight: 'bold', marginBottom: '10px' }}>{c.name}</div>
                <p style={{ fontSize: '14px', color: '#aaa', lineHeight: '1.4' }}>{c.desc}</p>
                <div style={{ fontSize: '12px', marginTop: '10px', color: '#666' }}>[{c.type === 'weapon' ? '特殊武器' : c.type === 'skill' ? '技能' : '被动'}]</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'shop' && (
        <div style={{ textAlign: 'center', marginTop: '50px' }}>
          <h1>🏪 基地商店</h1>
          <p>花费收集到的面包永久强化你的基础属性</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '20px', marginTop: '30px' }}>
            <div style={{ background: '#222', padding: '25px', borderRadius: '15px', width: '240px', border: '1px solid #444' }}>
              <h3 style={{ color: '#2ecc71' }}>基础移动速度</h3><p>当前等级: {persistentStats.speedLevel}</p>
              <button disabled={persistentStats.totalBread < persistentStats.speedLevel * 10} onClick={() => setPersistentStats(p => ({ ...p, totalBread: p.totalBread - p.speedLevel * 10, speedLevel: p.speedLevel + 1 }))} style={{ width: '100%', padding: '10px', cursor: 'pointer' }}>升级 ({persistentStats.speedLevel * 10}🥖)</button>
            </div>
          </div>
          <button onClick={() => setView('start')} style={{ marginTop: '40px', padding: '12px 60px', fontSize: '20px', cursor: 'pointer', borderRadius: '10px' }}>返回主菜单</button>
        </div>
      )}

      {view === 'result' && (
        <div style={{ textAlign: 'center', marginTop: '100px', background: 'rgba(0,0,0,0.95)', padding: '60px', borderRadius: '30px', border: '2px solid #2ecc71' }}>
          <h1 style={{ fontSize: '72px', color: ui.status === 'extracted' ? '#2ecc71' : '#e74c3c', margin: '0' }}>{ui.status === 'extracted' ? '任务成功！' : '鸭子阵亡'}</h1>
          <p style={{ fontSize: '28px', color: '#ccc', margin: '20px 0' }}>本次回收面包: {ui.bread} 🥖</p>
          <button onClick={() => setView('start')} style={{ padding: '15px 60px', fontSize: '24px', background: '#2ecc71', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', boxShadow: '0 5px 15px rgba(46, 204, 113, 0.4)' }}>回到基地</button>
        </div>
      )}
    </div>
  );
};

export default Game;
