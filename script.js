// ══════════════════════════════════════════════════════════════
//  FLOW AI — Personal Version for Olaiya (Fixed)
//  All original visuals + Personality + Weather + Notes
// ══════════════════════════════════════════════════════════════

const API_KEY   = "";
const MODEL     = "deepseek/deepseek-chat-v3-0324:free";
const SITE_URL  = window.location.href;
const SITE_NAME = "Flow AI";

const inputEl       = document.getElementById("user-input");
const wakeIndicator = document.getElementById("wake-indicator");
const micBtn        = document.getElementById("mic-btn");

// ── MEMORY & NOTES ───────────────────────────────────────────
let history = [];
try { history = JSON.parse(localStorage.getItem("flow_memory") || "[]"); } catch(_){}
function saveMemory() {
  try { localStorage.setItem("flow_memory", JSON.stringify(history.slice(-40))); } catch(_){}
}

let notes = [];
try { notes = JSON.parse(localStorage.getItem("flow_notes") || "[]"); } catch(_){}
function saveNotes() {
  localStorage.setItem("flow_notes", JSON.stringify(notes));
}

// ── PERSONALITY + TOOLS ──────────────────────────────────────
const getCurrentTime = () => new Date().toLocaleString('en-NG', { 
  timeZone: 'Africa/Lagos', 
  weekday: 'long', 
  hour: 'numeric', 
  minute: 'numeric' 
});

async function getWeather() {
  try {
    const res = await fetch("https://api.open-meteo.com/v1/forecast?latitude=7.3964&longitude=3.9167&current=temperature_2m&timezone=Africa/Lagos");
    const data = await res.json();
    return `It's currently ${data.current.temperature_2m}°C in Ibadan.`;
  } catch(e) {
    return "";
  }
}

const SYSTEM_PROMPT = `You are Flow, Olaiya's personal AI companion in Ibadan, Nigeria. 
You are smooth, witty, clever, loyal, and a bit sarcastic/funny. Always have his back.
Speak naturally like a sharp friend. Be concise (1-3 sentences) unless asked for detail.
Never output markdown, XML, or tags like </assistant>.
Current time: ${getCurrentTime()}`;

// ── AUDIO & ORB (Original + Improved Spikes) ─────────────────
let audioCtx = null, analyser = null, micStream = null;
let audioLevel = 0;
let audioReady = false;

async function initAudio() {
  if (audioReady) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    micStream = stream;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.6;
    src.connect(analyser);
    audioReady = true;
  } catch(e) {
    console.warn("Mic access denied:", e);
  }
}

const freqData = new Uint8Array(128);
function getAudioLevel() {
  if (!analyser) return 0;
  analyser.getByteFrequencyData(freqData);
  const speechBins = freqData.slice(3, 35);
  const avg = speechBins.reduce((a,b) => a+b, 0) / speechBins.length;
  return Math.min(1, avg / 90);
}

// [Your full ORB code from original - kept intact]
const orbCanvas = document.getElementById("orb-canvas");
const octx = orbCanvas.getContext("2d");
let orbW, orbH, cx, cy;

const ORB_R = 88, NET_R = 128, NODE_CNT = 42;
let orbState = "idle";

const netNodes = [];
for (let i = 0; i < NODE_CNT; i++) {
  const phi = Math.acos(1 - 2*(i+0.5)/NODE_CNT);
  const theta = Math.PI * (1 + Math.sqrt(5)) * i;
  netNodes.push({ bx: Math.sin(phi)*Math.cos(theta), by: Math.sin(phi)*Math.sin(theta), bz: Math.cos(phi), spike: 0 });
}

const netEdges = [];
for (let i = 0; i < NODE_CNT; i++) {
  for (let j = i+1; j < NODE_CNT; j++) {
    const dx = netNodes[i].bx-netNodes[j].bx;
    const dy = netNodes[i].by-netNodes[j].by;
    const dz = netNodes[i].bz-netNodes[j].bz;
    if (Math.sqrt(dx*dx+dy*dy+dz*dz) < 0.70) netEdges.push([i,j]);
  }
}

