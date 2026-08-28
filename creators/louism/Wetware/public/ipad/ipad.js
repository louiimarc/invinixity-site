import { cues } from "/show/cues.js";
import { connectShowClient } from "/common/client.js";
import { approachWrapped, aquariumDeviceFromUrl, aquariumDeviceIndex, aquariumWorldInterval, shortestWrappedDelta } from "/common/aquarium.js";
import { installPwa } from "/common/pwa.js";

const params = new URLSearchParams(location.search);
const rawDevice = aquariumDeviceFromUrl(location.search, location.pathname);
const deviceIndex = aquariumDeviceIndex(rawDevice);
const deviceId = `ipad-${deviceIndex+1}`;
const reflection = ["x", "y", "xy"].includes(params.get("reflect")) ? params.get("reflect") : "none";
if (location.pathname === "/ipad/" || location.pathname === "/ipad/index.html") {
  const reflectionQuery = reflection === "none" ? "" : `?reflect=${reflection}`;
  history.replaceState(null, "", `/ipad/${deviceIndex + 1}/${reflectionQuery}`);
}
installPwa({ mode:"aquarium", device:deviceId, reflect:reflection === "none" ? "" : reflection });
document.title = `Wetware — Aquarium ${deviceIndex + 1}`;
document.getElementById("deviceName").textContent = deviceId.toUpperCase();
let state = { cueIndex:0, blackout:false, frozen:false, pulse:0 };
let clock = 0;
const live = {
  gamepad: { active:false, x:.12, y:.5, z:.5, axisX:0, axisY:0, axisZ:0 },
  identify: { active:false, startedAt:0 },
  intensity:.71,
  fishSpeed:.5,
  fishDepth:.5
};
let frozenLive = null;
let renderedFishPosition = { x:live.gamepad.x, y:live.gamepad.y, z:live.gamepad.z };
let fishFacing = 1;
let fishTilt = 0;
let fishMotion = { x:0, y:0 };
let fishSprite = null;

const client = connectShowClient({
  role:"ipad", deviceId,
  onState(next){
    if (next.frozen && !state.frozen) frozenLive = visualLiveSnapshot();
    if (!next.frozen) frozenLive = null;
    state=next;
    document.body.dataset.frozen = String(Boolean(next.frozen));
    const cue=cues[next.cueIndex]||cues[0];
    document.body.classList.toggle("show-running",next.blackout||cue.ipad!=="idle");
  },
  onInput:applyLiveInput,
  onInputSnapshot(inputs){
    resetLiveInputs();
    for (const input of inputs) applyLiveInput(input);
  },
  onConnection(status){ document.querySelector(".status-dot").className=`status-dot ${status}`; }
});

function applyLiveInput(input){
  if(input.source==="gamepad") {
    live.gamepad={...live.gamepad,...input};
    document.body.dataset.swarmSource = live.gamepad.active ? "gamepad" : "autonomous";
    document.body.dataset.swarmX = live.gamepad.x.toFixed(3);
  }
  if(input.source==="midi"&&input.mapping==="intensity") live.intensity=input.normalized;
  if(input.source==="midi"&&input.mapping==="fish-speed") live.fishSpeed=input.normalized;
  if(input.source==="midi"&&input.mapping==="fish-depth") live.fishDepth=input.normalized;
  if(input.source==="identify") {
    live.identify={ active:Boolean(input.active), startedAt:Number(input.startedAt)||0 };
    document.body.classList.toggle("order-test", live.identify.active);
  }
}

function resetLiveInputs(){
  live.gamepad={ active:false, x:.12, y:.5, z:.5, axisX:0, axisY:0, axisZ:0 };
  live.identify={ active:false, startedAt:0 };
  live.intensity=.71;
  live.fishSpeed=.5;
  live.fishDepth=.5;
  document.body.classList.remove("order-test");
  document.body.dataset.swarmSource="autonomous";
  document.body.dataset.swarmX=live.gamepad.x.toFixed(3);
}

document.body.addEventListener("click",()=>document.documentElement.requestFullscreen?.().catch(()=>{}));

window.preload=()=>{ fishSprite=loadImage("/assets/image/aquarium/ancient-iridescent-fish.png",undefined,()=>{fishSprite=null;}); };
window.setup=()=>{
  const aquarium=document.getElementById("aquarium");
  const c=createCanvas(windowWidth,windowHeight);c.parent(aquarium);pixelDensity(1);noStroke();
};
window.windowResized=()=>resizeCanvas(windowWidth,windowHeight);
window.draw=()=>{
  clock=((state.frozen?state.updatedAt:client.serverNow())/1000)%100000;
  const cue=cues[state.cueIndex]||cues[0];
  if(live.identify.active) {
    const elapsed=client.serverNow()-live.identify.startedAt;
    if(elapsed>=0&&elapsed<20000){drawIpadOrderTest(elapsed);return;}
    live.identify.active=false;document.body.classList.remove("order-test");
  }
  if(state.blackout||cue.ipad==="black"){background(0);return;}
  if(cue.ipad==="aquarium")drawAquarium();else drawIdle();
};

