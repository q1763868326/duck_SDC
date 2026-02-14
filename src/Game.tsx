import React, { useEffect, useRef, useState } from 'react';

// --- 配置与常量 ---
const WORLD_SIZE = 3000;
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const CHEST_OPEN_TIME = 5; 
const ENEMY_SPEED = 2.4;

const COLORS = {
  bg: '#050508',
  grid: '#161625',
  player: '#f1c40f',
  enemy: '#ff4757',
  elite: '#a55eea',
  chest: '#00ff88',
  bullet: '#00d2ff',
  special: '#ff9f43',
  xp: '#9b59b6',
  bread: '#f1c40f',
  ammo: '#3498db'
};

const WEAPONS = {
  standard: { id: 'standard', name: '霓虹手枪', damage: 3, fireRate: 300, color: COLORS.bullet },
  shotgun: { id: 'shotgun', name: '脉冲散弹', damage: 2, fireRate: 800, color: '#f39c12', count: 5, spread: 0.4 },
  sniper: { id: 'sniper', name: '轨道炮', damage: 25, fireRate: 1500, color: '#3498db', pierce: 5 },
  bubble: { id: 'bubble', name: '等离子枪', damage: 1, fireRate: 100, color: '#9b59b6' }
};

// --- 类型定义 ---
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number; }
interface Bullet { x: number; y: number; vx: number; vy: number; radius: number; damage: number; color: string; id: number; pierce: number; isSpecial?: boolean; }
interface Enemy { x: number; y: number; radius: number; hp: number; maxHp: number; id: number; isElite: boolean; }
interface Chest { x: number; y: number; radius: number; id: number; isOpened: boolean; progress: number; }
interface Loot { x: number; y: number; radius: number; type: 'bread' | 'ammo' | 'xp'; id: number; }
interface Obstacle { x: number; y: number; w: number; h: number; }

