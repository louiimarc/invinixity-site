import { connectShowClient } from "/common/client.js";
import { cues } from "/show/cues.js";
import { nuggetScriptQueue } from "/show/slideshow.js";
import { installPwa } from "/common/pwa.js";

installPwa({ mode:"nugget", device:"nugget-launchpad" });

const launchpad = document.getElementById("launchpad");
const status = document.getElementById("status");
const cueStatus = document.getElementById("cueStatus");
const fullscreenGate = document.getElementById("fullscreenGate");
let currentState = null;

fullscreenGate.addEventListener("click",async () => {
  try { await document.documentElement.requestFullscreen?.(); } catch {}
  renderFullscreenGate();
});
document.addEventListener("fullscreenchange",renderFullscreenGate);
renderFullscreenGate();

const buttons = nuggetScriptQueue.map((label,index) => {
  const button = document.createElement("button");
  button.className = "pad";
  button.type = "button";
  button.disabled = true;
  const copy = document.createElement("b");
  copy.textContent = label;
  const number = document.createElement("small");
  number.textContent = String(index + 1).padStart(2,"0");
  button.append(copy,number);
  button.addEventListener("click",() => {
    if (!isLive()) return;
    navigator.vibrate?.(14);
    client.sendAction({ type:"SET_NUGGET_INDEX",index });
  });
  return button;
});
launchpad.replaceChildren(...buttons);

const client = connectShowClient({
  role:"nugget",
  deviceId:"nugget-launchpad",
  onState(state) {
    currentState = state;
    render();
  },
  onConnection(connection) {
    status.className = `status ${connection}`;
    status.querySelector("span").textContent = connection.toUpperCase();
  }
});

function isLive() {
  return cues[currentState?.cueIndex]?.projector === "slideshow";
}

function render() {
  const live = isLive();
  const selected = Math.max(0,Math.min(buttons.length-1,Math.trunc(Number(currentState?.nuggetIndex)||0)));
  cueStatus.classList.toggle("live",live);
  cueStatus.textContent = live ? `LIVE · ${selected+1}/${buttons.length}` : "STANDBY · WAITING FOR F2.4";
  buttons.forEach((button,index) => {
    button.disabled = !live;
    button.classList.toggle("launched",live && index === selected);
    button.setAttribute("aria-pressed",String(live && index === selected));
  });
}

function renderFullscreenGate() {
  const installed = Boolean(navigator.standalone || matchMedia("(display-mode: fullscreen)").matches || matchMedia("(display-mode: standalone)").matches);
  fullscreenGate.hidden = installed || Boolean(document.fullscreenElement) || typeof document.documentElement.requestFullscreen !== "function";
}
