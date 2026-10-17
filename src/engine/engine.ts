// Singleton bridge to the drawing engine (pdf.js running in a WebView / iframe).
type Listener = (msg: any) => void;

let sender: ((js: string) => void) | null = null;
let ready = false;
const queue: string[] = [];
const listeners = new Set<Listener>();

export const engine = {
  /** Called by the platform view once the page has booted. */
  attach(fn: (js: string) => void) {
    sender = fn;
  },
  detach() {
    sender = null;
    ready = false;
  },
  handleRaw(raw: string) {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type === 'ready') {
      ready = true;
      while (queue.length && sender) sender(queue.shift()!);
    }
    listeners.forEach(l => l(msg));
  },
  exec(js: string) {
    if (ready && sender) sender(js);
    else queue.push(js);
  },
  send(obj: object) {
    this.exec(`window.__recv(${JSON.stringify(obj)});true;`);
  },
  /** Push a PDF (base64) into the engine in chunks, then load it. */
  loadPdf(b64: string, key: string) {
    const size = 1_500_000;
    const n = Math.ceil(b64.length / size);
    for (let i = 0; i < n; i++) this.exec(`window.__chunk(${i},${JSON.stringify(b64.slice(i * size, (i + 1) * size))});true;`);
    this.send({ type: 'loadPdf', key });
  },
  on(l: Listener) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  /** Wait for one message of a given type. */
  waitFor<T = any>(type: string, timeoutMs = 120000): Promise<T> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        off();
        reject(new Error('Timed out waiting for ' + type));
      }, timeoutMs);
      const off = this.on(m => {
        if (m.type === type) {
          clearTimeout(t);
          off();
          resolve(m);
        } else if (m.type === 'error') {
          clearTimeout(t);
          off();
          reject(new Error(m.message));
        }
      });
    });
  },
};
