// Sensor permission is requested only from a tap. The first reading sets neutral.
const motionControl={
    enabled:false,baseline:null,values:{lr:0,fb:0},remoteAt:-Infinity,
    lastSent:-Infinity,lastPeak:-Infinity,firstPeak:null,lastShake:-Infinity,
    setup() {
        const button=document.getElementById('enable-motion');
        if(!button)return;
        const supported=typeof DeviceOrientationEvent!=='undefined'&&
            (matchMedia('(pointer: coarse)').matches||typeof DeviceOrientationEvent.requestPermission==='function');
        button.hidden=!supported;
        button.onclick=()=>this.enabled?this.disable():this.enable();
        window.addEventListener('orientationchange',()=>{this.baseline=null;this.setValues(0,0);});
        document.addEventListener('visibilitychange',()=>{if(document.hidden)this.setValues(0,0);});
    },
    status(text) {const el=document.getElementById('motion-status');if(el)el.textContent=text;},
    async enable() {
        if(this.enabled||typeof DeviceOrientationEvent==='undefined')return;
        try {
            const requests=[globalThis.DeviceOrientationEvent,globalThis.DeviceMotionEvent]
                .filter(api=>typeof api?.requestPermission==='function').map(api=>api.requestPermission());
            if((await Promise.all(requests)).some(result=>result!=='granted')) {
                this.status('Motion permission was not granted. Tap Enable motion to retry.');return;
            }
            this.enabled=true;this.baseline=null;
            this.orientationHandler=event=>this.orientation(event);
            this.motionHandler=event=>this.acceleration(event);
            window.addEventListener('deviceorientation',this.orientationHandler);
            window.addEventListener('devicemotion',this.motionHandler);
            this.heartbeat=setInterval(()=>{if(!document.hidden)this.publish();},250);
            const button=document.getElementById('enable-motion');if(button)button.textContent='Disable motion';
            this.status('Hold your device comfortably to set neutral.');
            this.sensorTimeout=setTimeout(()=>{if(!this.baseline)this.status('No orientation data yet. Check motion access in Safari.');},3500);
        } catch {
            this.status('Motion access could not start. Tap Enable motion to retry.');
        }
    },
    disable() {
        this.enabled=false;this.baseline=null;this.firstPeak=null;
        clearInterval(this.heartbeat);clearTimeout(this.sensorTimeout);
        window.removeEventListener('deviceorientation',this.orientationHandler);
        window.removeEventListener('devicemotion',this.motionHandler);
        this.setValues(0,0,true);
        const button=document.getElementById('enable-motion');if(button)button.textContent='Enable motion';
        this.status('Motion off.');
    },
    setValues(lr,fb,force=false) {
        this.values={lr,fb};
        this.publish(force);
    },
    publish(force=false) {
        if(!isPresentation)return;
        const now=performance.now();
        if(!force&&now-this.lastSent<33)return;
        this.lastSent=now;lan.send({type:'motion',tilt:this.values});
    },
    orientation(event) {
        if(!this.enabled||document.hidden||!Number.isFinite(event.beta)||!Number.isFinite(event.gamma))return;
        const angle=((screen.orientation?.angle??window.orientation??0)*Math.PI)/180;
        if(!this.baseline||this.baseline.angle!==angle) {
            this.baseline={beta:event.beta,gamma:event.gamma,angle};
            this.setValues(0,0,true);this.status('Tilt LR · high-pass / FB · low-pass · Shake to randomize');return;
        }
        const wrap=degrees=>((degrees+180)%360+360)%360-180;
        const beta=wrap(event.beta-this.baseline.beta),gamma=wrap(event.gamma-this.baseline.gamma);
        const lr=gamma*Math.cos(angle)+beta*Math.sin(angle);
        const fb=beta*Math.cos(angle)-gamma*Math.sin(angle);
        const amount=degrees=>Math.max(0,Math.min(1,(Math.abs(degrees)-3)/32));
        this.setValues(amount(lr),amount(fb));
    },
    acceleration(event) {
        if(!this.enabled||document.hidden)return;
        const vector=event.acceleration;
        const linear=vector&&[vector.x,vector.y,vector.z].every(Number.isFinite);
        const source=linear?vector:event.accelerationIncludingGravity;
        if(!source||![source.x,source.y,source.z].every(Number.isFinite))return;
        const magnitude=Math.hypot(source.x,source.y,source.z);
        const strength=linear?magnitude:Math.abs(magnitude-9.81);
        const now=performance.now();
        if(strength<12||now-this.lastShake<1500||now-this.lastPeak<80)return;
        this.lastPeak=now;
        if(this.firstPeak!==null&&now-this.firstPeak<450) {
            this.firstPeak=null;this.lastShake=now;
            if(isPresentation)lan.send({type:'shake'});else rerandomizeInstrument();
        } else this.firstPeak=now;
    },
    receive(tilt) {
        if(!tilt||![tilt.lr,tilt.fb].every(value=>Number.isFinite(value)&&value>=0&&value<=1))return;
        this.values={lr:tilt.lr,fb:tilt.fb};this.remoteAt=performance.now();
    },
    snapshot() {
        return (this.enabled&&!document.hidden)||performance.now()-this.remoteAt<1500?this.values:{lr:0,fb:0};
    }
};
