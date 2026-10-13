export class RingQueue {
  constructor(size = 1024) {
    this.buffer = new Array(size);
    this.head = 0;
    this.tail = 0;
  }
  get length() {
    return this.tail - this.head;
  }
  push(value) {
    if (this.length >= this.buffer.length) {
      const next = new Array(this.buffer.length * 2);
      for (let i = this.head; i < this.tail; i++)
        next[i - this.head] = this.buffer[i % this.buffer.length];
      this.buffer = next;
      this.tail -= this.head;
      this.head = 0;
    }
    this.buffer[this.tail % this.buffer.length] = value;
    this.tail++;
  }
  shift() {
    if (!this.length) return undefined;
    const index = this.head % this.buffer.length,
      value = this.buffer[index];
    this.buffer[index] = undefined;
    this.head++;
    return value;
  }
}
