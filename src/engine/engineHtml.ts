import { PDFJS_LIB, PDFJS_WORKER } from './pdfjsSource';

// Messages RN -> engine are delivered by calling window.__recv(obj).
// Messages engine -> RN go through window.ReactNativeWebView.postMessage (native) or parent.postMessage (web).

const ENGINE_JS = String.raw`
(function(){
  var lib = window.pdfjsLib;
  try {
    var blob = new Blob([window.__WORKER_SRC], {type:'text/javascript'});
    lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
  } catch(e) {}
  var doc = null, pageNo = -1, pageW = 1, pageH = 1, zoom = 1, mode = 'view', markers = [], renderedW = 0, renderTok = 0;
  var chunks = [];
  var sc = document.getElementById('sc'), wrap = document.getElementById('wrap'), cv = document.getElementById('cv'),
      mk = document.getElementById('mk'), box = document.getElementById('box'), msg = document.getElementById('msg');

  function send(o){ var s = JSON.stringify(o);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s); else window.parent.postMessage({__weng:1, data:s}, '*'); }
  function b64ToBytes(b){ var bin = atob(b), n = bin.length, u = new Uint8Array(n); for (var i=0;i<n;i++) u[i]=bin.charCodeAt(i); return u; }
  function status(t){ msg.textContent = t || ''; msg.style.display = t ? 'block' : 'none'; }

  function layout(){
    var cw = sc.clientWidth - 24;
    var w = Math.max(100, cw * zoom);
    wrap.style.width = w + 'px';
    wrap.style.height = (w * pageH / pageW) + 'px';
    // marker size follows zoom: small at overview, finger-sized once zoomed in
    var ms = Math.max(16, Math.min(32, 48 * w / pageW * 2.2));
    mk.style.setProperty('--ms', ms + 'px');
    mk.style.setProperty('--mf', Math.round(ms * 0.42) + 'px');
  }
  function setZoom(z, cx, cy){
    z = Math.max(1, Math.min(8, z));
    var r = sc.getBoundingClientRect();
    if (cx == null) { cx = r.width/2; cy = r.height/2; }
    var fx = (sc.scrollLeft + cx - 12) / wrap.offsetWidth, fy = (sc.scrollTop + cy - 12) / wrap.offsetHeight;
    zoom = z; layout();
    sc.scrollLeft = fx * wrap.offsetWidth - cx + 12; sc.scrollTop = fy * wrap.offsetHeight - cy + 12;
    scheduleRender(); send({type:'zoom', zoom: zoom});
  }
  var rt = null;
  function scheduleRender(){ clearTimeout(rt); rt = setTimeout(render, 250); }
  async function render(force){
    if (!doc || pageNo < 0) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    var target = Math.min(4096, Math.ceil(wrap.offsetWidth * dpr));
    if (!force && target <= renderedW * 1.15) return;
    var tok = ++renderTok;
    try {
      var page = await doc.getPage(pageNo + 1);
      var vp1 = page.getViewport({scale:1});
      var vp = page.getViewport({scale: target / vp1.width});
      var off = document.createElement('canvas'); off.width = Math.floor(vp.width); off.height = Math.floor(vp.height);
      var ctx = off.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,off.width,off.height);
      await page.render({canvasContext: ctx, viewport: vp, intent: 'print'}).promise;
      if (tok !== renderTok) return;
      cv.width = off.width; cv.height = off.height; cv.getContext('2d').drawImage(off, 0, 0);
      renderedW = target; status('');
    } catch(e) { if (tok === renderTok) status('Could not draw page: ' + (e && e.message)); }
  }

  function drawMarkers(){
    var h = '';
    for (var i=0;i<markers.length;i++){
      var m = markers[i];
      h += '<div class="m" data-id="'+m.id+'" style="left:'+(m.x/pageW*100)+'%;top:'+(m.y/pageH*100)+'%;background:'+m.bg+';color:'+m.fg+';border:'+m.bd+';'+(m.ring?'box-shadow:0 0 0 3px #fff,0 0 0 6px '+m.ring+';':'')+'">'+m.label+(m.tag?'<span class="t" style="background:'+m.tagBg+'">'+m.tag+'</span>':'')+'</div>';
    }
    mk.innerHTML = h;
    sc.style.touchAction = mode === 'select' ? 'none' : 'pan-x pan-y';
    sc.className = 'mode-' + mode;
  }

  function ptToPdf(clientX, clientY){
    var r = wrap.getBoundingClientRect();
    return { x: (clientX - r.left) / r.width * pageW, y: (clientY - r.top) / r.height * pageH };
  }

  // ---- input: taps, box select, pinch ----
  var down = null, pinch = null;
  sc.addEventListener('pointerdown', function(e){
    if (pinch) return;
    var t = e.target.closest ? e.target.closest('.m') : null;
    down = {x:e.clientX, y:e.clientY, id: t ? t.getAttribute('data-id') : null, pid: e.pointerId, moved:false};
    if (mode === 'select' && !down.id) { box.style.display='block'; updBox(e); }
  });
  function updBox(e){
    var r = sc.getBoundingClientRect();
    var x1 = Math.min(down.x, e.clientX) - r.left + sc.scrollLeft, y1 = Math.min(down.y, e.clientY) - r.top + sc.scrollTop;
    box.style.left = x1+'px'; box.style.top = y1+'px';
    box.style.width = Math.abs(e.clientX-down.x)+'px'; box.style.height = Math.abs(e.clientY-down.y)+'px';
  }
  sc.addEventListener('pointermove', function(e){
    if (!down || down.pid !== e.pointerId) return;
    if (Math.abs(e.clientX-down.x) + Math.abs(e.clientY-down.y) > 8) down.moved = true;
    if (mode === 'select' && !down.id && box.style.display==='block') updBox(e);
  });
  sc.addEventListener('pointerup', function(e){
    if (!down || down.pid !== e.pointerId) return;
    var d = down; down = null;
    if (mode === 'select' && !d.id && d.moved) {
      box.style.display = 'none';
      var a = ptToPdf(Math.min(d.x,e.clientX), Math.min(d.y,e.clientY)), b = ptToPdf(Math.max(d.x,e.clientX), Math.max(d.y,e.clientY));
      var ids = markers.filter(function(m){ return m.x>=a.x && m.x<=b.x && m.y>=a.y && m.y<=b.y; }).map(function(m){return m.id;});
      send({type:'box', ids: ids}); return;
    }
    box.style.display = 'none';
    if (d.moved) return;
    if (d.id) { send({type:'tap', id: d.id}); return; }
    if (mode === 'add') { var p = ptToPdf(e.clientX, e.clientY); send({type:'add', x: Math.round(p.x), y: Math.round(p.y)}); return; }
    send({type:'tapEmpty'});
  });
  sc.addEventListener('pointercancel', function(){ down = null; box.style.display='none'; });
  function dist(t){ var dx=t[0].clientX-t[1].clientX, dy=t[0].clientY-t[1].clientY; return Math.sqrt(dx*dx+dy*dy); }
  sc.addEventListener('touchstart', function(e){
    if (e.touches.length === 2) { down = null; box.style.display='none';
      var r = sc.getBoundingClientRect();
      pinch = {d: dist(e.touches), z: zoom, cx: (e.touches[0].clientX+e.touches[1].clientX)/2 - r.left, cy: (e.touches[0].clientY+e.touches[1].clientY)/2 - r.top}; }
  }, {passive:false});
  sc.addEventListener('touchmove', function(e){
    if (pinch && e.touches.length === 2) { e.preventDefault(); setZoom(pinch.z * dist(e.touches) / pinch.d, pinch.cx, pinch.cy); }
  }, {passive:false});
  sc.addEventListener('touchend', function(e){ if (e.touches.length < 2) pinch = null; });
  sc.addEventListener('wheel', function(e){ if (e.ctrlKey) { e.preventDefault(); var r = sc.getBoundingClientRect(); setZoom(zoom * (e.deltaY < 0 ? 1.1 : 0.9), e.clientX-r.left, e.clientY-r.top); } }, {passive:false});
  window.addEventListener('resize', function(){ layout(); scheduleRender(); });

  // ---- text extraction: find each page's drawing number (bottom-right-most match) ----
  async function extract(cands, pattern){
    var out = [], set = {}, i;
    (cands||[]).forEach(function(c){ set[c.replace(/\s+/g,'').toUpperCase()] = c; });
    var re = new RegExp(pattern || '[A-Z0-9]{2,}(?:-[A-Z0-9]{1,}){2,}', 'g');
    for (i = 1; i <= doc.numPages; i++) {
      var best = null, bestScore = -1;
      try {
        var page = await doc.getPage(i), vp = page.getViewport({scale:1}), tc = await page.getTextContent();
        tc.items.forEach(function(it){
          var s = (it.str||'').toUpperCase(); if (!s) return;
          var p = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
          var found = [];
          var compact = s.replace(/\s+/g,'');
          if (cands && cands.length) { Object.keys(set).forEach(function(k){ if (compact.indexOf(k) >= 0) found.push(set[k]); }); }
          else { var m; re.lastIndex = 0; while ((m = re.exec(s))) found.push(m[0]); }
          found.forEach(function(f){ var sc2 = p[0]/vp.width + p[1]/vp.height; if (sc2 > bestScore) { bestScore = sc2; best = f; } });
        });
      } catch(e) {}
      out.push(best || '');
      if (i % 5 === 0) send({type:'progress', text:'Reading drawing numbers ' + i + '/' + doc.numPages});
    }
    return out;
  }

  window.__chunk = function(i, s){ chunks[i] = s; };
  window.__recv = async function(o){
    try {
      if (o.type === 'loadPdf') {
        status('Opening drawings…');
        var b64 = o.b64 != null ? o.b64 : chunks.join(''); chunks = [];
        doc = await lib.getDocument({data: b64ToBytes(b64), disableFontFace: false, useSystemFonts: true, isEvalSupported: false}).promise;
        var sizes = [];
        for (var i=1;i<=doc.numPages;i++){ var pg = await doc.getPage(i), v = pg.getViewport({scale:1}); sizes.push({w: Math.round(v.width*100)/100, h: Math.round(v.height*100)/100}); }
        status('');
        renderedW = 0; if (pageNo >= 0) render(true); // a page may have been requested while loading
        send({type:'pdfLoaded', key: o.key, pages: sizes});
      } else if (o.type === 'unload') {
        doc = null; pageNo = -1; cv.width = 1; cv.height = 1; markers = []; drawMarkers(); status(o.text || '');
      } else if (o.type === 'extract') {
        var r = await extract(o.candidates, o.pattern); send({type:'extracted', dwgs: r});
      } else if (o.type === 'show') {
        mode = o.mode || 'view'; markers = o.markers || [];
        if (o.page !== pageNo) { pageNo = o.page; pageW = o.w; pageH = o.h; zoom = 1; renderedW = 0; cv.width = 1; cv.height = 1; layout(); sc.scrollTop = 0; sc.scrollLeft = 0; status(doc ? 'Loading drawing…' : (o.empty || 'Opening drawings…')); render(true); }
        drawMarkers();
      } else if (o.type === 'zoom') {
        if (o.fit) setZoom(1); else setZoom(zoom * o.factor);
      } else if (o.type === 'status') { status(o.text); }
    } catch(e) { status('Error: ' + (e && e.message)); send({type:'error', message: String(e && e.message)}); }
  };
  status('Starting…');
  send({type:'ready'});
})();
`;

