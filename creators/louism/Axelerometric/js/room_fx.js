const roomEffectNames = {
    bitcrush:'Bitcrush', echo:'Echo', stutter:'Stutter'
};

const fixedFX={slice:'echo',sphere:'stutter',tetrahedron:'bitcrush'};
const roomFXShapes = {slice:'Plane', sphere:'Sphere', tetrahedron:'Tetrahedron'};
const roomFXColors={
    slice:{hue:200,rgb:[90,185,235]},
    sphere:{hue:160,rgb:[85,220,175]},
    tetrahedron:{hue:38,rgb:[240,185,85]}
};

function fxBallColor(effects,point,bounds) {
    const white=[230,233,238],mixed=[0,0,0];
    let total=0;
    for(const [shape,fx] of Object.entries(effects)) {
        const depth=roomFXDepth(fx,point,bounds),palette=roomFXColors[shape];
        if(!palette||depth<=0)continue;
        total+=depth;
        palette.rgb.forEach((value,i)=>mixed[i]+=value*depth);
    }
    if(!total)return white;
    const strength=Math.min(1,Math.sqrt(total)*3);
    return mixed.map((value,i)=>white[i]+(value/total-white[i])*strength);
}

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
    return shape==='tetrahedron';
}

// Four equal-radius vertices form a regular tetrahedron centered at the origin.
const tetrahedronVertices=[[1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]]
    .map(point=>point.map(value=>value/Math.sqrt(3)));

function tetrahedronPoints(fx,bounds) {
    const frame=roomFXFrame(fx,bounds);
    return tetrahedronVertices.map(([x,y,z])=>frame.center.map((c,i)=>
        c+frame.unit*fx.radius*(frame.u[i]*x+frame.v[i]*y+frame.n[i]*z)));
}

let masterFocused = false;
const masterChamber = {
    bounds:{x:190,y:190,z:190}, sphere:null,
    effects:Object.fromEntries(Object.entries(fixedFX).map(([shape,type])=>[shape,randomVolume(type,shape)]))
};

function randomVolume(type, shape, previous) {
    const z = Math.random()*2-1, angle = Math.random()*Math.PI*2, r = Math.sqrt(1-z*z);
    const fx = {type,shape,normal:[r*Math.cos(angle),r*Math.sin(angle),z],
        offset:(Math.random()*2-1)*0.45, thickness:0.8+Math.random(),
        revision:(previous?.revision || 0)+1};
    if(shape !== 'slice') {
        fx.center = Array.from({length:3},()=> (Math.random()*2-1)*0.3);
        const contained=Math.random()<0.65;
        fx.radius = shape === 'sphere' ? (contained?0.4+Math.random()*0.3:0.9+Math.random()*0.95)
            : (contained?0.55+Math.random()*0.3:1.05+Math.random()*1.3);
        if(shape==='tetrahedron'&&contained) {
            const points=tetrahedronPoints({...fx,center:[0,0,0]},{x:2,y:2,z:2});
            const fit=Math.min(1,...[0,1,2].map(i=>
                (0.95-Math.abs(fx.center[i]))/Math.max(...points.map(point=>Math.abs(point[i])))));
            fx.radius*=fit;
        }
    }
    return fx;
}

function rerollMasterFX(shape) {
    if(!masterFocused||!Object.hasOwn(fixedFX,shape))return;
    masterChamber.effects={...masterChamber.effects,
        [shape]:randomVolume(fixedFX[shape],shape,masterChamber.effects[shape])};
    roomFX.syncPanel();queueSetupSave();
}

function randomPercussionSlice() {
    const slice=randomVolume('echo','slice');
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

// An orthonormal frame keeps the sphere round and the tetrahedron's
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
            const point=[dot(frame.u),dot(frame.v),dot(frame.n)].map(v=>v/fx.radius);
            // Four barycentric face distances: zero on a face, one at the center.
            const minimum=Math.min(...tetrahedronVertices.map(vertex=>
                1+3*vertex.reduce((sum,v,i)=>sum+v*point[i],0)));
            depth=Math.max(0,Math.min(1,minimum));
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
        const points=tetrahedronPoints(fx,bounds).map(normalized);
        faces=[[0,2,1],[0,1,3],[0,3,2],[1,2,3]].map(face=>face.map(i=>points[i]));
    }
    for(let axis=0;axis<3;axis++) for(const side of [-1,1]) {
        const normal=[0,0,0];normal[axis]=side;faces=clipSolid(faces,normal,1);
    }
    return faces;
}

