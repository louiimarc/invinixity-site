const tabletGestures={
    isTablet:/iPad|Tablet/i.test(navigator.userAgent)||
        (/Macintosh|MacIntel/.test(navigator.userAgent+' '+navigator.platform)&&navigator.maxTouchPoints>1)||
        (navigator.maxTouchPoints>1&&matchMedia('(pointer: coarse)').matches&&Math.min(screen.width,screen.height)>=600),
    pointers:new Map(),chord:null,lastTap:null,dial:null,
    setup() {
        document.body.classList.toggle('tablet-controls',this.isTablet);
        this.stage=document.getElementById('stage');
        this.setupSpectrumFlick();
        this.overlay=document.createElement('div');this.overlay.className='tempo-dial';this.overlay.hidden=true;
        this.overlay.setAttribute('role','status');this.overlay.setAttribute('aria-live','off');this.overlay.setAttribute('aria-label','Tempo dial');
        this.overlay.innerHTML='<div class="tempo-dial-ring"></div><div class="tempo-dial-value"><span></span><small>BPM</small></div>';
        document.body.append(this.overlay);
        document.addEventListener('pointerdown',event=>this.down(event),true);
        document.addEventListener('pointermove',event=>this.move(event),true);
        document.addEventListener('pointerup',event=>this.up(event),true);
        document.addEventListener('pointercancel',event=>this.cancel(event),true);
        window.addEventListener('blur',()=>this.reset());
        document.addEventListener('visibilitychange',()=>{if(document.hidden)this.reset();});
    },
    setupSpectrumFlick() {
        const spectrum=document.getElementById('spectrum-plot');let flick;
        spectrum.addEventListener('pointerdown',event=>{
            flick=null;
            if(event.pointerType!=='touch'||!event.isPrimary)return;
            flick={id:event.pointerId,x:event.clientX,y:event.clientY,at:performance.now(),
                portrait:matchMedia('(orientation: portrait)').matches};
            spectrum.setPointerCapture(event.pointerId);
        });
        spectrum.addEventListener('pointercancel',()=>{flick=null;});
        spectrum.addEventListener('lostpointercapture',()=>{flick=null;});
        spectrum.addEventListener('pointerup',event=>{
            const start=flick;flick=null;
            if(!start||start.id!==event.pointerId||performance.now()-start.at>700)return;
            const dx=event.clientX-start.x,dy=event.clientY-start.y;
            const travel=start.portrait?dx:-dy,cross=start.portrait?dy:dx;
            if(Math.abs(travel)<24||Math.abs(travel)<Math.abs(cross)*1.3)return;
            const delta=Math.sign(travel);
            if(isPresentation)lan.send({type:'room-step',delta});
            else {setBoxCount(numberOfShownEntity+delta);queueSetupSave();}
        });
    },
    focused() {return isPresentation?!!roomFX.viewMaster?.focused:masterFocused;},
    bpm() {return isPresentation?(roomFX.viewMaster?.bpm||108):clock.bpm;},
    insideFX(event) {
        if(!this.focused())return false;
        const rect=this.stage.getBoundingClientRect();
        return pickRoom(event.clientX-rect.left,event.clientY-rect.top,-2)===-2;
    },
    down(event) {
        if(event.pointerType!=='touch'||!this.stage.contains(event.target)||event.target.closest('.room-fx'))return;
        const now=event.timeStamp;
        if(!this.pointers.size)this.chord={start:now,max:0,moved:false,usedDial:false,fx:this.isTablet&&this.insideFX(event),starts:new Map()};
        this.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
        this.chord.starts.set(event.pointerId,{x:event.clientX,y:event.clientY});
        this.chord.max=Math.max(this.chord.max,this.pointers.size);
        if(this.pointers.size===2) {
            const pair=this.pair();
            this.dial={start:now,angle:pair.angle,rotation:0,base:this.bpm(),value:this.bpm(),active:false,lastSent:-Infinity};
            this.drawDial(pair);
        } else if(this.pointers.size>2)this.finishDial();
    },
    pair() {
        const [a,b]=Array.from(this.pointers.values());
        return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.hypot(b.x-a.x,b.y-a.y),angle:Math.atan2(b.y-a.y,b.x-a.x)};
    },
    move(event) {
        if(!this.pointers.has(event.pointerId))return;
        const start=this.chord.starts.get(event.pointerId);
        if(Math.hypot(event.clientX-start.x,event.clientY-start.y)>12)this.chord.moved=true;
        this.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
        if(this.pointers.size!==2||!this.dial)return;
        const pair=this.pair(),dial=this.dial;
        const delta=Math.atan2(Math.sin(pair.angle-dial.angle),Math.cos(pair.angle-dial.angle));
        dial.rotation+=delta*180/Math.PI;dial.angle=pair.angle;
        if(dial.active||(event.timeStamp-dial.start>=160&&pair.distance>=35&&Math.abs(dial.rotation)>=6)) {
            dial.active=true;this.chord.usedDial=true;this.lastTap=null;
            dial.value=Math.max(30,Math.min(300,Math.round(dial.base+dial.rotation/2)));
            this.sendTempo();
        }
        this.drawDial(pair);
    },
    drawDial(pair) {
        if(!this.dial?.active){this.overlay.hidden=true;return;}
        const size=Math.max(24,pair.distance),dial=this.dial;
        this.overlay.hidden=false;
        Object.assign(this.overlay.style,{left:pair.x+'px',top:pair.y+'px',width:size+'px',height:size+'px',
            fontSize:Math.max(12,Math.min(34,size/5))+'px'});
        this.overlay.style.setProperty('--dial-angle',(dial?.rotation||0)+'deg');
        this.overlay.classList.toggle('is-adjusting',!!dial?.active);
        this.overlay.querySelector('span').textContent=String(dial?.value??Math.round(this.bpm()));
    },
    sendTempo(force=false) {
        const dial=this.dial;if(!dial?.active)return;
        const now=performance.now();
        clearTimeout(this.tempoTimer);
        if(!force&&now-dial.lastSent<33) {
            this.tempoTimer=setTimeout(()=>this.sendTempo(true),33-(now-dial.lastSent));return;
        }
        dial.lastSent=now;
        if(isPresentation)lan.send({type:'tempo',bpm:dial.value});else setInstrumentTempo(dial.value);
    },
    finishDial() {
        if(!this.dial)return;
        this.sendTempo(true);this.dial=null;this.overlay.hidden=true;
    },
    up(event) {
        if(!this.pointers.has(event.pointerId))return;
        this.pointers.delete(event.pointerId);
        if(this.pointers.size<2)this.finishDial();
        if(this.pointers.size)return;
        const chord=this.chord;this.chord=null;
        if(!chord||!chord.fx||chord.moved||chord.usedDial||event.timeStamp-chord.start>400||![1,2,3].includes(chord.max)) {
            this.lastTap=null;return;
        }
        const points=Array.from(chord.starts.values());
        const tap={count:chord.max,at:event.timeStamp,x:points.reduce((s,p)=>s+p.x,0)/points.length,y:points.reduce((s,p)=>s+p.y,0)/points.length};
        const previous=this.lastTap;
        if(previous&&previous.count===tap.count&&chord.start-previous.at<=450&&Math.hypot(tap.x-previous.x,tap.y-previous.y)<70) {
            this.lastTap=null;
            const shape={1:'slice',2:'sphere',3:'tetrahedron'}[tap.count];
            if(isPresentation)lan.send({type:'master-reroll',shape});else rerollMasterFX(shape);
        } else this.lastTap=tap;
    },
    cancel(event) {
        if(this.pointers.has(event.pointerId))this.reset();
    },
    reset() {
        this.lastTap=null;this.pointers.clear();this.chord=null;
        this.finishDial();
    }
};
