const roomEffectNames = {
    lowpass:'Low-pass', highpass:'High-pass', bandpass:'Band-pass',
    drive:'Drive', echo:'Echo', tremolo:'Tremolo'
};

const roomFXShapes = {slice:'Slice', sphere:'Sphere', triangle:'Irregular triangle'};
const finiteVector = (v, length) => Array.isArray(v) && v.length === length && v.every(Number.isFinite);

function validRoomFX(fx) {
    if (!fx || !Object.hasOwn(roomEffectNames, fx.type) || !finiteVector(fx.normal, 3) ||
        Math.abs(Math.hypot(...fx.normal) - 1) >= 0.01 ||
        !Number.isFinite(fx.offset) || Math.abs(fx.offset) > 0.8 ||
        !Number.isFinite(fx.thickness) || fx.thickness < 0.12 || fx.thickness > 2.5) return false;
    const shape = fx.shape || 'slice';
    if (!Object.hasOwn(roomFXShapes, shape)) return false;
    if (shape === 'slice') return true;
    if (!finiteVector(fx.center,3) || fx.center.some(v => Math.abs(v) > 0.3) ||
        !Number.isFinite(fx.radius) || fx.radius < 0.3 || fx.radius > 3) return false;
    if (shape === 'sphere') return true;
    if (!Array.isArray(fx.triangle) || fx.triangle.length !== 3 ||
        !fx.triangle.every(v => finiteVector(v,2) && v.every(x => Math.abs(x) <= 1))) return false;
    return Math.abs(triangleArea(fx.triangle)) > 0.1;
}

function triangleArea([a,b,c]) {
    return (b[1]-c[1])*(a[0]-c[0]) + (c[0]-b[0])*(a[1]-c[1]);
}

let masterFocused = false;
const masterChamber = {
    bounds:{x:190,y:190,z:190}, sphere:null,
    effects:{slice:null,sphere:null,triangle:null}, selectedShape:'slice'
};

function randomVolume(type, shape, previous) {
    const z = Math.random()*2-1, angle = Math.random()*Math.PI*2, r = Math.sqrt(1-z*z);
    const fx = {type,shape,normal:[r*Math.cos(angle),r*Math.sin(angle),z],
        offset:(Math.random()*2-1)*0.45, thickness:0.8+Math.random(),
        revision:(previous?.revision || 0)+1};
    if(shape !== 'slice') {
        fx.center = Array.from({length:3},()=> (Math.random()*2-1)*0.3);
        fx.radius = shape === 'sphere' ? 1.05+Math.random()*0.9 : 1.5+Math.random();
        if(shape === 'triangle') {
            const t=[[-0.7-Math.random()*0.15,-0.45],[0.8+Math.random()*0.15,-0.3],[-0.1,0.8+Math.random()*0.1]];
            const c=[0,1].map(i=>t.reduce((sum,v)=>sum+v[i],0)/3);
            fx.triangle=t.map(v=>v.map((x,i)=>x-c[i]));
        }
    }
    return fx;
}

function chooseMasterFX(type) {
    if(!masterFocused || !Object.hasOwn(roomEffectNames,type)) return;
    const shape=masterChamber.selectedShape, previous=masterChamber.effects[shape];
    if(previous && previous.type!==type) return;
    if(Object.entries(masterChamber.effects).some(([s,fx])=>s!==shape && fx?.type===type)) return;
    masterChamber.effects={...masterChamber.effects,[shape]:randomVolume(type,shape,previous)};
    roomFX.syncPanel(); queueSetupSave();
}

function changeMasterShape(shape) {
    if(!masterFocused || !Object.hasOwn(roomFXShapes,shape)) return;
    masterChamber.selectedShape=shape;
    roomFX.syncPanel(); queueSetupSave();
}

function clearMasterFX() {
    if(!masterFocused) return;
    masterChamber.effects={...masterChamber.effects,[masterChamber.selectedShape]:null};
    spatialOutput.master.flush();
    roomFX.syncPanel(); queueSetupSave();
}

function randomPercussionSlice() {
    const slice=randomVolume('lowpass','slice');
    slice.thickness=0.12; slice.offset=(Math.random()*2-1)*0.4;
    return slice;
}

function reshufflePercussion(index) {
    if(index!==soloIndex || index<0 || index>=numberOfShownEntity) return;
    entity[index].slice=randomPercussionSlice();
    entity[index].sliceHitAt=-1;
    queueSetupSave();
}

function focusMaster() {
    applySolo(-1); masterFocused=true;
    roomFX.syncPanel(); queueSetupSave();
}

