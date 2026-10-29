// @ts-nocheck
/** Page-world controls. These are observable JavaScript patches, not native kernel spoofing.
 * The same seed is reused on every document so a session does not drift on reload. */
export function fingerprintSource(profile) {
    const options = {
        ...profile.fingerprint,
        seed: profile.fingerprint?.seed || profile.id || 'orbit',
        ...(profile.hardwareConcurrency ? { hardwareConcurrency: profile.hardwareConcurrency } : {}),
    };
    return `(${install.toString()})(${JSON.stringify(options)})`;
}
function install(o) {
    // This function is serialized and runs without Node or Electron access in both Window and Worker realms.
    let seed = 2166136261;
    for (const char of String(o.seed))
        seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
    const noise = (i) => (((Math.imul((seed ^ i) >>> 0, 2654435761) >>> 0) % 2001) - 1000) / 1000;
    const maskedToString = new WeakMap();
    if (globalThis.Function?.prototype?.toString) {
        const rawToString = globalThis.Function.prototype.toString;
        const toStringProxy = new Proxy(rawToString, {
            apply(fn, self, args) {
                if (typeof self === 'function' && maskedToString.has(self))
                    return maskedToString.get(self);
                return Reflect.apply(fn, self, args);
            }
        });
        maskedToString.set(toStringProxy, 'function toString() { [native code] }');
        Object.defineProperty(globalThis.Function.prototype, 'toString', { configurable: true, writable: true, value: toStringProxy });
    }
    const getter = (target, key, value) => {
        if (!target)
            return;
        const fn = { [key]() { return value; } }[key];
        maskedToString.set(fn, `function get ${key}() { [native code] }`);
        Object.defineProperty(target, key, { configurable: true, get: fn });
    };
    const navProtos = [globalThis.Navigator?.prototype, globalThis.WorkerNavigator?.prototype].filter(Boolean);
    const navGetter = (key, value) => { for (const proto of navProtos)
        getter(proto, key, value); };
    const wrap = (target, key, handler) => {
        if (!target || typeof target[key] !== 'function')
            return;
        const original = target[key];
        const proxied = new Proxy(original, { apply: (fn, self, args) => handler(fn, self, args) });
        maskedToString.set(proxied, `function ${key}() { [native code] }`);
        Object.defineProperty(target, key, { configurable: true, writable: true, value: proxied });
    };
    if (o.deviceMemory)
        navGetter('deviceMemory', o.deviceMemory);
    if (o.hardwareConcurrency)
        navGetter('hardwareConcurrency', o.hardwareConcurrency);
    if (o.doNotTrack && o.doNotTrack !== 'real')
        navGetter('doNotTrack', o.doNotTrack === 'on' ? '1' : '0');
    if (o.maxTouchPoints !== undefined)
        navGetter('maxTouchPoints', o.maxTouchPoints);
    if (o.webRTC === 'disabled') {
        for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCDataChannel'])
            getter(globalThis, name, undefined);
    }
    if (o.mediaDevices === 'blocked') {
        wrap(globalThis.MediaDevices?.prototype, 'enumerateDevices', () => Promise.resolve([]));
        for (const key of ['getUserMedia', 'getDisplayMedia'])
            wrap(globalThis.MediaDevices?.prototype, key, () => Promise.reject(new DOMException('Blocked by session settings', 'NotAllowedError')));
    }
    if (o.speech === 'hidden' && globalThis.SpeechSynthesis && typeof speechSynthesis !== 'undefined') {
        wrap(Object.getPrototypeOf(speechSynthesis), 'getVoices', () => []);
    }
    if (o.webGPU === 'disabled')
        navGetter('gpu', undefined);
    if (o.battery === 'hidden')
        navGetter('getBattery', undefined);
    if (o.connection === 'hidden')
        navGetter('connection', undefined);
    if (o.plugins === 'empty' && globalThis.Navigator?.prototype) {
        // Return native, correctly branded empty collections from a clean same-origin frame
        // is not feasible here; expose the limitation instead of manufacturing PluginArray.
        getter(globalThis.Navigator.prototype, 'plugins', Object.freeze([]));
        getter(globalThis.Navigator.prototype, 'mimeTypes', Object.freeze([]));
    }
    if (o.fonts === 'restricted') {
        getter(globalThis, 'queryLocalFonts', undefined);
        wrap(globalThis.FontFaceSet?.prototype, 'check', (fn, self, args) => {
            if (!/^(?:[\w.-]+\s+)*[\d.]+(?:px|pt|em|rem|%)\s+(?:serif|sans-serif|monospace|system-ui)$/i.test(args[0]))
                return false;
            return Reflect.apply(fn, self, args);
        });
    }
    if (o.canvas === 'noise') {
        const perturb = (data) => {
            for (let i = 0; i < data.length; i += 4)
                if (data[i + 3])
                    data[i] = Math.min(255, Math.max(0, data[i] + (noise(i) > 0 ? 1 : -1)));
        };
        const raw2d = globalThis.CanvasRenderingContext2D?.prototype?.getImageData;
        const rawOffscreen2d = globalThis.OffscreenCanvasRenderingContext2D?.prototype?.getImageData;
        for (const proto of [globalThis.CanvasRenderingContext2D?.prototype, globalThis.OffscreenCanvasRenderingContext2D?.prototype]) {
            if (!proto)
                continue;
            wrap(proto, 'getImageData', (fn, self, args) => { const image = Reflect.apply(fn, self, args); perturb(image.data); return image; });
        }
        if (globalThis.HTMLCanvasElement?.prototype && globalThis.document && raw2d) {
            const copy = (canvas) => {
                const c = document.createElement('canvas');
                c.width = canvas.width;
                c.height = canvas.height;
                const ctx = c.getContext('2d');
                ctx.drawImage(canvas, 0, 0);
                if (c.width && c.height) {
                    const image = Reflect.apply(raw2d, ctx, [0, 0, c.width, c.height]);
                    perturb(image.data);
                    ctx.putImageData(image, 0, 0);
                }
                return c;
            };
            for (const key of ['toDataURL', 'toBlob'])
                wrap(globalThis.HTMLCanvasElement.prototype, key, (fn, self, args) => Reflect.apply(fn, copy(self), args));
        }
        if (globalThis.OffscreenCanvas?.prototype && rawOffscreen2d) {
            const copyOffscreen = (canvas) => {
                const c = new OffscreenCanvas(canvas.width, canvas.height);
                const ctx = c.getContext('2d');
                ctx.drawImage(canvas, 0, 0);
                if (c.width && c.height) {
                    const image = Reflect.apply(rawOffscreen2d, ctx, [0, 0, c.width, c.height]);
                    perturb(image.data);
                    ctx.putImageData(image, 0, 0);
                }
                return c;
            };
            wrap(globalThis.OffscreenCanvas.prototype, 'convertToBlob', (fn, self, args) => Reflect.apply(fn, copyOffscreen(self), args));
        }
    }
    for (const proto of [globalThis.WebGLRenderingContext?.prototype, globalThis.WebGL2RenderingContext?.prototype]) {
        if (!proto)
            continue;
        if (o.webGLVendor || o.webGLRenderer)
            wrap(proto, 'getParameter', (fn, self, args) => {
                if (args[0] === 37445 && o.webGLVendor)
                    return o.webGLVendor;
                if (args[0] === 37446 && o.webGLRenderer)
                    return o.webGLRenderer;
                return Reflect.apply(fn, self, args);
            });
        if (o.webGL === 'noise')
            wrap(proto, 'readPixels', (fn, self, args) => {
                const result = Reflect.apply(fn, self, args);
                const output = args[6];
                if (output instanceof Uint8Array)
                    for (let i = Number(args[7] || 0); i < output.length; i += 64)
                        output[i] = Math.min(255, Math.max(0, output[i] + (noise(i) > 0 ? 1 : -1)));
                return result;
            });
    }
    if (o.audio === 'noise' && globalThis.AudioBuffer?.prototype) {
        // Perturb each native channel once. Preserve getChannelData's writable view
        // semantics and keep copyFromChannel aligned without accumulating noise.
        const raw = AudioBuffer.prototype.getChannelData;
        const processed = new WeakSet();
        const channel = (buffer, index) => {
            const data = Reflect.apply(raw, buffer, [index]);
            if (!processed.has(data)) {
                for (let i = 0; i < data.length; i++)
                    data[i] += noise(i) * 0.0000001;
                processed.add(data);
            }
            return data;
        };
        wrap(AudioBuffer.prototype, 'getChannelData', (_fn, self, args) => channel(self, args[0]));
        wrap(AudioBuffer.prototype, 'copyFromChannel', (fn, self, args) => {
            channel(self, args[1]);
            return Reflect.apply(fn, self, args);
        });
    }
    const bootstrap = `(${install.toString()})(${JSON.stringify(o)});`;
    for (const name of ['Worker', 'SharedWorker']) {
        const Original = globalThis[name];
        if (typeof Original !== 'function')
            continue;
        const proxiedWorker = new Proxy(Original, {
            construct(target, args, newTarget) {
                try {
                    const [scriptURL, options] = args;
                    const resolved = new URL(String(scriptURL), globalThis.location?.href || 'http://localhost/').href;
                    const isModule = options && typeof options === 'object' && options.type === 'module';
                    const code = isModule ? `${bootstrap}import ${JSON.stringify(resolved)};` : `${bootstrap}importScripts(${JSON.stringify(resolved)});`;
                    const blobURL = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
                    return Reflect.construct(target, [blobURL, ...args.slice(1)], newTarget);
                }
                catch {
                    return Reflect.construct(target, args, newTarget);
                }
            }
        });
        maskedToString.set(proxiedWorker, `function ${name}() { [native code] }`);
        globalThis[name] = proxiedWorker;
    }
}