function drawIpadOrderTest(elapsed) {
  const positions=["LEFT","CENTER","RIGHT"];
  const arrows=["LEFT EDGE  →","←  CENTER  →","←  RIGHT EDGE"];
  const palette=[[255,63,120],[45,150,255],[113,255,75]];
  const step=Math.floor(elapsed/1200)%4;
  const highlight=step===deviceIndex||step===3;
  const [red,green,blue]=palette[deviceIndex];
  background(highlight?red*.42:3,highlight?green*.42:5,highlight?blue*.42:9);
  stroke(red,green,blue);strokeWeight(max(8,min(width,height)*.025));noFill();rect(5,5,width-10,height-10);noStroke();
  textFont("monospace");textAlign(CENTER,CENTER);textStyle(BOLD);
  fill(highlight?255:color(red,green,blue,90));textSize(min(width*.42,height*.52));text(`${deviceIndex+1}`,width/2,height*.42);
  fill(red,green,blue);textSize(min(width*.095,54));text(positions[deviceIndex],width/2,height*.71);
  fill(255);textSize(min(width*.04,23));text(arrows[deviceIndex],width/2,height*.84);
  textStyle(NORMAL);fill(210);textSize(min(width*.025,15));text(step===3?"ALL THREE SCREENS · CONFIRM PHYSICAL ORDER":"WATCH THE HIGHLIGHT MOVE 1 → 2 → 3",width/2,height*.93);
}

function drawIdle(){
  background(0);
}

function drawAquarium(){
  const controls = frozenLive || live;
  background(0);
  push();
  applyReflectionTransform();
  blendMode(ADD);
  const targetX=controls.gamepad.active?controls.gamepad.x:(clock*.018)%1;
  const targetY=controls.gamepad.active?controls.gamepad.y:.5;
  const targetZ=controls.gamepad.active?controls.gamepad.z:controls.fishDepth;
  const frameMs=Math.max(1,Math.min(50,Number(deltaTime)||16.667));
  const positionBlend=state.frozen?1:1-Math.exp(-frameMs/92);
  const positionDeltaX=shortestWrappedDelta(targetX,renderedFishPosition.x);
  const positionDeltaY=targetY-renderedFishPosition.y;
  const positionDeltaZ=targetZ-renderedFishPosition.z;
  renderedFishPosition.x=approachWrapped(renderedFishPosition.x,targetX,positionBlend);
  renderedFishPosition.y+=positionDeltaY*positionBlend;
  renderedFishPosition.z+=positionDeltaZ*positionBlend;
  const centerX=renderedFishPosition.x;
  const centerY=renderedFishPosition.y;
  const renderedX = centerX.toFixed(3);
  if (document.body.dataset.renderSwarmX !== renderedX) document.body.dataset.renderSwarmX = renderedX;
  const rawMotionX=controls.gamepad.active?-controls.gamepad.axisX:positionDeltaX;
  const rawMotionY=controls.gamepad.active?controls.gamepad.axisZ:positionDeltaY;
  const motionBlend=1-Math.exp(-frameMs/108);
  fishMotion.x+=(rawMotionX-fishMotion.x)*motionBlend;
  fishMotion.y+=(rawMotionY-fishMotion.y)*motionBlend;
  if(Math.abs(fishMotion.x)>.055)fishFacing=fishMotion.x<0?-1:1;
  const targetTilt=Math.max(-.48,Math.min(.48,Math.atan2(fishMotion.y,Math.max(.08,Math.abs(fishMotion.x)))));
  fishTilt+=(targetTilt-fishTilt)*(1-Math.exp(-frameMs/125));
  const size=min(width,height)*(.18+renderedFishPosition.z*.08);
  const [worldStart]=aquariumWorldInterval(deviceIndex);
  for(const wrap of [-1,0,1]){
    const localX=(centerX+wrap-worldStart)*3*width;
    if(localX<-size||localX>width+size)continue;
    drawSingleFish(localX,centerY*height,size,fishFacing,fishTilt,controls.intensity,clock,controls.fishSpeed);
  }
  blendMode(BLEND);
  pop();
}

function drawSingleFish(x,y,size,facing,tilt,intensity,time,speed){
  push();translate(x,y);rotate(tilt*facing);scale(facing,1);
  if(fishSprite){
    imageMode(CENTER);tint(255,170+intensity*85);
    const spriteWidth=size*2.35;
    const spriteAspect=fishSprite.width/Math.max(1,fishSprite.height);
    image(fishSprite,0,0,spriteWidth,spriteWidth/spriteAspect);
    noTint();pop();return;
  }
  const tailWave=sin(time*(4+speed*8))*.18;
  const glow=150+intensity*95;
  fill(255,20,125,glow*.2);ellipse(0,0,size*1.55,size*.72);
  fill(0,205,255,glow*.18);ellipse(size*.1,0,size*1.45,size*.68);
  fill(255,32,145,glow);ellipse(0,0,size,size*.5);
  fill(20,220,255,glow*.9);ellipse(size*.14,0,size*.72,size*.42);
  push();translate(-size*.46,0);rotate(tailWave);fill(255,42,160,glow);triangle(0,0,-size*.42,-size*.34,-size*.42,size*.34);pop();
  fill(255,255,220,245);ellipse(size*.3,-size*.09,max(3,size*.07));
  fill(0);ellipse(size*.315,-size*.09,max(1.5,size*.03));
  pop();
}

function applyReflectionTransform(){
  if(reflection.includes("x")){translate(width,0);scale(-1,1);}
  if(reflection.includes("y")){translate(0,height);scale(1,-1);}
}

function visualLiveSnapshot(){
  return {
    gamepad:{ ...live.gamepad },
    intensity:live.intensity,
    fishSpeed:live.fishSpeed,
    fishDepth:live.fishDepth
  };
}