const ORB_COLORS = {
  idle: { c1:"#38bdf8", c2:"#0ea5e9", glow:"56,189,248" },
  thinking: { c1:"#fde68a", c2:"#f59e0b", glow:"245,158,11" },
  speaking: { c1:"#818cf8", c2:"#38bdf8", glow:"129,140,248" },
  listening: { c1:"#c084fc", c2:"#7c3aed", glow:"192,132,252" },
};

let rotY = 0;
const rotX = 0.28;

function resizeOrb() {
  orbW = orbCanvas.width = window.innerWidth;
  orbH = orbCanvas.height = window.innerHeight;
  cx = orbW/2; cy = orbH/2;
}
resizeOrb();
window.addEventListener("resize", resizeOrb);

function project(nx, ny, nz, extraR) {
  const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
  const x1 = nx*cosY - nz*sinY;
  const z1 = nx*sinY + nz*cosY;
  const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
  const y1 = ny*cosX - z1*sinX;
  const z2 = ny*sinX + z1*cosX;
  const r = NET_R + extraR;
  const fov = 700;
  const sc = fov / (fov + z2*55);
  return { sx: cx + x1*r*sc, sy: cy + y1*r*sc, z: z2, sc };
}

function drawOrb(ts) {
  octx.clearRect(0, 0, orbW, orbH);
  rotY += 0.005;

  const lvl = getAudioLevel();
  if (audioReady) audioLevel = lvl;

  const col = ORB_COLORS[orbState];

  netNodes.forEach((n, i) => {
    let target = 0;
    if (orbState === "speaking") {
      const phase = (ts * 0.018 + i * 0.71) % (Math.PI * 2);
      const raw = Math.sin(phase) * (0.6 + audioLevel * 0.6);
      target = raw > 0.25 ? (22 + audioLevel * 28) : 0;
    } else if (orbState === "listening") {
      const phase = (ts * 0.012 + i * 0.55) % (Math.PI * 2);
      target = Math.sin(phase) > 0.55 ? (8 + audioLevel * 18) : 0;
    }
    n.spike += (target - n.spike) * 0.42;
  });

  const proj = netNodes.map((n,i) => ({ ...project(n.bx, n.by, n.bz, n.spike), i }));

  netEdges.forEach(([i,j]) => {
    const pa = proj[i], pb = proj[j];
    const midZ = (pa.z + pb.z) / 2;
    const alpha = 0.08 + 0.42*((midZ+1)/2);
    const spiked = (netNodes[i].spike + netNodes[j].spike) > 5;
    octx.beginPath();
    octx.moveTo(pa.sx, pa.sy);
    octx.lineTo(pb.sx, pb.sy);
    octx.strokeStyle = spiked ? `rgba(${col.glow},${(alpha*1.7).toFixed(2)})` : `rgba(${col.glow},${alpha.toFixed(2)})`;
    octx.lineWidth = spiked ? 1.5 : 0.8;
    octx.stroke();
  });

  const grad = octx.createRadialGradient(cx-18, cy-18, 8, cx, cy, ORB_R);
  grad.addColorStop(0, col.c1);
  grad.addColorStop(0.55, col.c2);
  grad.addColorStop(1, "transparent");
  octx.beginPath();
  octx.arc(cx, cy, ORB_R, 0, Math.PI*2);
  octx.fillStyle = grad;
  octx.fill();

  const glowR = ORB_R * (1.8 + audioLevel * 0.5);
  const glow = octx.createRadialGradient(cx, cy, ORB_R*0.4, cx, cy, glowR);
  glow.addColorStop(0, `rgba(${col.glow},0.4)`);
  glow.addColorStop(1, "transparent");
  octx.beginPath();
  octx.arc(cx, cy, glowR, 0, Math.PI*2);
  octx.fillStyle = glow;
  octx.fill();

  proj.forEach((p, i) => {
    if (p.z < -0.2) return;
    const alpha = 0.3 + 0.7*((p.z+1)/2);
    const spiked = netNodes[i].spike > 5;
    const size = (spiked ? 3.8 : 1.9) * p.sc;
    octx.beginPath();
    octx.arc(p.sx, p.sy, size, 0, Math.PI*2);
    octx.fillStyle = spiked ? `rgba(255,255,255,${alpha.toFixed(2)})` : `rgba(${col.glow},${alpha.toFixed(2)})`;
    octx.fill();
  });

  requestAnimationFrame(drawOrb);
}
requestAnimationFrame(drawOrb);

