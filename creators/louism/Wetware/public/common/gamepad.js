export const LEFT_TRIGGER_BUTTON_INDEX = 6;
export const RIGHT_TRIGGER_BUTTON_INDEX = 7;
export const LEFT_BUMPER_BUTTON_INDEX = 4;
export const RIGHT_BUMPER_BUTTON_INDEX = 5;
export const LEFT_TRIGGER_ACTIVATION_PRESSURE = .01;
export const LOADING_PROGRESS_MIN_PER_SECOND = .25;
export const LOADING_PROGRESS_MAX_PER_SECOND = 2;

export function gamepadButtonPressure(button) {
  const value = Number(button?.value ?? (button?.pressed ? 1 : 0));
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function adjustLoadingProgress(progress, signedPressure, seconds, minimum = 0, maximum = 100) {
  const lower = Math.min(100, Math.max(0, Number(minimum) || 0));
  const upper = Math.min(100, Math.max(lower, Number(maximum) || 0));
  const current = Math.min(upper, Math.max(lower, Number(progress) || 0));
  const signedAmount = Math.min(1, Math.max(-1, Number(signedPressure) || 0));
  const amount = Math.abs(signedAmount);
  const delta = Math.min(.1, Math.max(0, Number(seconds) || 0));
  if (amount <= LEFT_TRIGGER_ACTIVATION_PRESSURE) return current;
  const activeAmount = (amount - LEFT_TRIGGER_ACTIVATION_PRESSURE) / (1 - LEFT_TRIGGER_ACTIVATION_PRESSURE);
  const rate = LOADING_PROGRESS_MIN_PER_SECOND
    + activeAmount * (LOADING_PROGRESS_MAX_PER_SECOND - LOADING_PROGRESS_MIN_PER_SECOND);
  return Math.min(upper, Math.max(lower, current + Math.sign(signedAmount) * delta * rate));
}

export function bumperCueStep(previous = {},current = {}) {
  const leftPressed=Boolean(current.left);
  const rightPressed=Boolean(current.right);
  const leftRising=leftPressed&&!previous.left;
  const rightRising=rightPressed&&!previous.right;
  if(leftRising&&!rightPressed) return -1;
  if(rightRising&&!leftPressed) return 1;
  return 0;
}
