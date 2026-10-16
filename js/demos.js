/* "In action" section. Each demo starts when its tab is opened. */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var section = document.getElementById("demos");
  if (!section) return;

  var tabs = Array.prototype.slice.call(section.querySelectorAll(".demo-tab"));
  var starters = {};
  var started = {};
  var activeId = "panel-mindfirst";
  var sectionVisible = false;

  function select(tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      var panel = document.getElementById(t.getAttribute("aria-controls"));
      panel.hidden = !on;
      panel.classList.toggle("is-active", on);
    });
    if (focus) tab.focus();
    activeId = tab.getAttribute("aria-controls");
    run(activeId);
  }

  function run(id) {
    if (!sectionVisible || !starters[id]) return;
    starters[id](!started[id]);
    started[id] = true;
  }

  tabs.forEach(function (tab, i) {
    tab.addEventListener("click", function () { select(tab, false); });
    tab.addEventListener("keydown", function (e) {
      var n = null;
      if (e.key === "ArrowRight") n = tabs[(i + 1) % tabs.length];
      if (e.key === "ArrowLeft") n = tabs[(i - 1 + tabs.length) % tabs.length];
      if (e.key === "Home") n = tabs[0];
      if (e.key === "End") n = tabs[tabs.length - 1];
      if (n) { e.preventDefault(); select(n, true); }
    });
  });

  /* ---------- shardcache: one door vs 64 doors ---------- */
  // Real benchmark (8 threads, MacBook Air): locked 1.67M ops/s, sharded 8.80M ops/s.
  var LOCKED = 1.67, SHARDED = 8.80;

  function makeLane(canvas, sharded) {
    var ctx = canvas.getContext("2d");
    var W = 0, H = 0, dpr = window.devicePixelRatio || 1;
    var N = 8, R = 6;
    var gateX, rows = [];
    var colors = ["#729C5E", "#5d8a4a", "#8fb37c", "#4f7a3d", "#a3c293", "#6a9a55", "#3d6630", "#86ad72"];
    var dots = [];
    // time units: one "operation" at the door takes SERVE ms. Walking the loop takes WALK ms.
    // With one door the throughput is 1/SERVE; with a door each it is N/(SERVE+WALK).
    // WALK is chosen so the ratio matches the benchmark (8.80 / 1.67).
    var SERVE = 900;
    var WALK = SERVE * (N * LOCKED / SHARDED - 1);
    var gateBusyUntil = 0, queue = [];
    var count = 0;

    function size() {
      var r = canvas.getBoundingClientRect();
      W = r.width; H = r.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      gateX = W * 0.55;
      rows = [];
      for (var i = 0; i < N; i++) rows.push(10 + (H - 20) * (i + 0.5) / N);
    }

    function reset(now) {
      dots = [];
      queue = [];
      gateBusyUntil = 0;
      count = 0;
      for (var i = 0; i < N; i++) {
        // stagger start positions along the walk
        dots.push({ i: i, state: "walk", t0: now - (WALK * i) / N, x: 0, y: rows[i] });
      }
    }

    function walkX(frac) {
      // leave the door, walk off the right edge, come back in on the left, walk up to the door
      var span = W + 2 * R;
      var dist = span - 28;
      var x = gateX + 14 + frac * dist;
      if (x > W + R) x -= span;
      return x;
    }

    function step(now) {
      for (var k = 0; k < dots.length; k++) {
        var d = dots[k];
        if (d.state === "walk") {
          var f = (now - d.t0) / WALK;
          if (f >= 1) {
            d.state = "wait"; d.x = gateX - 14;
            if (sharded) { d.state = "serve"; d.t0 = now; }
            else queue.push(d);
          } else {
            d.x = walkX(f);
            d.y = rows[d.i];
            if (!sharded && d.x < gateX) {
              // funnel toward the single door
              var p = Math.max(0, Math.min(1, d.x / (gateX - 14)));
              d.y = rows[d.i] + (H / 2 - rows[d.i]) * p * p;
            }
          }
        } else if (d.state === "serve" && now - d.t0 >= SERVE) {
          d.state = "walk"; d.t0 = now; count++;
          if (!sharded) gateBusyUntil = now;
        }
      }
      if (!sharded) {
        var serving = dots.some(function (d) { return d.state === "serve"; });
        if (!serving && queue.length) {
          var nx = queue.shift();
          nx.state = "serve"; nx.t0 = now;
        }
        // lay out the queue in a line before the door, on the middle row
        for (var q = 0; q < queue.length; q++) {
          queue[q].x = gateX - 16 - q * (R * 2 + 3);
          queue[q].y = H / 2;
        }
        dots.forEach(function (d) { if (d.state === "serve") { d.x = gateX; d.y = H / 2; } });
      } else {
        dots.forEach(function (d) { if (d.state === "serve") { d.x = gateX; d.y = rows[d.i]; } });
      }
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      // wall with doors
      ctx.fillStyle = "#cfd8ca";
      ctx.fillRect(gateX - 3, 0, 6, H);
      ctx.fillStyle = "#ffffff";
      if (sharded) {
        for (var g = 0; g < 64; g++) {
          var gy = (H * (g + 0.5)) / 64;
          ctx.fillRect(gateX - 3, gy - 0.6, 6, 1.2);
        }
        ctx.fillStyle = "#ffffff";
        rows.forEach(function (y) { ctx.fillRect(gateX - 3, y - R - 1, 6, 2 * R + 2); });
      } else {
        ctx.fillRect(gateX - 3, H / 2 - R - 2, 6, 2 * R + 4);
      }
      dots.forEach(function (d) {
        ctx.beginPath();
        ctx.arc(d.x, d.y, R, 0, Math.PI * 2);
        ctx.fillStyle = d.state === "wait" ? "#c9a24a" : colors[d.i];
        ctx.fill();
      });
      ctx.fillStyle = "#6b7568";
      ctx.font = "11px Nunito, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(count + " done", W - 8, 13);
      if (!sharded && queue.length > 1) {
        ctx.textAlign = "left";
        ctx.fillStyle = "#a07f2c";
        ctx.fillText(queue.length + " waiting", 8, 13);
      }
    }

    size();
    return { size: size, reset: reset, step: step, draw: draw };
  }

  var lanes = null, laneRAF = 0, laneVisible = false;
  function laneLoop(now) {
    lanes.forEach(function (l) { l.step(now); l.draw(); });
    if (activeId === "panel-cache" && laneVisible) laneRAF = requestAnimationFrame(laneLoop);
    else laneRAF = 0;
  }

  function race() {
    var bars = [
      { el: document.getElementById("race-locked"), t: document.getElementById("race-locked-t"), dur: 10 / LOCKED },
      { el: document.getElementById("race-sharded"), t: document.getElementById("race-sharded-t"), dur: 10 / SHARDED }
    ];
    if (reduceMotion) {
      bars.forEach(function (b) { b.el.style.width = "100%"; b.t.textContent = b.dur.toFixed(1) + "s"; });
      return;
    }
    var t0 = performance.now();
    function tick(now) {
      var s = (now - t0) / 1000, done = true;
      bars.forEach(function (b) {
        var f = Math.min(1, s / b.dur);
        b.el.style.width = (f * 100).toFixed(2) + "%";
        b.t.textContent = (f < 1 ? s : b.dur).toFixed(1) + "s";
        if (f < 1) done = false;
      });
      if (!done) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  starters["panel-cache"] = function (first) {
    if (!lanes) {
      lanes = [makeLane(document.getElementById("lane-locked"), false),
               makeLane(document.getElementById("lane-sharded"), true)];
      window.addEventListener("resize", function () { lanes.forEach(function (l) { l.size(); }); });
    } else {
      lanes.forEach(function (l) { l.size(); });
    }
    var now = performance.now();
    lanes.forEach(function (l) { l.reset(now); });
    if (reduceMotion) {
      lanes.forEach(function (l) { l.step(now + 1500); l.draw(); });
    } else if (!laneRAF) {
      laneVisible = true;
      laneRAF = requestAnimationFrame(laneLoop);
    }
    race();
  };
  document.getElementById("race-again").addEventListener("click", race);

  /* ---------- RetrieveAI: question, answer, source ---------- */
  var ragTimers = [];
  var dotsBuilt = false;
  starters["panel-rag"] = function () {
    ragTimers.forEach(clearTimeout); ragTimers = [];
    var q = document.getElementById("rag-q");
    var think = document.getElementById("rag-think");
    var a = document.getElementById("rag-a");
    var src = document.getElementById("rag-src");
    var grid = document.getElementById("rag-dots");
    var text = "How many attention heads does the base model use?";

    if (!dotsBuilt) {
      for (var i = 0; i < 100; i++) grid.appendChild(document.createElement("i"));
      dotsBuilt = true;
    }
    var cells = grid.children;
    // 93 of 100 hits; which ones missed is not shown as meaningful, so misses go at the end
    function fillDots(instant) {
      for (var j = 0; j < 100; j++) cells[j].className = "";
      if (instant) { for (var k = 0; k < 93; k++) cells[k].className = "hit"; return; }
      var n = 0;
      (function add() {
        if (n < 93) { cells[n++].className = "hit"; ragTimers.push(setTimeout(add, 14)); }
      })();
    }

    [think, a, src].forEach(function (el) { el.classList.add("hidden"); });
    if (reduceMotion) {
      q.textContent = text;
      a.classList.remove("hidden"); src.classList.remove("hidden");
      fillDots(true);
      return;
    }
    q.textContent = "";
    var c = 0;
    (function type() {
      q.textContent = text.slice(0, ++c);
      if (c < text.length) ragTimers.push(setTimeout(type, 28));
      else {
        ragTimers.push(setTimeout(function () { think.classList.remove("hidden"); }, 300));
        ragTimers.push(setTimeout(function () { think.classList.add("hidden"); a.classList.remove("hidden"); }, 1700));
        ragTimers.push(setTimeout(function () { src.classList.remove("hidden"); }, 2400));
        ragTimers.push(setTimeout(function () { fillDots(false); }, 2900));
      }
    })();
  };

  /* ---------- OPA: array.flatten ---------- */
  var flatTimer = 0, flatStart = 0;
  starters["panel-opa"] = function () {
    var box = document.getElementById("flatten");
    var label = document.getElementById("flatten-out-label");
    clearInterval(flatTimer); clearTimeout(flatStart);
    box.classList.remove("done");
    if (reduceMotion) { box.classList.add("done"); return; }
    function toggle() {
      box.classList.toggle("done");
      label.style.visibility = box.classList.contains("done") ? "visible" : "hidden";
    }
    label.style.visibility = "hidden";
    flatStart = setTimeout(toggle, 900);
    flatTimer = setInterval(toggle, 2600);
  };

  /* ---------- churn: who is still a customer ---------- */
  // Percent still subscribed by month (0 to 71), traced from the project's Kaplan-Meier chart.
  var M2M = [100,94.8,88.7,85.4,83.1,80.5,79.2,77.4,76.4,75.2,73.9,72.4,70.5,69.3,69,68.3,66.2,65.2,63.7,63.1,62.7,61.5,61,59.6,59.6,58.1,57.5,56.4,55.9,55,53.7,53.4,52.2,51.9,51.2,50,49.4,48.8,48.4,47.2,46.4,45.6,44.1,42.8,42.5,42.2,41.4,40.5,39.7,39,37.9,37.3,36.3,35.4,34.6,34,32.9,32.3,32,30.4,29.5,28.9,28.2,27.2,26.3,25.3,24.2,22.3,19.4,18.6,15.2,14.2];
  var TWO = [100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,99.9,99.9,99.8,99.8,99.7,99.7,99.7,99.7,99.7,99.7,99.7,99.7,99.7,99.7,99.7,99.7,99.7,99.7,99.7,99.6,99.6,99.5,99.4,99.4,99.4,99.2,99.1,99.1,99.1,99.1,98.8,98.6,98.5,98.5,98.5,98.5,98.2,97.9,97.7,97.3,96.9,96.8,96,94.8];
  var churnBuilt = false;
  starters["panel-churn"] = function () {
    var svg = document.getElementById("churn-svg");
    var NS = "http://www.w3.org/2000/svg";
    var L = 48, T = 16, Wd = 452, Hd = 240;
    function x(m) { return L + (m / 72) * Wd; }
    function y(p) { return T + (1 - p / 100) * Hd; }
    function el(name, attrs, parent) {
      var e = document.createElementNS(NS, name);
      for (var k in attrs) e.setAttribute(k, attrs[k]);
      (parent || svg).appendChild(e);
      return e;
    }
    if (!churnBuilt) {
      var grid = el("g", { "class": "grid" });
      var axis = el("g", { "class": "axis" });
      [0, 25, 50, 75, 100].forEach(function (p) {
        el("line", { x1: L, x2: L + Wd, y1: y(p), y2: y(p) }, grid);
        var t = el("text", { x: L - 8, y: y(p) + 4, "text-anchor": "end" }, axis);
        t.textContent = p + "%";
      });
      for (var yr = 0; yr <= 6; yr++) {
        var t2 = el("text", { x: x(yr * 12), y: T + Hd + 18, "text-anchor": "middle" }, axis);
        t2.textContent = yr === 0 ? "Start" : yr + (yr === 1 ? " year" : " yrs");
      }
      function path(data) {
        return data.map(function (p, m) { return (m ? "L" : "M") + x(m).toFixed(1) + " " + y(p).toFixed(1); }).join(" ");
      }
      el("path", { "class": "curve", id: "curve-two", d: path(TWO), stroke: "#729C5E" });
      el("path", { "class": "curve", id: "curve-m2m", d: path(M2M), stroke: "#d9822b" });
      var mark = el("g", { id: "churn-mark", opacity: 0 });
      el("line", { x1: x(60), x2: x(60), y1: y(98.5), y2: y(29.5), stroke: "#999", "stroke-dasharray": "3 3" }, mark);
      el("circle", { cx: x(60), cy: y(29.5), r: 4.5, fill: "#d9822b" }, mark);
      el("circle", { cx: x(60), cy: y(98.5), r: 4.5, fill: "#729C5E" }, mark);
      var a1 = el("text", { x: x(60) - 8, y: y(29.5) + 18, "text-anchor": "end", "font-size": 15, fill: "#b0661c", "font-weight": 700 }, mark);
      a1.textContent = "about 3 in 10 stay";
      var a2 = el("text", { x: x(60) - 8, y: y(98.5) + 16, "text-anchor": "end", "font-size": 15, fill: "#3d6630", "font-weight": 700 }, mark);
      a2.textContent = "almost all stay";
      churnBuilt = true;
    }
    var curves = [document.getElementById("curve-m2m"), document.getElementById("curve-two")];
    var markG = document.getElementById("churn-mark");
    if (reduceMotion) { markG.setAttribute("opacity", 1); return; }
    markG.setAttribute("opacity", 0);
    curves.forEach(function (c) {
      var len = c.getTotalLength();
      c.style.transition = "none";
      c.style.strokeDasharray = len;
      c.style.strokeDashoffset = len;
      c.getBoundingClientRect();
      c.style.transition = "stroke-dashoffset 2.2s ease-in-out";
      c.style.strokeDashoffset = 0;
    });
    setTimeout(function () {
      markG.style.transition = "opacity 0.5s ease";
      markG.setAttribute("opacity", 1);
    }, 2200);
  };

  /* Start the open tab once the section scrolls into view; pause the lanes when it leaves. */
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        sectionVisible = e.isIntersecting || sectionVisible;
        laneVisible = e.isIntersecting;
        if (e.isIntersecting) {
          if (!started[activeId] || activeId === "panel-cache") run(activeId);
        }
      });
    }, { threshold: 0.25 }).observe(section);
  } else {
    sectionVisible = true;
    laneVisible = true;
  }
})();
