export const WETWARE_INSTALLATION_STAGES = [
  { max:2, message:"SCANNING INHERITED ERRORS" },
  { max:7, message:"INJECTING MEMORIES" },
  { max:10, message:"UNPACKING SYNTHETIC GRIEF" },
  { max:17, message:"PATCHING CHILDHOOD" },
  { max:21, message:"MOUNTING SECOND SKIN" },
  { max:29, message:"CALIBRATING INSTINCTS" },
  { max:32, message:"ALIGNING PHANTOM LIMBS" },
  { max:38, message:"SYNCHRONIZING NERVES" },
  { max:43, message:"COMPILING DESIRE" },
  { max:46, message:"INDEXING TOUCH" },
  { max:54, message:"UPDATING INTERNAL WEATHER" },
  { max:59, message:"BACKING UP FIRST KISS" },
  { max:62, message:"ENCRYPTING SOFT SPOTS" },
  { max:69, message:"REPAIRING SOFT TISSUE" },
  { max:73, message:"MERGING FAMILY ARCHIVES" },
  { max:81, message:"REWRITING MUSCLE MEMORY" },
  { max:85, message:"REBOOTING SURVIVAL MODE" },
  { max:91, message:"INSTALLING BORROWED DREAMS" },
  { max:96, message:"FINALIZING HUMAN PATCH" },
  { max:100, message:"AUTHENTICATING HEARTBEAT" }
];

export const WETWARE_INSTALLATION_MESSAGES = WETWARE_INSTALLATION_STAGES.map(({ message }) => message);

export function wetwareInstallationMessage(progress) {
  const value = Math.min(100, Math.max(0, Number(progress) || 0));
  return WETWARE_INSTALLATION_STAGES.find(({ max }) => value <= max)?.message
    || WETWARE_INSTALLATION_STAGES.at(-1).message;
}
