// The controller owns the mix. Presentation gestures request the same toggle.
let soloIndex = -1;

function applySolo(index) {
    if (index === soloIndex) return;
    soloIndex = index;
    if(index>=0)masterFocused=false;
    roomFX.syncPanel();
    if (index < 0) return;
    entity.forEach((box, i) => {
        if (i !== index) {
            box.sound.silence();
            box.percussion.silence();
            box.lastNote = -Infinity;
        }
    });
}

function toggleSolo(index) {
    if (!Number.isInteger(index) || index < 0 || index >= numberOfShownEntity) return;
    applySolo(soloIndex === index ? -1 : index);
    queueSetupSave();
}

function releaseSolo() {
    masterFocused=false;
    applySolo(-1);
    roomFX.syncPanel();
    queueSetupSave();
}

// Intersect the tap ray with the actual chamber bounds after orbit and zoom.
function pickRoom(x, y, onlyIndex = null) {
    if (!playback.pickMatrix) return -1;
    const inverse = playback.pickMatrix.inverse();
    const unproject = z => {
        const p = inverse.transformPoint({x:2*x/width-1, y:1-2*y/height, z, w:1});
        return [p.x/p.w, p.y/p.w, p.z/p.w];
    };
    const start = unproject(-1), end = unproject(1);
    let closest = Infinity, result = -1;
    for (const room of playback.targets) {
        if(onlyIndex!==null && room.i!==onlyIndex)continue;
        let near = 0, far = 1;
        for (let axis = 0; axis < 3; axis++) {
            const delta = end[axis] - start[axis];
            const offset = room.center[axis] - start[axis], half = room.size[axis] / 2;
            if (Math.abs(delta) < 1e-9) {
                if (Math.abs(offset) > half) far = -1;
                continue;
            }
            const a = (offset - half) / delta, b = (offset + half) / delta;
            near = Math.max(near, Math.min(a,b));
            far = Math.min(far, Math.max(a,b));
        }
        if (near <= far && near < closest) { closest = near; result = room.i; }
    }
    return result;
}

function setupSoloInputs() {
    const masterIsFocused=()=>isPresentation?!!roomFX.viewMaster?.focused:masterFocused;
    const dismiss=()=>{
        if(isPresentation)lan.send({type:'unsolo'});else releaseSolo();
    };
    const request=i=>{
        if(i===-2) {
            if(masterIsFocused())dismiss();
            else if(isPresentation)lan.send({type:'master-focus'});else focusMaster();
        } else if(i>=0) {
            if(isPresentation)lan.send({type:'solo',index:i});else toggleSolo(i);
        }
    };
    window.addEventListener('keydown',e=>{
        if(e.ctrlKey||e.metaKey||e.altKey||e.target.closest?.('input,select,textarea,[contenteditable="true"]'))return;
        if(e.key==='0') {if(!e.repeat)request(-2);return;}
        if(e.key==='Escape') {dismiss();return;}
        if(/^[1-6]$/.test(e.key)&&!e.repeat)request(Number(e.key)-1);
    });
    const stage=document.getElementById('stage');
    const spectrum=document.getElementById('spectrum-plot');
    let tap;
    // Listen beyond the canvas so blank margins and a stationary tap on the
    // percussion strip can dismiss focus. Controls and drag gestures stay independent.
    document.addEventListener('pointerdown',e=>{
        tap=null;
        if(!e.isPrimary||e.button!==0||e.target.closest?.('.room-fx,header,.console,.join,dialog,button,input,select,a'))return;
        const focused=masterIsFocused()?-2:soloIndex>=0?soloIndex:null;
        let index=-1;
        if(stage.contains(e.target)) {
            const rect=stage.getBoundingClientRect();
            index=pickRoom(e.clientX-rect.left,e.clientY-rect.top,focused);
        } else if(focused===null&&spectrum.contains(e.target)) {
            const rect=spectrum.getBoundingClientRect();
            index=spectrumView.pick(e.clientX-rect.left,e.clientY-rect.top);
        }
        tap={id:e.pointerId,x:e.clientX,y:e.clientY,index,focused};
    });
    document.addEventListener('pointermove',e=>{
        if(tap&&Math.hypot(e.clientX-tap.x,e.clientY-tap.y)>8)tap=null;
    });
    document.addEventListener('pointercancel',()=>{tap=null;});
    document.addEventListener('pointerup',e=>{
        const current=tap;tap=null;
        if(!current||current.id!==e.pointerId||Math.hypot(e.clientX-current.x,e.clientY-current.y)>8)return;
        if(current.focused!==null&&current.index!==current.focused)dismiss();
        else request(current.index);
    });
}
