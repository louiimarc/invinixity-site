// Start with: node lan-server.cjs     (Node 22+, npm install in this folder)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { WebSocketServer, WebSocket } = require('ws');
const port = Number(process.env.PORT || 8765);
const loopback = addr => ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(addr);
const addresses = Object.values(os.networkInterfaces()).flat().filter(n => n && n.family === 'IPv4' && !n.internal);
const lanIP = addresses.find(n => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(n.address))?.address || addresses[0]?.address;
let lanName = lanIP || '127.0.0.1';
if (process.platform === 'darwin') {
    try {
        const name = execFileSync('/usr/sbin/scutil', ['--get','LocalHostName'], {encoding:'utf8'}).trim();
        if (/^[a-z0-9-]+$/i.test(name)) lanName = name + '.local';
    } catch { /* Fall back to the interface address if Bonjour is unavailable. */ }
}
const viewURL = 'http://' + lanName + ':' + port + '/present.html';
const types = {'.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.ttf':'font/ttf'};
const server = http.createServer((req,res) => {
    let name;
    try { name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.writeHead(400).end(); return; }
    if (name === '/' || name === '/index.html') name = loopback(req.socket.remoteAddress) ? '/index.html' : '/present.html';
    if (!/^\/(index\.html|present\.html|style\.css|js\/[\w-]+\.js|vendor\/(p5(\.sound)?|qrcode)\.min\.js|assets\/font\/SyneMono-Regular\.ttf)$/.test(name)) {
        res.writeHead(404).end(); return;
    }
    const file = path.join(__dirname, name);
    fs.stat(file,(err,stat) => {
        if (err) { res.writeHead(404).end(); return; }
        res.writeHead(200, {'Content-Type':types[path.extname(file)], 'Content-Length':stat.size, 'Cache-Control':'no-cache'});
        if (req.method === 'HEAD') res.end();
        else fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
    });
});
const sockets = new WebSocketServer({noServer:true,maxPayload:65536});
const viewers = new Set();
let host;
let latest;
let pending = [];
let headInput;
const headListeners = new Set();
server.on('upgrade', (req, socket, head) => {
    const presenter = req.url === '/sync/view';
    const local = loopback(req.socket.remoteAddress);
    const controllerOrigin = ['http://127.0.0.1:' + port, 'http://localhost:' + port].includes(req.headers.origin);
    const localHost = req.url === '/sync/host' && local && controllerOrigin;
    const tracker = req.url === '/sync/head-input' && local && !req.headers.origin;
    const listenHead = req.url === '/sync/head-listener' && local && controllerOrigin;
    if ((!presenter && !localHost && !tracker && !listenHead) || (localHost && host) || (tracker && headInput)) {
        socket.destroy(); return;
    }
    sockets.handleUpgrade(req,socket,head,ws => {
        ws.on('error', () => ws.terminate());
        if (listenHead) {
            headListeners.add(ws);
            ws.on('close', () => headListeners.delete(ws));
            return;
        }
        if (tracker) {
            headInput = ws;
            ws.on('close', () => { headInput = null; });
            ws.on('message', raw => {
                let axes;
                try { axes = JSON.parse(raw); } catch { ws.close(1003); return; }
                if (!Array.isArray(axes) || axes.length !== 6 || !axes.every(v => Number.isFinite(v) && Math.abs(v) < 1.001)) return;
                for (const client of headListeners) {
                    if (client.readyState === WebSocket.OPEN && client.bufferedAmount < 4096) client.send(JSON.stringify(axes));
                }
            });
            return;
        }
        if (localHost) {
            host = ws;
            ws.send(JSON.stringify({type:'info',url:viewURL}));
        }
        ws.on('message', raw => {
            let msg;
            try { msg = JSON.parse(raw); } catch { ws.close(1003); return; }
            if (msg?.type === 'ping') {
                ws.send(JSON.stringify({type:'pong',sent:msg.sent,now:Date.now()}));
                if (presenter && !viewers.has(ws)) {
                    viewers.add(ws);
                    ws.send(JSON.stringify(latest ? {type:'frame',frame:latest,notes:pending.filter(n=>n.at>Date.now())} : {type:'waiting'}));
                }
            } else if(presenter && ['master-focus','master-effect','master-shape','master-clear','percussion-slice'].includes(msg?.type) &&
                host?.readyState===WebSocket.OPEN) {
                const allowed=msg.type==='master-focus' ||
                    (msg.type==='percussion-slice' && Number.isInteger(msg.index) && msg.index===latest?.solo && msg.index>=0 && msg.index<latest.activeCount) ||
                    (latest?.master?.focused && (msg.type==='master-clear' ||
                        msg.type==='master-effect' && ['lowpass','highpass','bandpass','bitcrush','echo','stutter'].includes(msg.effect) ||
                        msg.type==='master-shape' && ['slice','sphere','tetrahedron'].includes(msg.shape)));
                if(allowed)host.send(JSON.stringify({type:msg.type,index:msg.index,effect:msg.effect,shape:msg.shape}));
            } else if (presenter && msg?.type === 'unsolo' && host?.readyState === WebSocket.OPEN) {
                host.send(JSON.stringify({type:'unsolo'}));
            } else if (presenter && msg?.type === 'hat-step' && [1,-1].includes(msg.delta) && host?.readyState === WebSocket.OPEN) {
                host.send(JSON.stringify({type:'hat-step', delta:msg.delta}));
            } else if (presenter && msg?.type === 'solo' && Number.isInteger(msg.index) &&
                msg.index >= 0 && msg.index < (latest?.activeCount ?? 0) && host?.readyState === WebSocket.OPEN) {
                host.send(JSON.stringify({type:'solo', index:msg.index}));
            } else if (ws === host && msg?.type === 'frame' && Array.isArray(msg.frame?.boxes) && Array.isArray(msg.notes)) {
                latest = msg.frame;
                pending = pending.filter(n => latest.sounding && n.at > Date.now() && n.i < (latest.activeCount ?? latest.boxes.length) &&
                    (!(latest.solo >= 0) || n.i === latest.solo)).concat(msg.notes);
                for (const client of viewers) {
                    if (client.readyState === WebSocket.OPEN && client.bufferedAmount < 65536) client.send(raw.toString());
                }
            }
        });
        ws.on('close', () => {
            viewers.delete(ws);
            if (ws !== host) return;
            host = latest = null;
            pending = [];
            for (const client of viewers) if (client.readyState === WebSocket.OPEN) client.send('{"type":"waiting"}');
        });
    });
});
server.listen({port,host:'::',ipv6Only:false},() => console.log('Controller http://127.0.0.1:' + port + '/\nPresentation ' + viewURL));