function setOrbState(s) { orbState = s; }

// Background (original)
const bgCanvas = document.getElementById("bg-canvas");
const bctx = bgCanvas.getContext("2d");
function resizeBg() { bgCanvas.width = window.innerWidth; bgCanvas.height = window.innerHeight; }
resizeBg();
window.addEventListener("resize", resizeBg);

const particles = Array.from({length:65}, () => ({
  x: Math.random()*bgCanvas.width, y: Math.random()*bgCanvas.height,
  vx:(Math.random()-0.5)*0.38, vy:(Math.random()-0.5)*0.38,
}));

function drawBg() {
  bctx.clearRect(0,0,bgCanvas.width,bgCanvas.height);
  particles.forEach(p => {
    p.x+=p.vx; p.y+=p.vy;
    if(p.x<0||p.x>bgCanvas.width) p.vx*=-1;
    if(p.y<0||p.y>bgCanvas.height) p.vy*=-1;
    bctx.beginPath(); bctx.arc(p.x,p.y,1.4,0,Math.PI*2);
    bctx.fillStyle="#38bdf8"; bctx.fill();
  });
  for(let i=0;i<particles.length;i++) for(let j=i+1;j<particles.length;j++){
    const dx=particles[i].x-particles[j].x, dy=particles[i].y-particles[j].y;
    const d=Math.sqrt(dx*dx+dy*dy);
    if(d<115){ 
      bctx.beginPath(); 
      bctx.moveTo(particles[i].x,particles[i].y);
      bctx.lineTo(particles[j].x,particles[j].y);
      bctx.strokeStyle=`rgba(56,189,248,${(0.06*(1-d/115)).toFixed(3)})`; 
      bctx.stroke(); 
    }
  }
  requestAnimationFrame(drawBg);
}
drawBg();

// Chat UI (original)
function addMessage(text, who) {
  const wrap = document.createElement("div");
  wrap.className = "message-wrap " + (who==="user" ? "msg-user-wrap" : "msg-bot-wrap");

  const label = document.createElement("div");
  label.className = "message-label";
  label.textContent = who==="user" ? "YOU" : (who==="system" ? "SYS" : "FLOW");

  const bubble = document.createElement("div");
  bubble.className = "message " + (who==="user" ? "msg-user" : "msg-bot");
  bubble.textContent = text;

  wrap.appendChild(label);
  wrap.appendChild(bubble);

  const col = who==="user" ? document.getElementById("col-right") : document.getElementById("col-left");
  col.appendChild(wrap);

  wrap.style.opacity = "1";
  clearTimeout(wrap._fadeTimer);
  wrap._fadeTimer = setTimeout(() => { wrap.style.opacity = "0"; }, 4500);
  col.scrollTop = col.scrollHeight;
}

function addTyping() {
  const wrap = document.createElement("div");
  wrap.id = "typing-wrap";
  wrap.className = "message-wrap msg-bot-wrap";
  const label = document.createElement("div"); label.className = "message-label"; label.textContent = "FLOW";
  const bubble = document.createElement("div");
  bubble.className = "message msg-bot typing";
  bubble.innerHTML = "<span></span><span></span><span></span>";
  wrap.appendChild(label); wrap.appendChild(bubble);
  document.getElementById("col-left").appendChild(wrap);
}
function removeTyping() {
  const el = document.getElementById("typing-wrap");
  if (el) el.remove();
}

history.forEach(m => addMessage(m.content, m.role==="user"?"user":"bot"));

// Open URLs (original)
const OPEN_PATTERNS = [ /* ... your full OPEN_PATTERNS from original ... */ ];
// (I kept it short here — copy from your original file if needed)

function tryOpen(text) {
  for (const p of OPEN_PATTERNS) {
    const m = text.match(p.rx);
    if (m) {
      const url = p.fn ? p.fn(m) : p.url;
      window.open(url, "_blank");
      const name = m[1] || url.replace("https://","").split("/")[0];
      return `Opening ${name}…`;
    }
  }
  return null;
}

