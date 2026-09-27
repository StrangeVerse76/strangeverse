/** Riproduce un AudioBuffer alla volta sul contesto live, con posizione e ripartenza da un punto. */
export class BufferPlayer {
  private source: AudioBufferSourceNode | null = null
  private context: AudioContext | null = null
  private startedAt = 0
  private duration = 0

  /** Chiamato quando il buffer finisce da solo (non quando si ferma con `stop`). */
  onEnded: (() => void) | null = null

  play(context: AudioContext, out: AudioNode, buffer: AudioBuffer, offset = 0) {
    this.stop()
    const start = Math.min(Math.max(0, offset), buffer.duration)
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(out)
    source.onended = () => {
      if (this.source !== source) return
      this.release()
      this.onEnded?.()
    }
    source.start(0, start)
    this.source = source
    this.context = context
    this.startedAt = context.currentTime - start
    this.duration = buffer.duration
  }

  stop() {
    const source = this.source
    this.release()
    if (source) {
      source.onended = null
      source.stop()
    }
  }

  get playing() {
    return this.source !== null
  }

  /** Secondi dall'inizio del buffer. */
  position(): number {
    if (!this.source || !this.context) return 0
    return Math.min(this.context.currentTime - this.startedAt, this.duration)
  }

  private release() {
    this.source?.disconnect()
    this.source = null
  }
}
