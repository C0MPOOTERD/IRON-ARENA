// ================= ONLINE MULTIPLAYER + ACCOUNTS =================
const $ = id => document.getElementById(id);
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }

const mp = {
    ws: null, myId: null, myName: '', token: lsGet('ia_token'),
    guestName: 'Guest' + (1000 + Math.floor(Math.random() * 9000)),
    inMatch: false, hostId: null, dead: false, specId: null, lastHitBy: null,
    lastTick: 0, lobbyEnd: 0, lobbyTimer: null, endTimer: null, pending: null,
    isHost() { return this.inMatch && this.hostId === this.myId; },
    displayName() { return playerState.username || this.guestName; }
};
playerState.username = null;
let lastSaved = '';
let saveTimer = null;

function flashToast(title, sub) {
    $('takedown-title').innerText = title; $('takedown-reward').innerText = sub || ''; $('takedown-xp').innerText = '';
    const t = $('takedown-toast');
    t.classList.remove('opacity-0', 'scale-95');
    setTimeout(() => t.classList.add('opacity-0', 'scale-95'), 2500);
}

// ---------- accounts & saving ----------
async function api(path, body, method) {
    try {
        const headers = { 'Content-Type': 'application/json' };
        if (mp.token) headers.Authorization = 'Bearer ' + mp.token;
        const r = await fetch(path, { method: method || 'POST', headers, body: body ? JSON.stringify(body) : undefined });
        return await r.json();
    } catch (e) { return { error: 'Cannot reach the game server.' }; }
}

function applySave(d) {
    d = d || {};
    const clampLevel = (v, max) => Math.min(max, Math.max(1, (v | 0) || 1));
    playerState.credits = Number.isFinite(d.credits) ? d.credits : 1500;
    playerState.xp = Number.isFinite(d.xp) ? d.xp : 0;
    playerState.arena = Math.max(1, (d.arena | 0) || 1);
    playerState.armorLevel = clampLevel(d.armorLevel, ARMOR_UPGRADES.length);
    playerState.maxHp = ARMOR_UPGRADES[playerState.armorLevel - 1].maxHp;
    playerState.hp = playerState.maxHp;
    playerState.trackLevel = clampLevel(d.trackLevel, TRACKS_UPGRADES.length);
    playerState.speed = TRACKS_UPGRADES[playerState.trackLevel - 1].speed;
    playerState.weapons = ['starter', ...(Array.isArray(d.weapons) ? d.weapons : []).filter(id => WEAPONS[id] && id !== 'starter')];
    playerState.activeWeapon = playerState.weapons.includes(d.activeWeapon) ? d.activeWeapon : 'starter';
    playerState.unlockedSkins = ['standard', ...(Array.isArray(d.unlockedSkins) ? d.unlockedSkins : []).filter(id => SKINS.some(s => s.id === id) && id !== 'standard')];
    playerState.activeSkin = playerState.unlockedSkins.includes(d.activeSkin) ? d.activeSkin : 'standard';
    playerState.rapidFireTimer = 0;
}

function snapshotSave() {
    return {
        credits: Math.floor(playerState.credits), xp: Math.floor(playerState.xp), arena: playerState.arena,
        armorLevel: playerState.armorLevel, trackLevel: playerState.trackLevel,
        weapons: playerState.weapons, activeWeapon: playerState.activeWeapon,
        unlockedSkins: playerState.unlockedSkins, activeSkin: playerState.activeSkin
    };
}

function mpSaveNow() {
    if (!mp.token || !playerState.username) return;
    const body = JSON.stringify(snapshotSave());
    if (body === lastSaved) return;
    lastSaved = body;
    fetch('/api/save', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + mp.token }, body })
        .catch(() => { lastSaved = ''; });
}
function mpQueueSave() {
    if (!mp.token || !playerState.username) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(mpSaveNow, 1500);
}
setInterval(mpSaveNow, 30000);
window.addEventListener('pagehide', mpSaveNow);

function refreshAuthUI() {
    const signedIn = !!playerState.username;
    $('auth-guest').classList.toggle('hidden', signedIn);
    $('auth-user').classList.toggle('hidden', !signedIn);
    $('auth-user').classList.toggle('flex', signedIn);
    $('auth-name').innerText = playerState.username || '';
}

