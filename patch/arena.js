function mulberry32(a) {
            return function () {
                a |= 0; a = a + 0x6D2B79F5 | 0;
                let t = Math.imul(a ^ a >>> 15, 1 | a);
                t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
                return ((t ^ t >>> 14) >>> 0) / 4294967296;
            };
        }

        // Bot loadouts depend only on the arena number so every client builds identical bots from the shared seed.
        function chooseBotWeaponId(arenaNum) {
            const ids = Object.keys(WEAPONS);
            const center = Math.min(ids.length - 1, arenaNum);
            const lo = Math.max(0, center - 2), hi = Math.min(ids.length - 1, center + 2);
            return ids[lo + Math.floor(Math.random() * (hi - lo + 1))];
        }

        function chooseBotTrackLevel(arenaNum) {
            const center = Math.min(TRACKS_UPGRADES.length, 1 + Math.floor(arenaNum / 2));
            const lo = Math.max(1, center - 2), hi = Math.min(TRACKS_UPGRADES.length, center + 2);
            return lo + Math.floor(Math.random() * (hi - lo + 1));
        }

        function chooseBotSkin() {
            const totalWeight = SKINS.reduce((total, skin) => total + 1 / (1 + skin.cost / 1000), 0);
            let selection = Math.random() * totalWeight;
            for (const skin of SKINS) {
                selection -= 1 / (1 + skin.cost / 1000);
                if (selection <= 0) return skin.id;
            }
            return SKINS[0].id;
        }

        // roster: 12 entries (human {id,name,weapon,skin,trackLevel,maxHp} or null for a BOT). mySlot: this client's slot.
        function generateArena(arenaNum, seed, roster, mySlot) {
            const realRandom = Math.random;
            Math.random = mulberry32(seed || 1);
            try {
                walls = []; barrels = []; powerups = []; tanks = []; bullets = []; particles = []; scrapDrops = [];
                arenaBoundary = { x: 100, y: 100, w: WORLD_WIDTH - 200, h: WORLD_HEIGHT - 200, shrinkRate: 0.1 + (arenaNum * 0.02) };

                const wallThickness = 18;
                walls.push({ x: 0, y: 0, w: WORLD_WIDTH, h: wallThickness, destructible: false });
                walls.push({ x: 0, y: WORLD_HEIGHT - wallThickness, w: WORLD_WIDTH, h: wallThickness, destructible: false });
                walls.push({ x: 0, y: 0, w: wallThickness, h: WORLD_HEIGHT, destructible: false });
                walls.push({ x: WORLD_WIDTH - wallThickness, y: 0, w: wallThickness, h: WORLD_HEIGHT, destructible: false });

                const numObstacles = 22 + Math.min(arenaNum * 3, 12);
                for (let i = 0; i < numObstacles; i++) {
                    const isVertical = Math.random() > 0.5;
                    const w = isVertical ? 22 : (140 + Math.random() * 160);
                    const h = isVertical ? (140 + Math.random() * 160) : 22;
                    const x = 300 + Math.random() * (WORLD_WIDTH - 600 - w);
                    const y = 300 + Math.random() * (WORLD_HEIGHT - 600 - h);
                    const destructible = Math.random() > 0.35;
                    if (Math.hypot(x + w / 2 - WORLD_WIDTH / 2, y + h / 2 - WORLD_HEIGHT / 2) < 400) continue;
                    walls.push({ x, y, w, h, destructible, hp: 120, maxHp: 120 });
                }

                const numBarrels = 18 + arenaNum * 2;
                let barrelId = 0;
                for (let i = 0; i < numBarrels; i++) {
                    const bx = 300 + Math.random() * (WORLD_WIDTH - 600);
                    const by = 300 + Math.random() * (WORLD_HEIGHT - 600);
                    if (Math.hypot(bx - WORLD_WIDTH / 2, by - WORLD_HEIGHT / 2) < 300) continue;
                    barrels.push({ id: barrelId++, x: bx, y: by, radius: 18, hp: 1, maxHp: 1 });
                }

                const SLOTS = 12;
                const spawns = [];
                for (let i = 0; i < SLOTS; i++) {
                    let placed = false, attempts = 0;
                    while (!placed && attempts < 150) {
                        attempts++;
                        const angle = (i / SLOTS) * Math.PI * 2 + (Math.random() * 0.4);
                        const dist = 900 + Math.random() * 600;
                        const ex = WORLD_WIDTH / 2 + Math.cos(angle) * dist;
                        const ey = WORLD_HEIGHT / 2 + Math.sin(angle) * dist;
                        if (ex > 250 && ex < WORLD_WIDTH - 250 && ey > 250 && ey < WORLD_HEIGHT - 250 && isPositionClear(ex, ey, 26)) {
                            spawns.push({ x: ex, y: ey }); placed = true;
                        }
                    }
                    if (!placed) spawns.push({ x: WORLD_WIDTH / 2 + (i - 6) * 120, y: WORLD_HEIGHT / 2 + 700 });
                }

                let bossAssigned = false;
                for (let i = 0; i < SLOTS; i++) {
                    const spawn = spawns[i];
                    const human = roster && roster[i];
                    if (i === mySlot) {
                        player = {
                            id: mp.myId, name: mp.displayName(),
                            x: spawn.x, y: spawn.y, radius: 24, angle: 0, turretAngle: 0,
                            speed: playerState.speed, hp: playerState.hp, maxHp: playerState.maxHp,
                            trackLevel: playerState.trackLevel, trackColor: TRACK_COLORS[playerState.trackLevel - 1],
                            flameFuel: 100, maxFlameFuel: 100, flameShotThisFrame: false,
                            lastShot: 0, color: SKINS.find(s => s.id === playerState.activeSkin)?.color || '#38bdf8', skin: playerState.activeSkin
                        };
                    } else if (human) {
                        const lvl = Math.max(1, Math.min(TRACKS_UPGRADES.length, human.trackLevel | 0 || 1));
                        tanks.push({
                            id: human.id, name: human.name, isHuman: true, type: 'human',
                            x: spawn.x, y: spawn.y, tx: spawn.x, ty: spawn.y, radius: 24, angle: 0, turretAngle: 0,
                            hp: human.maxHp, maxHp: human.maxHp, color: '#38bdf8',
                            weaponId: WEAPONS[human.weapon] ? human.weapon : 'starter', trackLevel: lvl, trackColor: TRACK_COLORS[lvl - 1],
                            skin: SKINS.some(s => s.id === human.skin) ? human.skin : 'standard', lastShot: 0, speed: 0
                        });
                    } else {
                        const types = ['rusher', 'sniper', 'turret'];
                        if (arenaNum >= 2) types.push('boss');
                        let type = types[Math.floor(Math.random() * types.length)];
                        if (!bossAssigned && arenaNum >= 2) { type = 'boss'; bossAssigned = true; }
                        const weaponId = chooseBotWeaponId(arenaNum);
                        const trackLevel = chooseBotTrackLevel(arenaNum);
                        const trackUpgrade = TRACKS_UPGRADES[trackLevel - 1];
                        const typeSpeedMultiplier = type === 'rusher' ? 1.06 : (type === 'boss' ? 0.53 : 0.66);
                        const weapon = WEAPONS[weaponId];
                        const hp = type === 'boss' ? 280 : (type === 'sniper' ? 70 : 110);
                        tanks.push({
                            id: 'b' + i, name: 'BOT', x: spawn.x, y: spawn.y, tx: spawn.x, ty: spawn.y,
                            radius: 24, angle: Math.random() * Math.PI * 2, turretAngle: 0,
                            speed: trackUpgrade.speed * typeSpeedMultiplier, hp, maxHp: hp,
                            type, color: type === 'boss' ? '#ef4444' : (type === 'rusher' ? '#f97316' : (type === 'sniper' ? '#a855f7' : '#eab308')),
                            weaponId, trackLevel, trackColor: TRACK_COLORS[trackLevel - 1], skin: chooseBotSkin(),
                            lastShot: 0, shootInterval: Math.max(450, weapon.fireRate * (type === 'sniper' ? 1.5 : (type === 'boss' ? 0.85 : 1.15)))
                        });
                    }
                }
            } finally {
                Math.random = realRandom;
            }
            survivalTimer = 0;
            creditsEarnedThisRun = 0;
        }

        