const Game: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [persistent, setPersistent] = useState(() => {
    const saved = localStorage.getItem('duck_final_v6');
    return saved ? JSON.parse(saved) : { totalBread: 0, ownedWeapons: ['standard'], equippedWeapons: ['standard'] };
  });

  const [view, setView] = useState<'start' | 'playing' | 'shop' | 'result' | 'levelup' | 'prep'>('start');
  const [screenShake, setScreenShake] = useState(0);

  const gameState = useRef({
    player: { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, radius: 22, angle: 0, bread: 0, ammo: 60, hp: 100, maxHp: 100, xp: 0, level: 1, nextLevelXp: 100, currentWepIdx: 0, specialWep: null as any },
    runEquippedWeapons: [] as string[],
    bullets: [] as Bullet[],
    enemies: [] as Enemy[],
    loots: [] as Loot[],
    obstacles: [] as Obstacle[],
    chests: [] as Chest[],
    particles: [] as Particle[],
    extractionZone: null as {x:number, y:number} | null,
    status: 'idle',
    lastTime: 0,
    lastShot: 0,
    nextId: 1
  });

  const [ui, setUi] = useState({ hp: 100, bread: 0, ammo: 60, xp: 0, level: 1, opening: 0, weapon: '', timer: 60 });
  const keys = useRef<{ [key: string]: boolean }>({});

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
      if (e.code === 'KeyQ') {
        const s = gameState.current;
        if (s.runEquippedWeapons.length > 1) s.player.currentWepIdx = (s.player.currentWepIdx + 1) % s.runEquippedWeapons.length;
      }
    };
    const up = (e: KeyboardEvent) => keys.current[e.code] = false;
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  const spawnParticles = (x: number, y: number, color: string, count = 8) => {
    for (let i = 0; i < count; i++) {
      gameState.current.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 0.5) * 12,
        life: 1,
        color,
        size: Math.random() * 4 + 2
      });
    }
  };

  const checkCollision = (cx: number, cy: number, r: number, rx: number, ry: number, rw: number, rh: number) => {
    const closestX = Math.max(rx, Math.min(cx, rx + rw));
    const closestY = Math.max(ry, Math.min(cy, ry + rh));
    const distSq = (cx - closestX)**2 + (cy - closestY)**2;
    return distSq < r * r;
  };

  const startGame = () => {
    const s = gameState.current;
    const p = s.player;
    s.runEquippedWeapons = persistent.equippedWeapons.length > 0 ? [...persistent.equippedWeapons] : ['standard'];
    p.x = WORLD_SIZE / 2; p.y = WORLD_SIZE / 2; p.hp = 100; p.bread = 0; p.ammo = 60; p.xp = 0; p.level = 1; p.nextLevelXp = 100; p.specialWep = null;
    s.bullets = []; s.enemies = []; s.loots = []; s.obstacles = []; s.chests = []; s.particles = []; s.extractionZone = null;
    s.status = 'playing'; s.timer = 60;
    s.lastTime = performance.now();

    // Generate Map
    for (let i = 0; i < 40; i++) {
      const w = 200 + Math.random()*300, h = 200 + Math.random()*300;
      s.obstacles.push({ x: Math.random()*(WORLD_SIZE-w), y: Math.random()*(WORLD_SIZE-h), w, h });
    }
    for (let i = 0; i < 60; i++) {
      s.enemies.push({ x: Math.random()*WORLD_SIZE, y: Math.random()*WORLD_SIZE, radius: 25, hp: 10, maxHp: 10, isElite: Math.random()>0.9, id: s.nextId++ });
    }
    for (let i = 0; i < 6; i++) {
      s.chests.push({ x: Math.random()*WORLD_SIZE, y: Math.random()*WORLD_SIZE, radius: 35, isOpened: false, progress: 0, id: s.nextId++ });
    }
    for (let i = 0; i < 120; i++) {
      s.loots.push({ x: Math.random()*WORLD_SIZE, y: Math.random()*WORLD_SIZE, radius: 10, type: Math.random()>0.3?'bread':'ammo', id: s.nextId++ });
    }

    setView('playing');
    setTimeout(() => requestAnimationFrame(loop), 100);
  };

  const loop = (time: number) => {
    const s = gameState.current;
    if (s.status !== 'playing') return;
    const dt = Math.min((time - s.lastTime) / 1000, 0.1);
    s.lastTime = time;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  };

  const update = (dt: number) => {
    const s = gameState.current; const p = s.player;

    // Movement & Collision (Axis Separated)
    let dx = 0, dy = 0;
    const speed = 7.5;
    if (keys.current['KeyW']) dy -= speed; if (keys.current['KeyS']) dy += speed;
    if (keys.current['KeyA']) dx -= speed; if (keys.current['KeyD']) dx += speed;
    
    let nx = p.x + dx;
    let ny = p.y + dy;

    let canX = nx > 0 && nx < WORLD_SIZE;
    let canY = ny > 0 && ny < WORLD_SIZE;

    for (const o of s.obstacles) {
      if (checkCollision(nx, p.y, p.radius, o.x, o.y, o.w, o.h)) canX = false;
      if (checkCollision(p.x, ny, p.radius, o.x, o.y, o.w, o.h)) canY = false;
    }
    if (canX) p.x = nx;
    if (canY) p.y = ny;

    // Chest Logic
    let curChest = s.chests.find(c => !c.isOpened && Math.hypot(c.x - p.x, c.y - p.y) < 100);
    if (curChest && dx === 0 && dy === 0) {
      curChest.progress += dt;
      if (curChest.progress >= CHEST_OPEN_TIME) {
        curChest.isOpened = true;
        p.specialWep = { name: '超导激光', damage: 40, fireRate: 60, color: '#00f2ff', isSpecial: true };
        // Explode rewards
        for(let i=0; i<8; i++) s.loots.push({ x: curChest.x+(Math.random()-0.5)*100, y: curChest.y+(Math.random()-0.5)*100, radius: 10, type: 'bread', id: s.nextId++ });
        for(let i=0; i<3; i++) s.loots.push({ x: curChest.x+(Math.random()-0.5)*100, y: curChest.y+(Math.random()-0.5)*100, radius: 10, type: 'ammo', id: s.nextId++ });
        spawnParticles(curChest.x, curChest.y, COLORS.chest, 30);
        setScreenShake(20);
      }
    } else {
      s.chests.forEach(c => c.progress = 0);
    }

    // Shooting
    const now = Date.now();
    const curWepKey = s.runEquippedWeapons[p.currentWepIdx] as keyof typeof WEAPONS || 'standard';
    const wep = p.specialWep || WEAPONS[curWepKey] || WEAPONS.standard;
    if (keys.current['mousedown'] && now - s.lastShot > wep.fireRate && p.ammo > 0) {
      const angle = Math.atan2(mousePos.current.y - CANVAS_HEIGHT/2, mousePos.current.x - CANVAS_WIDTH/2);
      const count = wep.count || 1;
      for (let i = 0; i < count; i++) {
        const spread = wep.spread ? (Math.random()-0.5)*wep.spread : 0;
        s.bullets.push({ 
          x: p.x, y: p.y, 
          vx: Math.cos(angle+spread)*18, 
          vy: Math.sin(angle+spread)*18, 
          radius: wep.isSpecial?10:6, 
          damage: wep.damage, 
          color: wep.color, 
          id: s.nextId++, 
          pierce: wep.pierce || 0,
          isSpecial: wep.isSpecial
        });
      }
      p.ammo--; s.lastShot = now;
      if (wep.isSpecial) setScreenShake(4);
    }

    // Bullets vs Enemies
    s.bullets.forEach(b => { b.x += b.vx; b.y += b.vy; });
    s.bullets = s.bullets.filter(b => {
      let hit = false;
      for (const e of s.enemies) {
        if (Math.hypot(b.x - e.x, b.y - e.y) < e.radius + b.radius) {
          e.hp -= b.damage; spawnParticles(b.x, b.y, b.color, 4);
          if (b.pierce > 0) b.pierce--; else { hit = true; break; }
        }
      }
      return !hit && Math.abs(b.x - p.x) < 1200;
    });

    // Enemies vs Player
    s.enemies.forEach(e => {
      const angle = Math.atan2(p.y - e.y, p.x - e.x);
      e.x += Math.cos(angle)*ENEMY_SPEED; e.y += Math.sin(angle)*ENEMY_SPEED;
      if (Math.hypot(e.x - p.x, e.y - p.y) < e.radius + p.radius) {
        p.hp -= 1; setScreenShake(10);
      }
    });
    s.enemies = s.enemies.filter(e => {
      if (e.hp <= 0) {
        s.loots.push({ x: e.x, y: e.y, radius: 10, type: 'xp', id: s.nextId++ });
        spawnParticles(e.x, e.y, COLORS.enemy, 15);
        return false;
      }
      return true;
    });

    // Loot
    s.loots = s.loots.filter(l => {
      if (Math.hypot(l.x - p.x, l.y - p.y) < p.radius + l.radius) {
        if (l.type === 'bread') p.bread++;
        else if (l.type === 'ammo') p.ammo += 25;
        else p.xp += 40;
        return false;
      }
      return true;
    });

    // Level up
    if (p.xp >= p.nextLevelXp) {
      p.xp -= p.nextLevelXp; p.level++; p.nextLevelXp *= 1.5;
      setView('levelup'); s.status = 'paused'; return;
    }

    // Extraction Point
    if (p.bread >= 5) {
      if (!s.extractionZone) {
        let ex, ey; 
        let attempts = 0;
        do { 
          ex = 500 + Math.random() * (WORLD_SIZE - 1000); 
          ey = 500 + Math.random() * (WORLD_SIZE - 1000); 
          attempts++;
        } while(Math.hypot(ex - p.x, ey - p.y) < 1300 && attempts < 20);
        s.extractionZone = { x: ex, y: ey };
      }
      
      s.timer -= dt; 
      if (s.timer <= 0) { 
        handleDeath(); 
        return; 
      }
      
      if (s.extractionZone && Math.hypot(p.x - s.extractionZone.x, p.y - s.extractionZone.y) < 130) {
        s.status = 'extracted';
        // 关键修复：先更新持久化数据，再切换视图，防止渲染冲突
        const finalBread = persistent.totalBread + p.bread;
        setPersistent(prev => ({ ...prev, totalBread: finalBread }));
        setView('result');
        return;
      }
    }

    // Particles & FX
    s.particles.forEach(pt => { pt.x += pt.vx; pt.y += pt.vy; pt.life -= dt; });
    s.particles = s.particles.filter(pt => pt.life > 0);
    if (screenShake > 0) setScreenShake(v => v * 0.9);

    if (p.hp <= 0) { handleDeath(); return; }

    setUi({ hp: Math.ceil(p.hp), bread: p.bread, ammo: p.ammo, xp: p.xp/p.nextLevelXp, level: p.level, opening: curChest?.progress || 0, weapon: wep.name, timer: Math.max(0, Math.ceil(s.timer)) });
  };

  const handleDeath = () => {
    const s = gameState.current; s.status = 'dead';
    setPersistent(prev => {
      const newOwned = prev.ownedWeapons.filter((w: string) => !prev.equippedWeapons.includes(w) || w === 'standard');
      return { ...prev, ownedWeapons: newOwned, equippedWeapons: ['standard'] };
    });
    setView('result');
  };

  const draw = () => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const s = gameState.current; const p = s.player;
    const ox = CANVAS_WIDTH/2 - p.x + (Math.random()-0.5)*screenShake;
    const oy = CANVAS_HEIGHT/2 - p.y + (Math.random()-0.5)*screenShake;

    ctx.fillStyle = COLORS.bg; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Grid
    ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1;
    for(let i=0; i<=WORLD_SIZE; i+=200) {
      ctx.beginPath(); ctx.moveTo(i+ox, oy); ctx.lineTo(i+ox, WORLD_SIZE+oy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox, i+oy); ctx.lineTo(WORLD_SIZE+ox, i+oy); ctx.stroke();
    }

    // Obstacles
    ctx.fillStyle = '#111122'; ctx.strokeStyle = COLORS.bullet;
    s.obstacles.forEach(o => { ctx.fillRect(o.x+ox, o.y+oy, o.w, o.h); ctx.strokeRect(o.x+ox, o.y+oy, o.w, o.h); });

    // Extraction Point
    if (s.extractionZone) {
      ctx.beginPath(); ctx.arc(s.extractionZone.x+ox, s.extractionZone.y+oy, 130, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(0, 255, 136, 0.2)'; ctx.fill(); ctx.strokeStyle = COLORS.chest; ctx.lineWidth = 4; ctx.stroke();
      const angle = Math.atan2(s.extractionZone.y-p.y, s.extractionZone.x-p.x);
      ctx.save(); ctx.translate(CANVAS_WIDTH/2, CANVAS_HEIGHT/2); ctx.rotate(angle);
      ctx.beginPath(); ctx.moveTo(60, -15); ctx.lineTo(90, 0); ctx.lineTo(60, 15); ctx.closePath(); ctx.fillStyle = COLORS.chest; ctx.fill(); ctx.restore();
    }

    // Entities
    s.chests.forEach(c => {
      ctx.fillStyle = c.isOpened ? '#1a1a1a' : COLORS.chest;
      ctx.fillRect(c.x+ox-25, c.y+oy-20, 50, 40);
      if(!c.isOpened) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(c.x+ox-25, c.y+oy-20, 50, 40); }
    });
    s.loots.forEach(l => {
      ctx.beginPath(); ctx.arc(l.x+ox, l.y+oy, l.radius, 0, Math.PI*2);
      ctx.fillStyle = l.type==='bread'?'#f1c40f':l.type==='ammo'?'#00d2ff':'#a55eea'; ctx.fill();
    });
    s.particles.forEach(pt => {
      ctx.globalAlpha = pt.life; ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x+ox, pt.y+oy, pt.size, pt.size);
    });
    ctx.globalAlpha = 1;
    s.enemies.forEach(e => {
      ctx.beginPath(); ctx.arc(e.x+ox, e.y+oy, e.radius, 0, Math.PI*2);
      ctx.fillStyle = e.isElite ? COLORS.elite : COLORS.enemy; ctx.fill();
      ctx.fillStyle = COLORS.enemy; ctx.fillRect(e.x+ox-20, e.y+oy-40, 40, 5);
      ctx.fillStyle = '#00ff88'; ctx.fillRect(e.x+ox-20, e.y+oy-40, (e.hp/e.maxHp)*40, 5);
    });
    s.bullets.forEach(b => {
      ctx.beginPath(); ctx.arc(b.x+ox, b.y+oy, b.radius, 0, Math.PI*2);
      ctx.fillStyle = b.color; ctx.shadowBlur = 15; ctx.shadowColor = b.color; ctx.fill(); ctx.shadowBlur = 0;
    });

    // Player
    ctx.save(); ctx.translate(CANVAS_WIDTH/2, CANVAS_HEIGHT/2); ctx.rotate(p.angle);
    ctx.beginPath(); ctx.ellipse(0, 0, 22, 15, 0, 0, Math.PI*2); ctx.fillStyle = COLORS.player; ctx.shadowBlur = 20; ctx.shadowColor = COLORS.player; ctx.fill(); ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(14, -5, 11, 0, Math.PI*2); ctx.fillStyle = COLORS.player; ctx.fill();
    ctx.beginPath(); ctx.moveTo(22, -5); ctx.lineTo(34, -3); ctx.lineTo(22, 0); ctx.closePath(); ctx.fillStyle = '#ff9f43'; ctx.fill();
    ctx.restore();
  };

  const mousePos = useRef<Point>({ x: 0, y: 0 });
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      mousePos.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mousedown', () => keys.current['mousedown'] = true);
    window.addEventListener('mouseup', () => keys.current['mouseup'] = false);
    return () => window.removeEventListener('mousemove', move);
  }, []);

  return (
    <div style={{ backgroundColor: COLORS.bg, minHeight: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'Microsoft YaHei, Arial', overflow: 'hidden' }}>
      
      {view === 'start' && (
        <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.05)', padding: '60px', borderRadius: '40px', border: '1px solid #333' }}>
          <h1 style={{ fontSize: '72px', color: COLORS.player, margin: 0, textShadow: `0 0 20px ${COLORS.player}` }}>鸭口脱险</h1>
          <p style={{ letterSpacing: '5px', color: '#666', fontSize: '20px' }}>NEON PROTOCOL FINAL</p>
          <div style={{ marginTop: '40px' }}>
            <button onClick={() => setView('prep')} style={{ padding: '15px 50px', fontSize: '22px', background: COLORS.player, color: '#000', border: 'none', cursor: 'pointer', borderRadius: '12px', fontWeight: 'bold' }}>启动协议</button>
            <button onClick={() => setView('shop')} style={{ marginLeft: '20px', padding: '15px 50px', fontSize: '22px', background: 'none', border: `2px solid ${COLORS.player}`, color: COLORS.player, cursor: 'pointer', borderRadius: '12px' }}>基地商店</button>
          </div>
          <p style={{ marginTop: '20px', color: '#888' }}>仓库余额: {persistent.totalBread} 🥖</p>
        </div>
      )}

      {view === 'shop' && (
        <div style={{ padding: '40px', maxWidth: '900px', width: '90%', background: '#111', borderRadius: '30px', border: '1px solid #333' }}>
          <h2 style={{ textAlign: 'center', color: COLORS.player }}>基地商店</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginTop: '20px' }}>
            {Object.values(WEAPONS).map(w => (
              <div key={w.id} style={{ background: '#222', padding: '20px', borderRadius: '15px', border: '1px solid #444' }}>
                <strong style={{ color: w.color }}>{w.name}</strong>
                <p style={{ fontSize: '12px', color: '#888' }}>{w.id==='standard'?'基础装备':'强力武器'}</p>
                <div style={{ color: COLORS.player }}>价格: {w.price || 0} 🥖</div>
                {persistent.ownedWeapons.includes(w.id) ? <button disabled style={{marginTop:'10px'}}>已拥有</button> : <button onClick={() => { if(persistent.totalBread>=(w.price||0)) setPersistent(p => ({...p, totalBread: p.totalBread-(w.price||0), ownedWeapons:[...p.ownedWeapons, w.id]})); }} style={{marginTop:'10px', background:COLORS.player, color:'#000', border:'none', padding:'8px 15px', borderRadius:'5px'}}>购买</button>}
              </div>
            ))}
          </div>
          <button onClick={() => setView('start')} style={{ display:'block', margin:'30px auto 0', padding:'10px 40px' }}>返回</button>
        </div>
      )}

      {view === 'prep' && (
        <div style={{ textAlign: 'center', background: '#111', padding: '50px', borderRadius: '30px' }}>
          <h2>准备出击</h2>
          <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', margin: '40px 0' }}>
            {persistent.ownedWeapons.map((wid: string) => (
              <div key={wid} onClick={() => { setPersistent(p => { let eq = [...p.equippedWeapons]; if(eq.includes(wid)) { if(eq.length>1) eq = eq.filter(i=>i!==wid); } else { if(eq.length<2) eq.push(wid); } return {...p, equippedWeapons: eq}; }); }} style={{ background: persistent.equippedWeapons.includes(wid)?COLORS.player:'#222', color: persistent.equippedWeapons.includes(wid)?'#000':'#fff', padding:'20px', borderRadius:'15px', cursor:'pointer', width:'130px' }}>{WEAPONS[wid as keyof typeof WEAPONS].name}</div>
            ))}
          </div>
          <button onClick={startGame} style={{ padding:'15px 50px', background:COLORS.chest, fontSize:'24px', color:'#fff', border:'none', borderRadius:'12px', cursor:'pointer' }}>确认并进场</button>
        </div>
      )}

      {view === 'playing' && (
        <div style={{ position: 'relative' }}>
          <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} style={{ border: `3px solid ${COLORS.player}`, borderRadius: '20px' }} />
          <div style={{ position: 'absolute', top: 25, left: 25, width: '230px', background: 'rgba(0,0,0,0.85)', padding: '15px', borderRadius: '15px' }}>
            <div style={{ color: COLORS.player, fontWeight: 'bold' }}>武器: {ui.weapon} <span style={{fontSize:'10px', color:'#666'}}>(Q切换)</span></div>
            <div style={{ color: ui.hp < 40 ? COLORS.enemy : '#fff' }}>❤️ 生命: {ui.hp}</div>
            <div style={{ color: COLORS.bullet }}>💧 弹药: {ui.ammo}</div>
            <div style={{ color: ui.bread >= 5 ? COLORS.chest : '#fff' }}>🥖 面包: {ui.bread} / 5</div>
            <div style={{ height: '6px', background: '#222', marginTop: '10px', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${ui.xp*100}%`, height: '100%', background: '#a55eea' }} />
            </div>
            {ui.bread >= 5 && <div style={{ textAlign: 'center', fontSize: '24px', color: COLORS.enemy, fontWeight: 'bold', marginTop: '10px' }}>⏳ {ui.timer}s</div>}
          </div>
          {ui.opening > 0 && (
            <div style={{ position: 'absolute', bottom: 120, left: '50%', transform: 'translateX(-50%)' }}>
              <div style={{ color: COLORS.chest, textAlign:'center', fontSize:'12px' }}>解密宝箱中...</div>
              <div style={{ width: '250px', height: '12px', background: '#000', borderRadius: '6px', overflow: 'hidden', border: `2px solid ${COLORS.chest}` }}>
                <div style={{ width: `${(ui.opening / CHEST_OPEN_TIME) * 100}%`, height: '100%', background: COLORS.chest }} />
              </div>
            </div>
          )}
        </div>
      )}

      {view === 'levelup' && (
        <div style={{ textAlign: 'center', background: '#111', padding: '50px', borderRadius: '30px', border: `2px solid #a55eea` }}>
          <h2 style={{ color: '#a55eea' }}>等级提升！</h2>
          <div style={{ display: 'flex', gap: '20px', marginTop: '30px' }}>
            {['急速射击', '强化弹头', '战术护甲'].map(c => (
              <div key={c} onClick={() => { gameState.current.status = 'playing'; gameState.current.lastTime = performance.now(); setView('playing'); requestAnimationFrame(loop); }} style={{ background: '#222', padding: '25px', borderRadius: '15px', cursor: 'pointer', border: '1px solid #444', width: '150px' }}>{c}</div>
            ))}
          </div>
        </div>
      )}

      {view === 'result' && (
        <div style={{ textAlign: 'center', background: '#111', padding: '50px', borderRadius: '30px' }}>
          <h1 style={{ color: gameState.current.status==='extracted'?COLORS.chest:COLORS.enemy }}>{gameState.current.status==='extracted'?'撤离成功':'任务失败'}</h1>
          <p>回收面包: {ui.bread} 🥖</p>
          <button onClick={() => setView('start')} style={{ padding:'10px 40px', cursor:'pointer' }}>回到基地</button>
        </div>
      )}
    </div>
  );
};

export default Game;