let authMode = 'signup';
function openAuth(mode) {
    authMode = mode;
    $('auth-title').innerText = mode === 'signup' ? 'CREATE ACCOUNT' : 'LOG IN';
    $('btn-auth-submit').innerText = mode === 'signup' ? 'SIGN UP' : 'LOG IN';
    $('auth-password').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    $('auth-error').innerText = '';
    $('modal-auth').classList.remove('hidden');
    $('auth-username').focus();
}
async function submitAuth() {
    const username = $('auth-username').value.trim();
    const password = $('auth-password').value;
    $('auth-error').innerText = '';
    $('btn-auth-submit').disabled = true;
    const r = await api('/api/' + authMode, { username, password });
    $('btn-auth-submit').disabled = false;
    if (!r.ok) { $('auth-error').innerText = r.error || 'Something went wrong.'; return; }
    mp.token = r.token; lsSet('ia_token', r.token);
    playerState.username = r.username;
    applySave(r.data);
    playerState.infinite = !!r.infinite; applyInfinite();
    lastSaved = JSON.stringify(snapshotSave());
    $('auth-password').value = '';
    $('modal-auth').classList.add('hidden');
    refreshAuthUI();
    sound.playClick();
}
$('btn-signup').addEventListener('click', () => { sound.init(); sound.playClick(); openAuth('signup'); });
$('btn-login').addEventListener('click', () => { sound.init(); sound.playClick(); openAuth('login'); });
$('btn-auth-close').addEventListener('click', () => { sound.playClick(); $('modal-auth').classList.add('hidden'); });
$('btn-auth-submit').addEventListener('click', submitAuth);
['auth-username', 'auth-password'].forEach(id => $(id).addEventListener('keydown', e => { if (e.key === 'Enter') submitAuth(); }));
$('btn-logout').addEventListener('click', async () => {
    sound.playClick();
    mpSaveNow();
    await api('/api/logout', {});
    mp.token = null; lsSet('ia_token', null);
    playerState.username = null; playerState.infinite = false; lastSaved = '';
    applySave({});
    refreshAuthUI();
});
(async () => {
    if (mp.token) {
        const r = await api('/api/me', null, 'GET');
        if (r.ok) { playerState.username = r.username; applySave(r.data); playerState.infinite = !!r.infinite; applyInfinite(); lastSaved = JSON.stringify(snapshotSave()); }
        else if (!/reach/.test(r.error || '')) { mp.token = null; lsSet('ia_token', null); }
    }
    refreshAuthUI();
})();

// save progress whenever the garage/shop changes
const basePopulateGarage = populateGarage;
function applyInfinite() { if (playerState.infinite) { playerState.credits = 999999999; playerState.xp = 999999999; } }
populateGarage = function (isShop) { applyInfinite(); basePopulateGarage(isShop); mpQueueSave(); };

// ---------- networking ----------
function mpSend(obj) { if (mp.ws && mp.ws.readyState === 1) mp.ws.send(JSON.stringify(obj)); }

function mpConnect(onReady, onFail) {
    if (mp.ws && mp.ws.readyState === 1 && mp.myId) { onReady(); return; }
    if (location.protocol === 'file:') { onFail(); return; }
    let welcomed = false;
    const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
    mp.ws = ws;
    mp.pending = () => { welcomed = true; onReady(); };
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', token: mp.token, guest: mp.guestName }));
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (_) { return; } mpHandle(m); };
    ws.onclose = () => {
        if (mp.ws === ws) { mp.ws = null; mp.myId = null; }
        if (!welcomed) onFail();
        else if (mp.inMatch || gameState === 'LOBBY') mpConnectionLost();
    };
}

function lobbyTick() { $('lobby-timer').innerText = Math.max(0, Math.ceil((mp.lobbyEnd - performance.now()) / 1000)); }

function mpQueue() {
    gameState = 'LOBBY';
    $('hud').classList.add('hidden');
    $('screen-lobby').classList.remove('hidden');
    $('lobby-status').innerText = 'CONNECTING...';
    $('lobby-timer').innerText = '...';
    $('lobby-count').innerText = '1';
    clearInterval(mp.lobbyTimer);
    mp.lobbyTimer = setInterval(lobbyTick, 100);
    mpConnect(() => {
        if (gameState !== 'LOBBY') return;
        mpSend({ t: 'queue', arena: playerState.arena, loadout: { weapon: playerState.activeWeapon, skin: playerState.activeSkin, trackLevel: playerState.trackLevel, armorLevel: playerState.armorLevel } });
    }, () => { if (gameState === 'LOBBY') mpOfflineMatch(); });
}

function mpOfflineMatch() {
    beginMatch({ offline: true, seed: 1 + Math.floor(Math.random() * 1e9), arena: playerState.arena, roster: Array(12).fill(null), slot: 0 });
    flashToast('OFFLINE MATCH', 'Server unreachable - fighting BOTs only');
}

