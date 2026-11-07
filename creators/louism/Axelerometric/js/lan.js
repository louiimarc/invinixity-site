const isPresentation = document.body.classList.contains('present');
const lan = {
    socket: null,
    session:globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),
    channel:null, latest:null, local:false,
    offset: 0,
    connect(onPacket, onLost) {
        const localSession=new URLSearchParams(location.search).get('local');
        if(typeof BroadcastChannel==='function' && (!isPresentation || localSession)) {
            this.local=isPresentation&&!!localSession;
            this.channel=new BroadcastChannel('axelerometric-present-'+(localSession||this.session));
            this.channel.onmessage=event=>{
                const packet=event.data;
                if(!packet || typeof packet.type!=='string')return;
                if(isPresentation) {
                    if(packet.type==='frame')this.offset=packet.relayOffset||0;
                    onPacket(packet);
                } else if(packet.type==='join') {
                    this.channel.postMessage(this.latest?{...this.latest,relayOffset:this.offset}:{type:'waiting'});
                } else if(['solo','unsolo','master-focus','master-reroll','percussion-slice','hat-step','motion','shake','tempo','room-step','room-motion','tempo-dial','camera'].includes(packet.type)) {
                    onPacket(packet);
                }
            };
            if(this.local) {this.channel.postMessage({type:'join'});return;}
            window.addEventListener('pagehide',()=>this.channel.postMessage({type:'waiting'}));
        }
        // The LAN server exposes these pages at its root. The public project
        // lives in a static website directory and runs the instrument locally.
        if (!['/', '/index.html', '/present.html'].includes(location.pathname)) {
            if (isPresentation) onLost('Presentation requires the local Axelerometric server.');
            return;
        }
        let timer;
        const open = () => {
            const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
            const socket = new WebSocket(scheme + '//' + location.host + '/sync/' + (isPresentation ? 'view' : 'host'));
            this.socket = socket;
            let best = Infinity;
            const ping = () => this.send({type:'ping', sent:performance.timeOrigin + performance.now()});
            socket.onopen = () => {
                ping();
                timer = setInterval(() => { best = Infinity; ping(); }, 5000);
            };
            socket.onmessage = event => {
                const data = JSON.parse(event.data);
                if (data.type === 'pong') {
                    const end = performance.timeOrigin + performance.now();
                    const rtt = end - data.sent;
                    if (rtt < best) {
                        best = rtt;
                        this.offset = data.now - (end + data.sent) / 2;
                    }
                } else onPacket(data);
            };
            socket.onclose = () => {
                clearInterval(timer);
                onLost();
                setTimeout(open, 2000);
            };
        };
        open();
    },
    validCamera(view) {
        return Array.isArray(view)&&view.length===9&&view.every(v=>Number.isFinite(v)&&Math.abs(v)<10000)&&
            Math.hypot(...view.slice(6))>0.1&&Math.hypot(...view.slice(0,3).map((v,i)=>v-view[i+3]))>0.0001;
    },
    send(data) {
        if(data.type==='frame')this.latest=data;
        if(this.channel && (isPresentation || ['frame','tempo-dial'].includes(data.type)))this.channel.postMessage({...data,relayOffset:this.offset});
        if (this.socket?.readyState === WebSocket.OPEN && this.socket.bufferedAmount < 65536)
            this.socket.send(JSON.stringify(data));
    }
};
