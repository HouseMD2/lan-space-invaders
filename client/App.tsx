import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, Button, Pressable, Platform } from "react-native";
import Svg, { Line, Circle, Rect, Polygon, Path } from "react-native-svg";
import { io, Socket } from "socket.io-client";

type Player = { id:string; name:string; x:number; y:number; hp:number; levelScore:number; totalScore:number };
type Ast = { id:string; x:number; y:number; r:number; verts?: {x:number;y:number}[] };

const socket = io(undefined, { transports: ["websocket"] });

// 16-color palette (CGA-ish)
const PALETTE16 = [
  "#000000","#FFFFFF","#00FF00","#FF0000","#0000FF","#FFFF00","#00FFFF","#FF00FF",
  "#008000","#800000","#000080","#808000","#008080","#800080","#808080","#C0C0C0"
];

// simple local storage helpers (web only persists)
const storeGet = (k:string, d:string) => {
  try { return (globalThis as any).localStorage?.getItem(k) ?? d; } catch { return d; }
};
const storeSet = (k:string, v:string) => {
  try { (globalThis as any).localStorage?.setItem(k, v); } catch {}
};

// hash for per-player avatar
function hashToInt(s:string) {
  let h = 0; for (let i=0;i<s.length;i++) h = ((h<<5)-h) + s.charCodeAt(i) | 0;
  return Math.abs(h);
}
function avatarShapeFor(id:string) {
  const v = hashToInt(id) % 3;
  return v === 0 ? "circle" : v === 1 ? "triangle" : "square";
}

// draw a tiny spaceship outline (triangle + fins)
function Spaceship({ x, y, fg, inner="circle" }: {x:number;y:number;fg:string;inner:"circle"|"triangle"|"square"}) {
  const ship = [
    `${x},${y-14}`, `${x-12},${y+12}`, `${x+12},${y+12}` // main triangle
  ].join(" ");
  const finL = `${x-12},${y+12} ${x-18},${y+8} ${x-10},${y+8}`;
  const finR = `${x+12},${y+12} ${x+18},${y+8} ${x+10},${y+8}`;
  return (
    <>
      <Polygon points={ship} fill="none" stroke={fg} strokeWidth={2} />
      <Polygon points={finL} fill="none" stroke={fg} strokeWidth={2} />
      <Polygon points={finR} fill="none" stroke={fg} strokeWidth={2} />
      {inner === "circle" && <Circle cx={x} cy={y+2} r={4} fill={fg} />}
      {inner === "triangle" && <Polygon points={`${x},${y-2} ${x-4},${y+6} ${x+4},${y+6}`} fill={fg} />}
      {inner === "square" && <Rect x={x-4} y={y-2} width={8} height={8} fill={fg} />}
    </>
  );
}

// convert verts to SVG path for nicer asteroids
function vertsToPath(verts:{x:number;y:number}[], cx:number, cy:number) {
  if (!verts || verts.length === 0) return "";
  let d = `M ${cx + verts[0].x} ${cy + verts[0].y}`;
  for (let i=1;i<verts.length;i++) d += ` L ${cx + verts[i].x} ${cy + verts[i].y}`;
  return d + " Z";
}