function mpConnectionLost() {
    if (gameState === 'LOBBY') { mpOfflineMatch(); return; }
    if (mp.inMatch) {
        mp.inMatch = false;
        tanks = tanks.filter(t => !t.isHuman);
        flashToast('CONNECTION LOST', 'Continuing offline vs BOTs');
    }
}

function beginMatch(m) {
    clearInterval(mp.lobbyTimer);
    $('screen-lobby').classList.add('hidden');
    $('spectate-bar').classList.add('hidden');
    $('hud').classList.remove('hidden');
    mp.inMatch = !m.offline; mp.hostId = m.hostId || null; mp.dead = false; mp.specId = null; mp.lastHitBy = null;
    clearTimeout(mp.endTimer); mp.endTimer = null;
    playerState.hp = playerState.maxHp; totalCasualties = 0;
    mouse.down = false; mouse.clicked = false;
    generateArena(m.arena, m.seed, m.roster, m.slot);
    camera.x = Math.max(0, Math.min(WORLD_WIDTH - canvas.width, player.x - canvas.width / 2));
    camera.y = Math.max(0, Math.min(WORLD_HEIGHT - canvas.height, player.y - canvas.height / 2));
    gameState = 'PLAYING';
    updateHUD();
}

function mpLeave() {
    if (mp.inMatch) mpSend({ t: 'leave' });
    mp.inMatch = false; mp.dead = false;
    clearTimeout(mp.endTimer); mp.endTimer = null;
    $('spectate-bar').classList.add('hidden');
}

function removeRemoteTank(id, x, y, pu, killer, reward) {
    const i = tanks.findIndex(t => t.id === id);
    if (i < 0) return;
    const t = tanks[i];
    addExplosion(t.x, t.y, t.color, 25, true);
    tanks.splice(i, 1);
    totalCasualties++;
    scrapDrops.push({ x: x, y: y, value: 40 });
    if (pu) powerups.push({ x: x, y: y, type: pu });
    if (killer === mp.myId && !mp.dead && player) showTakedown(reward);
    updateHUD();
}

function mpHandle(m) {
    switch (m.t) {
        case 'welcome':
            mp.myId = m.id; mp.myName = m.name;
            if (mp.pending) { const p = mp.pending; mp.pending = null; p(); }
            break;
        case 'busy':
            clearInterval(mp.lobbyTimer);
            $('screen-lobby').classList.add('hidden');
            $('screen-menu').classList.remove('hidden');
            gameState = 'MENU';
            flashToast('ALREADY IN A MATCH', 'This account is playing elsewhere');
            break;
        case 'lobby':
            $('lobby-status').innerText = 'WAITING FOR PLAYERS';
            $('lobby-count').innerText = m.count;
            mp.lobbyEnd = performance.now() + m.msLeft;
            lobbyTick();
            break;
        case 'start':
            beginMatch(m);
            break;
        case 'host':
            mp.hostId = m.id;
            break;
        case 's': {
            if (!mp.inMatch) break;
            const t = tanks.find(o => o.id === m.from);
            if (t) { t.tx = m.x; t.ty = m.y; t.angle = m.a; t.turretAngle = m.ta; t.hp = m.hp; }
            break;
        }
        case 'snap': {
            if (!mp.inMatch || mp.isHost()) break;
            const seen = new Set();
            for (const [id, x, y, a, ta, hp] of m.bots) {
                seen.add(id);
                const t = tanks.find(o => o.id === id);
                if (t) { t.tx = x; t.ty = y; t.angle = a; t.turretAngle = ta; t.hp = hp; }
            }
            tanks = tanks.filter(t => t.isHuman || seen.has(t.id));
            updateHUD();
            break;
        }
        case 'shot': {
            if (!mp.inMatch || !player) break;
            for (const a of m.b) {
                bullets.push({ x: a[0], y: a[1], vx: a[2], vy: a[3], damage: a[4], radius: a[5], type: a[6], bounces: a[7], range: a[8], distTraveled: 0, color: a[9], owner: 'enemy', sourceId: a[10] || m.from });
            }
            const f = m.b[0];
            if (f && Math.hypot(f[0] - player.x, f[1] - player.y) < 900) sound.playShoot(f[6] === 'flame' ? 'flame' : (f[6] === 'mortar' ? 'mortar' : 'starter'));
            break;
        }
        case 'kill':
            if (mp.inMatch) removeRemoteTank(m.id, m.x, m.y, m.pu, m.killer, m.boss ? 250 : 80);
            break;
        case 'dead':
            if (mp.inMatch) removeRemoteTank(m.from, m.x, m.y, m.pu, m.killer, 80);
            break;
        case 'left':
            if (mp.inMatch) { const i = tanks.findIndex(t => t.id === m.id); if (i >= 0) { addExplosion(tanks[i].x, tanks[i].y, tanks[i].color, 12); tanks.splice(i, 1); updateHUD(); } }
            break;
        case 'barrel': {
            const i = barrels.findIndex(b => b.id === m.id);
            if (mp.inMatch && i >= 0) breakBarrel(i, { pu: m.pu });
            break;
        }
    }
}

