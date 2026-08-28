import { connectShowClient } from "/common/client.js";
import { installPwa } from "/common/pwa.js";
import { cues } from "/show/cues.js";
import { normalizeProjectorPointer } from "/show/scene-settings.js";

installPwa({ mode:"kala",device:"kala-controller" });

const pad=document.getElementById("pad");
const marker=document.getElementById("marker");
const horizontal=document.getElementById("horizontal");
const vertical=document.getElementById("vertical");
const connection=document.getElementById("connection");
const cueStatus=document.getElementById("cue");
const fullscreenGate=document.getElementById("fullscreenGate");
let currentState=null;
let position={ x:.5,y:.5 };
let touching=false;
let lastSent=0;

const client=connectShowClient({
  role:"kala",
  deviceId:"kala-controller",
  onState(state){ currentState=state; renderCue(); },
  onConnection(status){
    connection.className=`connection ${status}`;
    connection.querySelector("em").textContent=status.toUpperCase();
    if(status==="online") sendPosition(true);
  }
});

pad.addEventListener("pointerdown",(event)=>{
  if(!isLive()) return;
  touching=true;
  pad.setPointerCapture?.(event.pointerId);
  updatePosition(event,true);
  event.preventDefault();
});
pad.addEventListener("pointermove",(event)=>{
  if(!touching || !isLive()) return;
  updatePosition(event,false);
  event.preventDefault();
});
for(const type of ["pointerup","pointercancel"]) pad.addEventListener(type,(event)=>{
  if(!touching) return;
  touching=false;
  updatePosition(event,true);
  event.preventDefault();
});

fullscreenGate.addEventListener("click",async()=>{
  try { await document.documentElement.requestFullscreen?.(); } catch {}
  renderFullscreenGate();
});
document.addEventListener("fullscreenchange",renderFullscreenGate);
document.addEventListener("visibilitychange",()=>sendPosition(document.visibilityState==="visible"));
setInterval(()=>sendPosition(document.visibilityState==="visible"),750);
renderPosition();
renderFullscreenGate();

function isLive(){ return cues[currentState?.cueIndex]?.id==="fragment-3-face"; }

function updatePosition(event,force){
  position=normalizeProjectorPointer(event.clientX,event.clientY,innerWidth,innerHeight);
  renderPosition();
  sendPosition(force);
}

function sendPosition(force=false){
  const now=performance.now();
  if(!force && now-lastSent<16) return;
  client.sendInput({ source:"kala",active:isLive() && document.visibilityState==="visible",...position });
  lastSent=now;
}

function renderPosition(){
  const x=`${position.x*100}%`,y=`${position.y*100}%`;
  marker.style.left=x; marker.style.top=y;
  vertical.style.left=x; horizontal.style.top=y;
}

function renderCue(){
  const live=isLive();
  cueStatus.classList.toggle("live",live);
  cueStatus.textContent=live ? "LIVE · F3.3 KALA" : "STANDBY · WAITING FOR F3.3";
  sendPosition(true);
}

function renderFullscreenGate(){
  const installed=Boolean(navigator.standalone || matchMedia("(display-mode: fullscreen)").matches || matchMedia("(display-mode: standalone)").matches);
  fullscreenGate.hidden=installed || Boolean(document.fullscreenElement) || typeof document.documentElement.requestFullscreen!=="function";
}
