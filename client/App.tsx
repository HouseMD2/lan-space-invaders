import React, { useEffect, useMemo, useRef, useState } from 'react';
const start = () => socketRef.current?.emit('start');


// Keyboard controls (web)
const keys = useRef<Record<string,boolean>>({});
useEffect(() => {
const down = (e: KeyboardEvent) => { keys.current[e.code] = true; };
const up = (e: KeyboardEvent) => { keys.current[e.code] = false; };
if (typeof window !== 'undefined') {
window.addEventListener('keydown', down);
window.addEventListener('keyup', up);
}
const id = setInterval(() => {
const x = (keys.current['KeyD']?1:0) - (keys.current['KeyA']?1:0);
const y = (keys.current['KeyS']?1:0) - (keys.current['KeyW']?1:0);
const shoot = !!keys.current['Space'];
socketRef.current?.emit('input', { x, y, shoot });
}, 33); // ~30Hz input
return () => { clearInterval(id); if (typeof window!=='undefined'){window.removeEventListener('keydown', down); window.removeEventListener('keyup', up);} };
}, []);


const palette = useMemo(() => ({
bg: '#000000', fg: '#00FF00' // default green/black; make selectable later
}), []);


const hudTime = Math.ceil((state.timeLeftMs||0)/1000);


return (
<View style={{ flex:1, alignItems:'center', justifyContent:'flex-start', padding:16, gap:12 }}>
<Text style={{ fontSize:24, fontWeight:'700' }}>LAN Space Invaders</Text>
<Text style={{ opacity:0.7 }}>{connected ? 'Connected' : 'Connecting...'}</Text>


<View style={{ flexDirection:'row', gap:8, alignItems:'center' }}>
<TextInput placeholder="Your name" value={name} onChangeText={setName} style={{ borderWidth:1, paddingHorizontal:8, paddingVertical:6, minWidth:180 }} />
<Button title="Join" onPress={join} />
<Button title="Start (2+ players)" onPress={start} />
</View>


<View style={{ width: state.world.width, height: state.world.height, borderWidth:1, borderColor:'#444' }}>
<Svg width={state.world.width} height={state.world.height}>
{/* background */}
<Rect x={0} y={0} width={state.world.width} height={state.world.height} fill={palette.bg} />


{/* Asteroids (line circles) */}
{state.asteroids.map((a:any) => (
<Circle key={a.id} cx={a.x} cy={a.y} r={a.r} stroke={palette.fg} strokeWidth={1} fill="none" />
))}


{/* Bullets */}
{state.bullets.map((b:any) => (
<Line key={b.id} x1={b.x} y1={b.y} x2={b.x} y2={b.y-10} stroke={palette.fg} strokeWidth={2} />
))}


{/* Players (triangles as lines) */}
{state.players.map((p:Player) => (
<>
<Line key={p.id+':a'} x1={p.x} y1={p.y-12} x2={p.x-12} y2={p.y+12} stroke={palette.fg} strokeWidth={2}/>
<Line key={p.id+':b'} x1={p.x} y1={p.y-12} x2={p.x+12} y2={p.y+12} stroke={palette.fg} strokeWidth={2}/>
<Line key={p.id+':c'} x1={p.x-12} y1={p.y+12} x2={p.x+12} y2={p.y+12} stroke={palette.fg} strokeWidth={2}/>
</>
))}


{/* HUD */}
<Line x1={0} y1={40} x2={state.world.width} y2={40} stroke={palette.fg} strokeWidth={1} />
</Svg>
</View>


{/* Simple HUD text */}
<Text style={{ color:'#333' }}>Level: {state.level} | Time left: {hudTime}s | Players: {state.players.length}</Text>
<View style={{ gap:4 }}>
{state.players.map((p:Player) => (
<Text key={p.id}>{p.name}: Level {p.levelScore} Total {p.totalScore} HP {p.hp}</Text>
))}
</View>


<Text style={{ marginTop:12, opacity:0.7 }}>Controls: WASD to move, Space to shoot.</Text>
</View>
);
}