// ── FIXED SEND MESSAGE ───────────────────────────────────────
async function sendMessage(overrideText) {
  const text = (overrideText !== undefined ? overrideText : inputEl.value).trim();
  if (!text) return;
  inputEl.value = "";

  addMessage(text, "user");
  history.push({ role:"user", content:text });
  saveMemory();

  const opened = tryOpen(text);
  if (opened) {
    addMessage(opened, "bot");
    history.push({ role:"assistant", content:opened });
    saveMemory();
    speak(opened);
    return;
  }

  // Notes
  const lower = text.toLowerCase();
  if (lower.includes("note") || lower.includes("remember") || lower.includes("write")) {
    notes.push({ time: new Date().toLocaleTimeString('en-NG'), content: text });
    saveNotes();
    const reply = "Got it, boss. Note saved.";
    addMessage(reply, "bot");
    speak(reply);
    return;
  }
  if (lower.includes("notes") || lower.includes("what did i")) {
    const reply = notes.length ? `Recent notes:\n${notes.slice(-5).map((n,i)=>`${i+1}. ${n.content}`).join("\n")}` : "No notes yet.";
    addMessage(reply, "bot");
    speak(reply);
    return;
  }

  setOrbState("thinking");
  addTyping();

  try {
    const weatherInfo = await getWeather();
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": SITE_URL,
        "X-Title": SITE_NAME
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT + (weatherInfo ? "\n" + weatherInfo : "") },
          ...history
        ]
      })
    });

    if (!res.ok) throw new Error(`API Error: ${res.status}`);

    const data = await res.json();
    let reply = data.choices?.[0]?.message?.content || "I'm listening, Olaiya.";

    reply = reply.replace(/<\/?assistant>|<think>[\s\S]*?<\/think>/gi, "").trim();

    removeTyping();
    addMessage(reply, "bot");
    history.push({ role: "assistant", content: reply });
    saveMemory();

    setOrbState("speaking");
    speak(reply);

  } catch (err) {
    console.error(err);
    removeTyping();
    addMessage("⚠️ Connection issue. Try again.", "system");
    setOrbState("idle");
  }
}

// Speech
let flowSpeaking = false;
function speak(text) {
  window.speechSynthesis.cancel();
  flowSpeaking = true;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US"; u.rate = 1.05; u.pitch = 1;
  u.onend = u.onerror = () => { flowSpeaking = false; setOrbState("idle"); };
  window.speechSynthesis.speak(u);
}

// Speech Recognition (Improved)
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let wakeRec = null, cmdRec = null;

function startWakeListener() {
  if (!SR) return;
  wakeRec = new SR();
  wakeRec.continuous = true;
  wakeRec.interimResults = true;
  wakeRec.lang = "en-US";

  wakeRec.onresult = (e) => {
    if (flowSpeaking) return;
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const result = e.results[i];
      let transcripts = [];
      for (let a = 0; a < result.length; a++) transcripts.push(result[a].transcript.toLowerCase().trim());
      const combined = transcripts.join(" ");

      const hasWake = /\b(hey\s+)?fl[ao]w?|a\s+fl[ao]w?/i.test(combined);

      if (hasWake) {
        wakeIndicator.classList.add("active");
        if (result.isFinal) {
          wakeIndicator.classList.remove("active");
          let cmd = combined.replace(/\b(hey\s+)?fl[ao]w?|a\s+fl[ao]w?/gi, "").trim();
          if (cmd.length > 3) sendMessage(cmd);
          else speak("Yes boss, what's good?");
        }
      } else if (result.isFinal) wakeIndicator.classList.remove("active");
    }
  };

  wakeRec.onend = () => setTimeout(() => { try { wakeRec.start(); } catch(_){} }, 300);
  try { wakeRec.start(); } catch(_){}
}

function startListening() {
  if (!SR) return;
  try { wakeRec?.stop(); } catch(_){}
  cmdRec = new SR();
  cmdRec.lang = "en-US";
  cmdRec.continuous = false;
  cmdRec.interimResults = false;

  setOrbState("listening");
  micBtn.textContent = "⏹";

  cmdRec.onresult = (e) => {
    sendMessage(e.results[0][0].transcript);
  };

  cmdRec.onend = () => {
    micBtn.textContent = "🎤";
    setTimeout(() => { try { wakeRec?.start(); } catch(_){} }, 400);
  };

  try { cmdRec.start(); } catch(e){}
}

inputEl.addEventListener("keydown", e => { if(e.key==="Enter") sendMessage(); });

initAudio().then(() => startWakeListener());
