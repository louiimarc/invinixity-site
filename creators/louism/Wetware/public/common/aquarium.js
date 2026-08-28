export const AQUARIUM_DEVICE_COUNT = 3;
export const AQUARIUM_EDGE_MARGIN = .125;

export function aquariumDeviceIndex(rawDevice) {
  const number = Number(String(rawDevice || "").match(/\d+/)?.[0] || 1);
  return Math.max(0, Math.min(AQUARIUM_DEVICE_COUNT - 1, number - 1));
}

export function aquariumDeviceFromUrl(search = "", pathname = "") {
  const queryDevice = new URLSearchParams(search).get("device");
  if (/^ipad-[123]$/.test(queryDevice || "")) return queryDevice;
  const pathNumber = String(pathname).match(/^\/ipad\/([123])(?:\/|$)/)?.[1];
  return `ipad-${pathNumber || "1"}`;
}

export function aquariumWorldInterval(deviceIndex) {
  const index = Math.max(0, Math.min(AQUARIUM_DEVICE_COUNT - 1, Math.trunc(Number(deviceIndex) || 0)));
  return [index / AQUARIUM_DEVICE_COUNT, (index + 1) / AQUARIUM_DEVICE_COUNT];
}

export function aquariumWorldToLocal(worldX, deviceIndex, width) {
  const normalized = wrapUnit(worldX);
  const [start, end] = aquariumWorldInterval(deviceIndex);
  if (normalized < start || normalized >= end) return null;
  return (normalized - start) * AQUARIUM_DEVICE_COUNT * Math.max(0, Number(width) || 0);
}

export function shortestWrappedDelta(next, previous) {
  let delta = Number(next) - Number(previous);
  if (!Number.isFinite(delta)) return 0;
  if (delta > .5) delta -= 1;
  if (delta < -.5) delta += 1;
  return delta;
}

export function approachWrapped(current, target, amount) {
  const blend = Math.max(0, Math.min(1, Number(amount) || 0));
  return wrapUnit(Number(current) + shortestWrappedDelta(target, current) * blend);
}

export function advanceSwarmCenter(center, axes, seconds) {
  const delta = Math.max(0, Math.min(.05, Number(seconds) || 0));
  return {
    x:wrapUnit(Number(center?.x) + Number(axes?.x || 0) * delta * .19),
    y:Math.min(1-AQUARIUM_EDGE_MARGIN, Math.max(AQUARIUM_EDGE_MARGIN, Number(center?.y) + Number(axes?.y || 0) * delta * .42)),
    z:Math.min(1-AQUARIUM_EDGE_MARGIN, Math.max(AQUARIUM_EDGE_MARGIN, Number(center?.z ?? .5) + Number(axes?.z || 0) * delta * .42))
  };
}

export function advanceFishWithLeftStick(center,leftX,leftY,seconds) {
  // The hologram optics mirror the aquarium horizontally, so logical X must run opposite the pad.
  return advanceSwarmCenter(center,{ x:-Number(leftX || 0),y:leftY,z:0 },seconds);
}

export function stageFishIndicatorX(worldX) {
  const normalized=Math.min(1,Math.max(0,Number(worldX) || 0));
  return 1-normalized;
}

function wrapUnit(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return ((number % 1) + 1) % 1;
}
