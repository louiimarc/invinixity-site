class WebMIDIListener {
    constructor() {
        this.midiAccess = null; // MIDI Access
        this.midiInputs = [];   // List of available MIDI inputs
        this.noteValues = {};   // Store note values (on/off)
        this.ccValues = {};     // Store CC values (0-127)
        this.activeChannel = 'omni'; // Default to omni-channel

        // Initialize MIDI
        this.initMIDI();
    }

    // Initialize the Web MIDI API
    async initMIDI() {
        try {
            // Request access to the Web MIDI API
            this.midiAccess = await navigator.requestMIDIAccess();

            // Get MIDI inputs and add event listeners
            this.midiAccess.inputs.forEach((input) => {
                input.onmidimessage = this.handleMIDIMessage.bind(this); // Bind the MIDI message handler
                this.midiInputs.push(input);
            });

            console.log("MIDI inputs initialized.");
        } catch (err) {
            console.error("MIDI initialization failed:", err);
        }
    }

    // Handle incoming MIDI messages
    handleMIDIMessage(event) {
        let [status, data1, data2] = event.data;
        let messageType = status & 0xf0; // Get the message type (note on, note off, CC, etc.)
        let channel = status & 0x0f;     // Get the channel number (0-15)

        // Check if we are in omni-channel mode or the specific channel is active
        if (this.activeChannel === 'omni' || this.activeChannel === channel) {
            switch (messageType) {
                case 0x90: // Note on
                    if (data2 > 0) { // velocity > 0 means note on
                        this.noteValues[data1] = data2; // Store note with velocity
                    } else {
                        this.noteValues[data1] = 0; // Treat as note off
                    }
                    break;
                case 0x80: // Note off
                    this.noteValues[data1] = 0; // Mark note as off
                    break;
                case 0xB0: // Control Change (CC)
                    this.ccValues[data1] = data2; // Store CC value (0-127)
                    break;
                default:
                    console.log("Unhandled MIDI message:", event.data);
            }
        }
    }

    // Get the current value of a note or control change
    getValue(type, number) {
        switch (type) {
            case 'note':
                return this.noteValues[number] || 0; // Return note velocity or 0 if not playing
            case 'cc':
                return this.ccValues[number] || 0;   // Return CC value or 0 if not set
            default:
                console.error("Unknown MIDI type. Use 'note' or 'cc'.");
                return null;
        }
    }

    // Set the active MIDI channel (0-15) or 'omni' for all channels
    setChannel(channel) {
        if (channel === 'omni' || (channel >= 0 && channel <= 15)) {
            this.activeChannel = channel;
            console.log(`MIDI channel set to ${channel}`);
        } else {
            console.error("Invalid MIDI channel. Use 'omni' or a number between 0 and 15.");
        }
    }
}