const CSS = `
html,body{margin:0;height:100%;background:#d7d3d3;font-family:-apple-system,system-ui,sans-serif;overflow:hidden;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
#sc{position:absolute;inset:0;overflow:auto;-webkit-overflow-scrolling:touch;touch-action:pan-x pan-y}
#wrap{position:relative;margin:12px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2)}
#cv{position:absolute;left:0;top:0;width:100%;height:100%}
#mk{position:absolute;inset:0}
.m{position:absolute;width:var(--ms,30px);height:var(--ms,30px);transform:translate(-50%,-50%);border-radius:50%;display:flex;align-items:center;justify-content:center;font:700 var(--mf,12px)/1 -apple-system,system-ui,sans-serif;box-sizing:border-box;cursor:pointer}
.m::after{content:'';position:absolute;inset:-8px}
.m .t{position:absolute;left:24px;top:-8px;color:#fff;font-size:9px;padding:2px 4px;white-space:nowrap;border-radius:2px}
.mode-add #wrap{cursor:crosshair}
#box{position:absolute;display:none;border:2px dashed #ec3013;background:rgba(236,48,19,.08);pointer-events:none}
#msg{position:fixed;left:16px;top:16px;background:#201e1d;color:#f3f2f2;padding:8px 12px;font-size:13px;display:none}
`;

export function buildEngineHtml() {
  const safe = (s: string) => s.replace(/<\/script/gi, '<\\/script');
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>${CSS}</style></head><body>
<div id="sc"><div id="wrap"><canvas id="cv" width="1" height="1"></canvas><div id="mk"></div></div><div id="box"></div></div>
<div id="msg"></div>
<script>window.__WORKER_SRC=${safe(JSON.stringify(PDFJS_WORKER))};</script>
<script>${safe(PDFJS_LIB)}</script>
<script>${safe(ENGINE_JS)}</script>
</body></html>`;
}