const roomFX = {
    geometrySerial:0, panel:null, signature:'', geometries:new Map(), viewMaster:null,
    setup() {
        if(isPresentation)return;
        const panel=document.createElement('section');panel.className='room-fx';panel.hidden=true;
        panel.setAttribute('aria-label','Chamber controls');
        panel.innerHTML='<div class="fx-heading"><span id="fx-room"></span></div>'+
            '<div class="fx-footer"><div class="fx-shapes" role="group" aria-label="Rerandomize FX volumes"></div>'+
            '<p id="fx-hint" role="status"></p><button type="button" data-action="slice">Randomize percussion slice</button></div>';
        for(const [shape,type] of Object.entries(fixedFX)) {
            const button=document.createElement('button');button.type='button';button.dataset.shape=shape;
            button.textContent=roomFXShapes[shape]+' · '+roomEffectNames[type];
            button.title='Rerandomize '+roomFXShapes[shape];
            panel.querySelector('.fx-shapes').append(button);
        }
        panel.addEventListener('click',event=>{
            const button=event.target.closest('button');if(!button)return;
            const data=button.dataset.shape?{type:'master-reroll',shape:button.dataset.shape}:{type:'percussion-slice',index:soloIndex};
            if(isPresentation)lan.send(data);else handleChamberControl(data);
        });
        document.getElementById('stage').append(panel);this.panel=panel;
    },
    syncPanel() {
        if(!this.panel)return;
        const focused=masterFocused;
        const signature=JSON.stringify([soloIndex,focused]);
        if(signature===this.signature)return;this.signature=signature;
        this.panel.hidden=soloIndex<0&&!focused;
        if(this.panel.hidden)return;
        this.panel.querySelector('#fx-room').textContent=focused?'FX':'Room '+String(soloIndex+1).padStart(2,'0');
        this.panel.querySelector('.fx-shapes').hidden=!focused;
        this.panel.querySelector('[data-action="slice"]').hidden=focused;
        this.panel.querySelector('#fx-hint').textContent=focused
            ?'Tap a volume or its label to randomize · Tap outside to return'
            :'Slice crossings trigger percussion · Tap below to reroll';
    },
    pickVolume(x,y) {
        if(!playback.pickMatrix)return null;
        const frame=playback.frames[0]?.master;if(!frame)return null;
        const inverse=playback.pickMatrix.inverse();
        const unproject=z=>{
            const p=inverse.transformPoint({x:2*x/width-1,y:1-2*y/height,z,w:1});
            return [p.x/p.w,p.y/p.w,p.z/p.w].map((value,i)=>value/(frame.bounds[['x','y','z'][i]]/2));
        };
        const start=unproject(-1),end=unproject(1),direction=end.map((value,i)=>value-start[i]);
        const sub=(a,b)=>a.map((v,i)=>v-b[i]);
        const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
        const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
        let closest=Infinity,result=null;
        for(const [shape,fx] of Object.entries(frame.effects)) {
            if(!validRoomFX(fx))continue;
            for(const face of volumeFaces(fx,frame.bounds))for(let i=1;i<face.length-1;i++) {
                const edge1=sub(face[i],face[0]),edge2=sub(face[i+1],face[0]),p=cross(direction,edge2),det=dot(edge1,p);
                if(Math.abs(det)<1e-9)continue;
                const t=sub(start,face[0]),u=dot(t,p)/det;if(u<0||u>1)continue;
                const q=cross(t,edge1),v=dot(direction,q)/det;if(v<0||u+v>1)continue;
                const hit=dot(edge2,q)/det;
                if(hit>=0&&hit<=1&&hit<closest){closest=hit;result=shape;}
            }
        }
        return result;
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
    if(data.type==='master-reroll')rerollMasterFX(data.shape);
    if(data.type==='percussion-slice')reshufflePercussion(data.index);
}
