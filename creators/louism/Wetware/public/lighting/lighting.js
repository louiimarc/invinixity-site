import { connectShowClient } from "/common/client.js";
import { installPwa } from "/common/pwa.js";
import { cues } from "/show/cues.js";
import { lightingMonitorState } from "/show/lighting.js";

installPwa({ mode:"lighting", device:"lighting-monitor" });

const wall = document.getElementById("wall");
const floor = document.getElementById("floor");
const aquarium = document.getElementById("aquarium");
const cueLabel = document.getElementById("cue");
const connection = document.getElementById("connection");
let currentState = null;

const client = connectShowClient({
  role:"lighting",
  deviceId:"lighting-monitor",
  onState(state) {
    currentState = state;
    render();
  },
  onConnection(status) {
    connection.className = status;
    connection.textContent = status.toUpperCase();
  }
});

setInterval(render,250);

function render() {
  const cue = cues[currentState?.cueIndex] || cues[0];
  const view = lightingMonitorState(cue,currentState || {},client.serverNow());
  renderOutput(wall,view.wall);
  renderOutput(floor,view.floor);
  cueLabel.textContent = view.detail;
  aquarium.hidden = view.mode !== "aquarium";
  document.body.dataset.mode = view.mode;
}

function renderOutput(element,status) {
  element.classList.toggle("content",status.content);
  element.classList.toggle("no-content",!status.content);
  element.querySelector("b").textContent = status.caption;
}
