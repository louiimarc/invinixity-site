const isPresentation = document.body.classList.contains('present');
const lan = {
    socket: null,
    offset: 0,
    connect(onPacket, onLost) {
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
    send(data) {
        if (this.socket?.readyState === WebSocket.OPEN && this.socket.bufferedAmount < 65536)
            this.socket.send(JSON.stringify(data));
    }
};
