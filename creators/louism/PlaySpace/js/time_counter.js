class Timer {
    constructor(interval) {
        this.interval = interval;
        this.initial = this.interval;
        this.counterDown = this.interval;
        this.time = 0;
    }
    start() { this.initial = -this.time; }
    end() {
        this.counterUp = this.time + this.initial;
        this.counterDown = this.interval - this.counterUp;
        if (this.counterUp >= this.interval) {
            this.initial = this.interval;
            return true;
        } else {
            return false;
        }
    }
}
