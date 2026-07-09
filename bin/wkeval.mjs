// wkeval.mjs — evaluate JS in iOS Simulator Safari via WebKit Remote Inspector (through iwdp)
// Modern WebKit uses a Target-wrapped protocol: commands go via Target.sendMessageToTarget,
// responses come back via Target.dispatchMessageFromTarget.
// Usage: node wkeval.mjs '<js-expression>'
const WS_URL = process.env.WK_WS || 'ws://localhost:9222/devtools/page/1';
const expr = process.argv[2];
if (!expr) { console.error('need a JS expression arg'); process.exit(2); }

const ws = new WebSocket(WS_URL);
let outerId = 0, innerId = 0, targetId = null;
const innerPending = new Map();

function rawSend(method, params = {}) { ws.send(JSON.stringify({ id: ++outerId, method, params })); }
function targetSend(method, params = {}) {
  return new Promise((resolve) => {
    const mid = ++innerId;
    innerPending.set(mid, resolve);
    rawSend('Target.sendMessageToTarget', { targetId, message: JSON.stringify({ id: mid, method, params }) });
  });
}

const timeout = setTimeout(() => { console.error('TIMEOUT'); process.exit(3); }, 20000);

ws.addEventListener('message', async (ev) => {
  let msg; try { msg = JSON.parse(ev.data); } catch { return; }
  if (msg.method === 'Target.targetCreated' && !targetId) {
    targetId = msg.params.targetInfo.targetId;
    try {
      await targetSend('Runtime.enable');
      const wrapped = `(function(){ try { var __r = (${expr}); return (typeof __r==='undefined')?'undefined':__r; } catch(e){ return 'ERR: '+e.message; } })()`;
      const res = await targetSend('Runtime.evaluate', { expression: wrapped, returnByValue: true, awaitPromise: true });
      clearTimeout(timeout);
      const r = res && res.result && res.result.result ? res.result.result : (res && res.result);
      if (r && 'value' in r) console.log(typeof r.value === 'object' ? JSON.stringify(r.value) : String(r.value));
      else console.log(JSON.stringify(r));
      process.exit(0);
    } catch (e) { console.error('EVAL_FAIL', e.message || e); process.exit(5); }
  }
  if (msg.method === 'Target.dispatchMessageFromTarget') {
    let inner; try { inner = JSON.parse(msg.params.message); } catch { return; }
    if (inner.id && innerPending.has(inner.id)) { innerPending.get(inner.id)(inner); innerPending.delete(inner.id); }
  }
});
ws.addEventListener('error', (e) => { console.error('WS_ERROR', e.message || e); process.exit(4); });