// An orthonormal frame keeps the sphere round and the triangular prism's
// rotated geometry identical in the renderer and the audio hit test.
function roomFXFrame(fx, bounds) {
    const n = fx.normal;
    const seed = Math.abs(n[1]) < 0.9 ? [0,1,0] : [1,0,0];
    const u = [seed[1]*n[2]-seed[2]*n[1],seed[2]*n[0]-seed[0]*n[2],seed[0]*n[1]-seed[1]*n[0]];
    const length = Math.hypot(...u); u.forEach((x,i) => u[i]=x/length);
    const v = [n[1]*u[2]-n[2]*u[1],n[2]*u[0]-n[0]*u[2],n[0]*u[1]-n[1]*u[0]];
    return {n,u,v,unit:Math.min(bounds.x,bounds.y,bounds.z)/2,
        center:fx.center.map((x,i) => x*bounds[['x','y','z'][i]]/2)};
}

// Coordinates are normalized to the room, so MIDI resizing and room merging
// keep the audible zone aligned with the rendered slab.
function roomFXDepth(fx, point, bounds) {
    if (!validRoomFX(fx)) return 0;
    let depth;
    const shape = fx.shape || 'slice';
    if (shape === 'slice') {
        const signed = fx.normal.reduce((sum, n, i) => sum + n * point[i] / (bounds[['x','y','z'][i]] / 2), 0) - fx.offset;
        depth = Math.max(0, 1 - Math.abs(signed) / (fx.thickness / 2));
    } else {
        const frame = roomFXFrame(fx,bounds);
        const local = point.map((x,i) => (x-frame.center[i])/frame.unit);
        if (shape === 'sphere') depth = Math.max(0,1-Math.hypot(...local)/fx.radius);
        else {
            const dot = axis => local.reduce((sum,x,i) => sum+x*axis[i],0);
            const x = dot(frame.u)/fx.radius, y = dot(frame.v)/fx.radius;
            const [a,b,c] = fx.triangle, area = triangleArea(fx.triangle);
            const first = ((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/area;
            const second = ((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/area;
            depth = Math.max(0, Math.min(1, 3*Math.min(first,second,1-first-second),
                1-Math.abs(dot(frame.n))/(fx.thickness/2)));
        }
    }
    return depth * depth * (3 - 2 * depth);
}

// Clip complete convex solids, adding caps at the room walls. Even an
// oversized volume enclosing the entire room remains a visible closed solid.
function clipSolid(faces, normal, offset) {
    const intersections=[];
    const clipped=[];
    const distance=p=>p.reduce((sum,v,i)=>sum+v*normal[i],0)-offset;
    for(const face of faces) {
        const output=[];
        for(let i=0;i<face.length;i++) {
            const a=face[i], b=face[(i+1)%face.length], da=distance(a), db=distance(b);
            if(da<=1e-7) output.push(a);
            if((da<0 && db>0)||(da>0 && db<0)) {
                const t=da/(da-db), hit=a.map((v,j)=>v+(b[j]-v)*t);
                output.push(hit); intersections.push(hit);
            }
        }
        if(output.length>=3) clipped.push(output);
    }
    const cap=[];
    for(const point of intersections) if(!cap.some(p=>p.every((v,i)=>Math.abs(v-point[i])<1e-6))) cap.push(point);
    if(cap.length>=3) {
        const center=[0,1,2].map(i=>cap.reduce((sum,p)=>sum+p[i],0)/cap.length);
        const u=cap[0].map((v,i)=>v-center[i]);
        const v=[normal[1]*u[2]-normal[2]*u[1],normal[2]*u[0]-normal[0]*u[2],normal[0]*u[1]-normal[1]*u[0]];
        const angle=p=>Math.atan2(p.reduce((s,x,i)=>s+(x-center[i])*v[i],0),p.reduce((s,x,i)=>s+(x-center[i])*u[i],0));
        clipped.push(cap.sort((a,b)=>angle(a)-angle(b)));
    }
    return clipped;
}

function volumeFaces(fx,bounds) {
    let faces=[];
    const cube=()=>[-1,1].flatMap(side=>[0,1,2].map(axis=>{
        const others=[0,1,2].filter(i=>i!==axis);
        return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>{
            const p=[0,0,0];p[axis]=side;p[others[0]]=a;p[others[1]]=b;return p;
        });
    }));
    if((fx.shape || 'slice')==='slice') {
        faces=clipSolid(cube(),fx.normal,fx.offset+fx.thickness/2);
        return clipSolid(faces,fx.normal.map(n=>-n),-fx.offset+fx.thickness/2);
    }
    const frame=roomFXFrame(fx,bounds);
    const normalized=p=>p.map((x,i)=>x/(bounds[['x','y','z'][i]]/2));
    if(fx.shape==='sphere') {
        const point=(lat,lon)=>normalized(frame.center.map((c,i)=>c+frame.unit*fx.radius*
            [Math.sin(lat)*Math.cos(lon),Math.cos(lat),Math.sin(lat)*Math.sin(lon)][i]));
        const rows=20,columns=32;
        for(let y=0;y<rows;y++) for(let x=0;x<columns;x++) faces.push([
            point(y*Math.PI/rows,x*2*Math.PI/columns),point((y+1)*Math.PI/rows,x*2*Math.PI/columns),
            point((y+1)*Math.PI/rows,(x+1)*2*Math.PI/columns),point(y*Math.PI/rows,(x+1)*2*Math.PI/columns)]);
    } else {
        const ends=[-1,1].map(side=>fx.triangle.map(([x,y])=>normalized(frame.center.map((c,i)=>c+frame.unit*
            (frame.u[i]*x*fx.radius+frame.v[i]*y*fx.radius+frame.n[i]*side*fx.thickness/2)))));
        faces=[ends[0],ends[1]];
        for(let i=0;i<3;i++) faces.push([ends[0][i],ends[0][(i+1)%3],ends[1][(i+1)%3],ends[1][i]]);
    }
    for(let axis=0;axis<3;axis++) for(const side of [-1,1]) {
        const normal=[0,0,0];normal[axis]=side;faces=clipSolid(faces,normal,1);
    }
    return faces;
}

const roomFX = {
    geometrySerial:0, panel:null, signature:'', geometries:new Map(), viewMaster:null,
    setup() {
        const panel=document.createElement('section');panel.className='room-fx';panel.hidden=true;
        panel.setAttribute('aria-label','Chamber controls');
        panel.innerHTML='<div class="fx-heading"><span id="fx-room"></span><button type="button" data-action="back">All rooms ↗</button></div>'+
            '<div class="fx-bank fx-bank-left"></div><div class="fx-bank fx-bank-right"></div>'+
            '<div class="fx-footer"><div class="fx-shapes" role="group" aria-label="Master FX slots"></div><p id="fx-hint" role="status"></p>'+
            '<button type="button" data-action="clear">Clear shape FX</button><button type="button" data-action="slice">Randomize percussion slice</button></div>';
        Object.entries(roomEffectNames).forEach(([type,label],i)=>{
            const button=document.createElement('button');button.type='button';button.dataset.effect=type;button.textContent=label;
            panel.querySelector(i<3?'.fx-bank-left':'.fx-bank-right').append(button);
        });
        for(const [shape,label] of Object.entries(roomFXShapes)) {
            const button=document.createElement('button');button.type='button';button.dataset.shape=shape;button.textContent=label;
            panel.querySelector('.fx-shapes').append(button);
        }
        const request=(type,data={})=>{
            if(isPresentation) lan.send({type,...data});
            else handleChamberControl({type,...data});
        };
        panel.addEventListener('click',event=>{
            const button=event.target.closest('button');if(!button||button.disabled)return;
            if(button.dataset.action==='back') request('unsolo');
            else if(button.dataset.action==='slice') request('percussion-slice',{index:soloIndex});
            else if(button.dataset.action==='clear') request('master-clear');
            else if(button.dataset.shape) request('master-shape',{shape:button.dataset.shape});
            else if(button.dataset.effect) request('master-effect',{effect:button.dataset.effect});
        });
        const stage=document.getElementById('stage');stage.append(panel);this.panel=panel;
        const open=document.createElement('button');open.id='master-fx-open';open.type='button';open.textContent='Master FX';
        open.onclick=()=>request('master-focus');stage.append(open);this.open=open;
    },
    syncPanel() {
        if(!this.panel)return;
        const view=isPresentation?this.viewMaster:null;
        const focused=isPresentation?!!view?.focused:masterFocused;
        const shape=(view||masterChamber).selectedShape || 'slice';
        const effects=(view||masterChamber).effects;
        const signature=JSON.stringify([soloIndex,focused,shape,effects]);
        if(signature===this.signature)return;this.signature=signature;
        this.open.hidden=focused;
        this.panel.hidden=soloIndex<0&&!focused;
        if(this.panel.hidden)return;
        this.panel.querySelector('#fx-room').textContent=focused?'Master FX · '+Object.values(effects).filter(Boolean).length+'/3':'Room '+String(soloIndex+1).padStart(2,'0');
        this.panel.querySelectorAll('.fx-bank,.fx-shapes').forEach(el=>el.hidden=!focused);
        this.panel.querySelector('[data-action="slice"]').hidden=focused;
        const selected=effects[shape];
        this.panel.querySelector('[data-action="clear"]').hidden=!focused||!selected;
        for(const button of this.panel.querySelectorAll('[data-effect]')) {
            const used=Object.entries(effects).some(([s,fx])=>s!==shape&&fx?.type===button.dataset.effect);
            button.disabled=used||!!selected&&selected.type!==button.dataset.effect;
            button.setAttribute('aria-pressed',String(selected?.type===button.dataset.effect));
        }
        for(const button of this.panel.querySelectorAll('[data-shape]')) {
            button.setAttribute('aria-pressed',String(button.dataset.shape===shape));
            const fx=effects[button.dataset.shape];
            button.textContent=roomFXShapes[button.dataset.shape]+(fx?' · '+roomEffectNames[fx.type]:'');
        }
        this.panel.querySelector('#fx-hint').textContent=focused
            ? selected?'Tap '+roomEffectNames[selected.type]+' to reroll this volume':'Choose an FX for '+roomFXShapes[shape]+' · One FX per shape'
            :'Slice crossings trigger percussion · Tap below to reroll';
    },
    drawBarrier(index,fx,bounds,point,hue,opacity,time) {
        if(!validRoomFX(fx))return;
        const key=JSON.stringify([fx,bounds]);
        let cached=this.geometries.get(index);
        if(cached?.key!==key) {
            if(cached) freeGeometry(cached.geometry);
            const faces=volumeFaces(fx,bounds);
            const geometry=new p5.Geometry();
            geometry.gid='fx-volume-'+index+'-'+(++this.geometrySerial);
            const world=p=>p.map((v,i)=>v*bounds[['x','y','z'][i]]/2);
            for(const face of faces) {
                const points=face.map(world), start=geometry.vertices.length;
                let normal=[0,0,1];
                for(let j=1;j<points.length-1;j++) {
                    const u=points[j].map((v,i)=>v-points[0][i]),v=points[j+1].map((v,i)=>v-points[0][i]);
                    const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
                    if(Math.hypot(...cross)>1e-7){normal=cross;break;}
                }
                const cap=[0,1,2].some(axis=>face.every(p=>Math.abs(Math.abs(p[axis])-1)<1e-6&&Math.abs(p[axis]-face[0][axis])<1e-6));
                for(const point of points) {
                    geometry.vertices.push(createVector(...point));
                    const n=fx.shape==='sphere'&&!cap?point.map((v,i)=>v-roomFXFrame(fx,bounds).center[i]):normal;
                    geometry.vertexNormals.push(createVector(...n).normalize());
                }
                for(let j=0;j<face.length;j++)geometry.edges.push([start+j,start+(j+1)%face.length]);
                for(let j=1;j<face.length-1;j++)geometry.faces.push([start,start+j,start+j+1]);
            }
            cached={key,geometry,start:time};this.geometries.set(index,cached);
        }
        const entrance=matchMedia('(prefers-reduced-motion: reduce)').matches?1:Math.min(1,(time-cached.start)/260);
        const depth=roomFXDepth(fx,point,bounds),alpha=opacity*entrance;
        push();colorMode(HSB,360,100,100,1);
        if(fx.shape==='sphere') {
            noStroke();
            if(!this.sphereShader)this.sphereShader=createShader(
                'attribute vec3 aPosition; attribute vec3 aNormal; uniform mat4 uModelViewMatrix; uniform mat4 uProjectionMatrix; uniform mat3 uNormalMatrix; varying vec3 vNormal; void main(){vNormal=uNormalMatrix*aNormal; gl_Position=uProjectionMatrix*uModelViewMatrix*vec4(aPosition,1.0);}',
                'precision mediump float; varying vec3 vNormal; uniform vec3 uZoneTint; uniform float uZoneOpacity; void main(){float light=0.65+0.35*abs(dot(normalize(vNormal),normalize(vec3(-0.4,-0.5,1.0)))); gl_FragColor=vec4(uZoneTint*light*uZoneOpacity,uZoneOpacity);}');
            const tint=color(hue,30,85).levels.slice(0,3).map(v=>v/255);
            fill(hue,30,85,alpha*(0.12+depth*0.1));
            shader(this.sphereShader);this.sphereShader.setUniform('uZoneTint',tint);
            this.sphereShader.setUniform('uZoneOpacity',alpha*(0.12+depth*0.1));
        } else {stroke(hue,35,90,alpha*0.55);strokeWeight(1);fill(hue,35,85,alpha*(0.07+depth*0.1));}
        // Transparent zones must not hide the ball or the room's own edges.
        const renderer=window._renderer,gl=renderer.GL;
        renderer._applyColorBlend(renderer.curFillColor);
        gl.depthMask(false);
        model(cached.geometry);
        gl.depthMask(true);
        pop();
    }
};

function handleChamberControl(data) {
    if(data.type==='master-focus')focusMaster();
    if(data.type==='master-effect')chooseMasterFX(data.effect);
    if(data.type==='master-shape')changeMasterShape(data.shape);
    if(data.type==='master-clear')clearMasterFX();
    if(data.type==='percussion-slice')reshufflePercussion(data.index);
}
