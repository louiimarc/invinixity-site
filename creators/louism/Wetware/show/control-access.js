export function canSendShowAction(role, action) {
  if (role === "operator") return true;
  return role === "nugget" && action?.type === "SET_NUGGET_INDEX";
}

export function canSendLiveInput(role,input) {
  if(role==="operator") return true;
  return role==="kala" && input?.source==="kala";
}
