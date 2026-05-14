export class SpeedCalculator {
  private samples: { time: number; bytes: number }[] = [];
  private readonly maxSamples = 20;

  addSample(bytes: number) {
    this.samples.push({ time: Date.now(), bytes });
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }

  getSpeed(): number {
    if (this.samples.length < 2) return 0;
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    const timeDiff = (last.time - first.time) / 1000; // seconds
    const bytesDiff = last.bytes - first.bytes;
    if (timeDiff === 0) return 0;
    return bytesDiff / timeDiff;
  }

  formatSpeed(bytesPerSec: number): string {
    if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(1)} B/s`;
    if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  }
}