export default function App() {
  // connection + state
  const [name, setName] = useState(storeGet("lsi:name", ""));
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<any>({
    world: { width: 1200, height: 800 },
    players: [], bullets: [], asteroids: [], running: false, timeLeftMs: 0, level: 1
  });
  const socketRef = useRef<Socket|null>(null);

  // UI state
  const [showSettings, setShowSettings] = useState(false);
  const [fg, setFg] = useState(storeGet("lsi:fg", "#00FF00"));
  const [bg, setBg] = useState(storeGet("lsi:bg", "#000000"));

  useEffect(() => { storeSet("lsi:name", name); }, [name]);
  useEffect(() => { storeSet("lsi:fg", fg); }, [fg]);
  useEffect(() => { storeSet("lsi:bg", bg); }, [bg]);

  // Connect once
  useEffect(() => {
    const s = socket;
    socketRef.current = s;
    s.on("connect", () => setConnected(true));
    s.on("disconnect", () => setConnected(false));
    s.on("state", (st:any) => setState(st));
    s.on("eliminated", () => alert("You have been eliminated."));
    return () => { s.off(); };
  }, []);

  // Actions
  const join = () => socketRef.current?.emit("join", { name: name.trim() || "Player" });
  const start = () => socketRef.current?.emit("start");
  const leave = () => socketRef.current?.emit("leave");

  // Keyboard controls (web)
  const keys = useRef<Record<string,boolean>>({});
  useEffect(() => {
    const down = (e: KeyboardEvent) => { keys.current[e.code] = true; };
    const up   = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", down);
      window.addEventListener("keyup", up);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("keydown", down);
        window.removeEventListener("keyup", up);
      }
    };
  }, []);

  // Touch / on-screen controls (also work on web with mouse)
  const hold = useRef({ left:false, right:false, up:false, down:false, shoot:false });
  const setHold = (k:keyof typeof hold.current, v:boolean) => { hold.current[k] = v; };

  // Send inputs at ~30 Hz (merge keys + holds)
  useEffect(() => {
    const id = setInterval(() => {
      const xKey = (keys.current["KeyD"]?1:0) - (keys.current["KeyA"]?1:0);
      const yKey = (keys.current["KeyS"]?1:0) - (keys.current["KeyW"]?1:0);
      const xPad = (hold.current.right?1:0) - (hold.current.left?1:0);
      const yPad = (hold.current.down?1:0) - (hold.current.up?1:0);
      const x = Math.max(-1, Math.min(1, xKey + xPad));
      const y = Math.max(-1, Math.min(1, yKey + yPad));
      const shoot = !!keys.current["Space"] || hold.current.shoot;
      socketRef.current?.emit("input", { x, y, shoot });
    }, 33);
    return () => clearInterval(id);
  }, []);

  // Layout: top HUD, center game (80% width), side pads
  // We’ll compute a canvas size that fits nicely in landscape.
  const world = state.world;
  const gameW = Math.min(world.width, 0.8 * (world.width)); // keep logical size; SVG scales anyway
  const gameH = world.height;

  const hudTime = Math.ceil((state.timeLeftMs||0)/1000);

  const ControlButton = ({ label, onPressIn, onPressOut }:{
    label:string; onPressIn:()=>void; onPressOut:()=>void;
  }) => (
    <Pressable
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={{
        borderWidth:2, borderColor:"#444", paddingVertical:18, paddingHorizontal:24,
        margin:8, borderRadius:12, backgroundColor:"#111"
      }}>
      <Text style={{ color:"#ddd", fontWeight:"700", fontSize:18 }}>{label}</Text>
    </Pressable>
  );

  // Presets
  const presets = [
    { name: "Green/Black", fg:"#00FF00", bg:"#000000" },
    { name: "Amber/Black", fg:"#FFB000", bg:"#1a0f00" },
    { name: "White/Black", fg:"#FFFFFF", bg:"#000000" },
    { name: "Black/White", fg:"#000000", bg:"#FFFFFF" }
  ];

  return (
    <View style={{ flex:1, backgroundColor: "#202020", paddingHorizontal: 12, paddingVertical: 8 }}>
      {/* HUD / Scoreboard */}
      <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
        <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
          <Text style={{ color:'#fff', fontSize:22, fontWeight:'800' }}>LAN Space Invaders</Text>
          <Text style={{ color: connected ? '#9f9' : '#f99', marginLeft:8 }}>
            {connected ? 'Connected' : 'Connecting…'}
          </Text>
        </View>
        <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
          <TextInput
            placeholder="Your name"
            value={name}
            onChangeText={setName}
            style={{ backgroundColor:'#fff', borderWidth:1, paddingHorizontal:8, paddingVertical:6, minWidth:140 }}
          />
          {!state.running && (
            <>
              <Button title="Join" onPress={join} />
              <Button title="Start" onPress={start} />
            </>
          )}
          {state.running && (
            <Button title="Leave" onPress={leave} />
          )}
          <Button title="Settings" onPress={() => setShowSettings(!showSettings)} />
        </View>
      </View>

      {/* Scores row */}
      <View style={{ flexDirection:'row', flexWrap:'wrap', gap:12, marginBottom:6 }}>
        {state.players.map((p:Player) => (
          <Text key={p.id} style={{ color:'#ddd' }}>
            {p.name}: Lvl {p.levelScore} | Total {p.totalScore} | HP {p.hp}
          </Text>
        ))}
        <Text style={{ color:'#ccc', marginLeft:'auto' }}>
          Level {state.level} • Time {hudTime}s • Players {state.players.length}
        </Text>
      </View>

      {/* Main row: left pad / game / right pad */}
      <View style={{ flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:12 }}>
        {/* Left controls: LEFT + UP */}
        <View style={{ width:'10%', alignItems:'center' }}>
          <ControlButton label="◄"
            onPressIn={()=>setHold('left',true)} onPressOut={()=>setHold('left',false)} />
          <ControlButton label="▲"
            onPressIn={()=>setHold('up',true)} onPressOut={()=>setHold('up',false)} />
        </View>

        {/* Game canvas (80%) */}
        <View style={{ width:'80%', borderWidth:1, borderColor:'#444', aspectRatio: world.width / world.height }}>
          <Svg width="100%" height="100%" viewBox={`0 0 ${world.width} ${world.height}`}>
            {/* Background */}
            <Rect x={0} y={0} width={world.width} height={world.height} fill={bg} />

            {/* Asteroids */}
            {(state.asteroids as Ast[]).map((a:Ast) => (
              a.verts && a.verts.length > 2
                ? <Path key={a.id} d={vertsToPath(a.verts, a.x, a.y)} stroke={fg} strokeWidth={1} fill="none" />
                : <Circle key={a.id} cx={a.x} cy={a.y} r={a.r} stroke={fg} strokeWidth={1} fill="none" />
            ))}

            {/* Bullets */}
            {state.bullets.map((b:any) => (
              <Line key={b.id} x1={b.x} y1={b.y} x2={b.x} y2={b.y-10} stroke={fg} strokeWidth={2} />
            ))}

            {/* Players */}
            {(state.players as Player[]).map((p) => (
              <Spaceship
                key={p.id}
                x={p.x} y={p.y}
                fg={fg}
                inner={avatarShapeFor(p.id) as any}
              />
            ))}

            {/* HUD line */}
            <Line x1={0} y1={40} x2={world.width} y2={40} stroke={fg} strokeWidth={1} />
          </Svg>
        </View>

        {/* Right controls: RIGHT + SHOOT + DOWN */}
        <View style={{ width:'10%', alignItems:'center' }}>
          <ControlButton label="►"
            onPressIn={()=>setHold('right',true)} onPressOut={()=>setHold('right',false)} />
          <ControlButton label="● FIRE"
            onPressIn={()=>setHold('shoot',true)} onPressOut={()=>setHold('shoot',false)} />
          <ControlButton label="▼"
            onPressIn={()=>setHold('down',true)} onPressOut={()=>setHold('down',false)} />
        </View>
      </View>

      {/* Settings drawer */}
      {showSettings && (
        <View style={{
          position:'absolute', top:56, right:12, backgroundColor:'#111',
          borderColor:'#444', borderWidth:1, padding:12, borderRadius:12, zIndex:10, width:360
        }}>
          <Text style={{ color:'#fff', fontWeight:'700', marginBottom:8 }}>Color Schemes</Text>
          {/* Presets */}
          {presets.map(p => (
            <Pressable key={p.name} onPress={()=>{ setFg(p.fg); setBg(p.bg); }}>
              <View style={{ flexDirection:'row', alignItems:'center', gap:8, paddingVertical:6 }}>
                <View style={{ width:20, height:20, backgroundColor:p.bg, borderColor:'#555', borderWidth:1 }} />
                <View style={{ width:20, height:20, backgroundColor:p.fg, borderColor:'#555', borderWidth:1 }} />
                <Text style={{ color:'#ddd' }}>{p.name}</Text>
              </View>
            </Pressable>
          ))}
          <Text style={{ color:'#aaa', marginTop:8 }}>Custom (16 colors)</Text>
          <Text style={{ color:'#888', marginTop:6 }}>Background</Text>
          <View style={{ flexDirection:'row', flexWrap:'wrap' }}>
            {PALETTE16.map(c => (
              <Pressable key={'bg'+c} onPress={()=>setBg(c)}>
                <View style={{
                  width:24,height:24,margin:4, backgroundColor:c,
                  borderWidth: (bg===c?3:1), borderColor:(bg===c?'#fff':'#555')
                }} />
              </Pressable>
            ))}
          </View>
          <Text style={{ color:'#888', marginTop:6 }}>Foreground</Text>
          <View style={{ flexDirection:'row', flexWrap:'wrap' }}>
            {PALETTE16.map(c => (
              <Pressable key={'fg'+c} onPress={()=>setFg(c)}>
                <View style={{
                  width:24,height:24,margin:4, backgroundColor:c,
                  borderWidth: (fg===c?3:1), borderColor:(fg===c?'#fff':'#555')
                }} />
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}