function mpSendKill(t, killer) {
    if (!mp.inMatch || t.isHuman) return;
    const last = powerups[powerups.length - 1];
    const pu = last && last.x === t.x && last.y === t.y ? last.type : null;
    mpSend({ t: 'kill', id: t.id, x: Math.round(t.x), y: Math.round(t.y), pu, killer, boss: t.type === 'boss' });
}

function mpSmooth(humansOnly) {
    for (const t of tanks) {
        if (t.tx === undefined || (humansOnly && !t.isHuman)) continue;
        t.x += (t.tx - t.x) * 0.35; t.y += (t.ty - t.y) * 0.35;
    }
}

function mpTick(startLen) {
    if (!mp.inMatch) return;
    if (bullets.length > startLen) {
        const arr = bullets.slice(startLen).map(b => [Math.round(b.x), Math.round(b.y), +b.vx.toFixed(2), +b.vy.toFixed(2), b.damage, b.radius, b.type, b.bounces || 0, b.range, b.color, b.sourceId || mp.myId]);
        mpSend({ t: 'shot', b: arr });
    }
    const now = performance.now();
    if (now - mp.lastTick >= 50) {
        mp.lastTick = now;
        if (!mp.dead && player) mpSend({ t: 's', x: +player.x.toFixed(1), y: +player.y.toFixed(1), a: +player.angle.toFixed(2), ta: +player.turretAngle.toFixed(2), hp: Math.max(0, Math.ceil(player.hp)) });
        if (mp.isHost()) mpSend({ t: 'snap', bots: tanks.filter(t => !t.isHuman).map(t => [t.id, +t.x.toFixed(1), +t.y.toFixed(1), +t.angle.toFixed(2), +t.turretAngle.toFixed(2), Math.ceil(t.hp)]) });
    }
    if (gameState === 'PLAYING') {
        if (!mp.dead && tanks.length === 0) delayVictoryForTakedown();
        else if (mp.dead && tanks.length <= 1 && !mp.endTimer) {
            mp.endTimer = setTimeout(() => { mp.endTimer = null; if (mp.inMatch) triggerGameOver(false, true); }, 2000);
        }
    }
}

function enterSpectate() {
    mp.dead = true;
    mpSend({ t: 'dead', killer: mp.lastHitBy, x: Math.round(player.x), y: Math.round(player.y), pu: Math.random() > 0.5 ? 'heal' : 'rapid' });
    addExplosion(player.x, player.y, '#ef4444', 30, true);
    sound.playDeathSound();
    player.hp = 0; updateHUD();
    player.x = -5000; player.y = -5000;
    mouse.down = false; mouse.clicked = false;
    $('spectate-bar').classList.remove('hidden');
}

function followTarget() {
    if (!mp.dead) return player;
    let t = tanks.find(o => o.id === mp.specId);
    if (!t) { t = tanks[0]; mp.specId = t ? t.id : null; }
    return t || { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };
}

canvas.addEventListener('mousedown', () => {
    if (!mp.dead || !tanks.length) return;
    const i = tanks.findIndex(t => t.id === mp.specId);
    mp.specId = tanks[(i + 1) % tanks.length].id;
});
$('btn-spectate-leave').addEventListener('click', () => { sound.playClick(); triggerGameOver(false, true); });
$('btn-lobby-cancel').addEventListener('click', () => {
    sound.playClick(); mpSend({ t: 'cancel' });
    clearInterval(mp.lobbyTimer);
    $('screen-lobby').classList.add('hidden');
    $('screen-menu').classList.remove('hidden');
    sound.stopBackgroundMusic();
    gameState = 'MENU';
});

// In a live match, dying means spectating (the match goes on). Ending a match saves progress.
const baseGameOver = triggerGameOver;
triggerGameOver = function (victory, forced) {
    if (mp.inMatch) {
        if (!victory && !forced) { if (!mp.dead && gameState === 'PLAYING') enterSpectate(); return; }
        mpLeave();
    }
    baseGameOver(victory);
    mpSaveNow();
};

// "Play Arena" goes straight into matchmaking (skips the briefing screen)
$('btn-start').addEventListener('click', () => { $('btn-confirm-deploy').click(); });
