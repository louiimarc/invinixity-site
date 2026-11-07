// No analysis or recorded loops: quantization/sample-and-hold, then an amplitude gate.
class TextureProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            {name:'crushDepth',defaultValue:0,minValue:0,maxValue:1,automationRate:'k-rate'},
            {name:'gateDepth',defaultValue:0,minValue:0,maxValue:1,automationRate:'k-rate'},
            {name:'bpm',defaultValue:108,minValue:30,maxValue:300,automationRate:'k-rate'},
            {name:'beat',defaultValue:0,automationRate:'k-rate'},
            {name:'anchor',defaultValue:0,automationRate:'k-rate'}
        ];
    }
    constructor() {
        super();this.held=[];this.remaining=[];this.active=true;
        this.port.onmessage=event=>{if(event.data==='dispose')this.active=false;};
    }
    process(inputs,outputs,parameters) {
        if(!this.active)return false;
        const input=inputs[0],output=outputs[0];
        const crush=parameters.crushDepth[0],depth=parameters.gateDepth[0];
        const levels=2**(15-12*crush),hold=1+Math.floor(crush*crush*31);
        const rate=parameters.bpm[0]/60*4; // Four gates per quarter note: 1/16 notes.
        const edge=Math.min(0.1,rate*0.002); // Two-millisecond fades prevent hard gain steps.
        const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
        for(let channel=0;channel<output.length;channel++) {
            const source=input[channel],destination=output[channel];
            let held=this.held[channel]||0,remaining=this.remaining[channel]||0;
            for(let i=0;i<destination.length;i++) {
                const sample=source?.[i]||0;
                if(crush>0) {
                    if(remaining<=0){held=Math.round(Math.max(-1,Math.min(1,sample))*levels)/levels;remaining=hold;}
                    remaining--;
                } else {held=sample;remaining=0;}
                let gain=1;
                if(depth>0) {
                    const beat=parameters.beat[0]+((currentFrame+i)/sampleRate-parameters.anchor[0])*parameters.bpm[0]/60;
                    const phase=((beat*4)%1+1)%1;
                    const gate=smooth(phase/edge)*smooth((0.5-phase)/edge);
                    gain=1-depth+depth*gate;
                }
                destination[i]=(sample+crush*(held-sample))*gain;
            }
            this.held[channel]=held;this.remaining[channel]=remaining;
        }
        return true;
    }
}
registerProcessor('axelerometric-texture',TextureProcessor);
