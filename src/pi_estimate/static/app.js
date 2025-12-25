(() => {
  const socket = io('/pi');

  const scatter = document.getElementById('scatter');
  const sctx = scatter.getContext('2d');
  let W = 400, H = 400, CX = 200, R = 200;

  // store points so we can redraw on resize
  const points = [];

  // draw square and circle
  function drawBase() {
    sctx.clearRect(0, 0, W, H);
    sctx.fillStyle = '#ffffff';
    sctx.fillRect(0, 0, W, H);
    sctx.strokeStyle = '#333';
    sctx.strokeRect(0, 0, W, H);
    sctx.beginPath();
    sctx.arc(CX, CX, R, 0, Math.PI * 2);
    sctx.strokeStyle = '#007bff';
    sctx.lineWidth = 2;
    sctx.stroke();
  }

  function redrawAllPoints() {
    drawBase();
    for (let p of points) {
      plotPoint(p.x, p.y, p.inside);
    }
  }

  function resizeScatter() {
    // respect CSS width; set internal buffer accordingly
    const left = document.getElementById('left');
    const style = getComputedStyle(left);
    const padLeft = parseFloat(style.paddingLeft || 0) + parseFloat(style.paddingRight || 0);
    const targetWidth = Math.max(100, left.clientWidth - padLeft);
    // make square
    const size = Math.floor(targetWidth);
    scatter.width = size;
    scatter.height = size;
    W = scatter.width;
    H = scatter.height;
    CX = W / 2;
    R = W / 2;
    redrawAllPoints();
  }

  // initial resize as early as possible. If the DOM is already ready, run now,
  // otherwise run on DOMContentLoaded. Also handle window resize with throttle.
  function scheduleResize() {
    clearTimeout(window._pi_resize_timeout);
    window._pi_resize_timeout = setTimeout(() => {
      resizeScatter();
      // let Chart.js re-evaluate container size
      try { chart.resize(); } catch (e) { /* ignore if chart not ready */ }
    }, 120);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    resizeScatter();
  } else {
    document.addEventListener('DOMContentLoaded', resizeScatter);
  }
  window.addEventListener('resize', scheduleResize);

  // Chart.js setup
  const chartCtx = document.getElementById('chart').getContext('2d');
  const labels = [];
  const estimates = [];
  const pis = [];

  const chart = new Chart(chartCtx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        { label: 'Estimated π', data: estimates, borderColor: 'rgb(220,53,69)', fill: false, tension: 0.1 },
        { label: 'Math.PI', data: pis, borderColor: 'rgb(40,167,69)', borderDash: [6,4], fill: false, pointRadius: 0 },
      ],
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { display: true, title: { display: true, text: 'Samples' } },
        y: { display: true, suggestedMin: 2.5, suggestedMax: 4 }
      }
    }
  });

  const totalEl = document.getElementById('total');
  const insideEl = document.getElementById('inside');
  const piEl = document.getElementById('pi');
  const errEl = document.getElementById('error');

  const pauseBtn = document.getElementById('pause-btn');
  const continueBtn = document.getElementById('continue-btn');
  const restartBtn = document.getElementById('restart-btn');

  function setRunning(running) {
    if (pauseBtn) pauseBtn.disabled = !running;
    if (continueBtn) continueBtn.disabled = running;
    if (restartBtn) restartBtn.disabled = false;
  }

  if (pauseBtn) {
    pauseBtn.addEventListener('click', async () => {
      try {
        const res = await fetch('/pi/pause');
        if (res.ok) setRunning(false);
      } catch (e) {
        console.error('Failed to pause:', e);
      }
    });
  }

  if (continueBtn) {
    continueBtn.addEventListener('click', async () => {
      try {
        const res = await fetch('/pi/continue');
        if (res.ok) setRunning(true);
      } catch (e) {
        console.error('Failed to continue:', e);
      }
    });
  }

  function resetUI() {
    // clear points and chart data
    points.length = 0;
    labels.length = 0;
    estimates.length = 0;
    pis.length = 0;
    // clear canvas and redraw base
    drawBase();
    // reset stats
    if (totalEl) totalEl.textContent = '0';
    if (insideEl) insideEl.textContent = '0';
    if (piEl) piEl.textContent = '0';
    if (errEl) errEl.textContent = '0';
    // update chart
    try { chart.update(); } catch (e) { /* ignore */ }
  }

  if (restartBtn) {
    restartBtn.addEventListener('click', async () => {
      try {
        const res = await fetch('/pi/restart');
        if (res.ok) {
          resetUI();
          setRunning(true);
        }
      } catch (e) {
        console.error('Failed to restart:', e);
      }
    });
  }

  function plotPoint(x, y, inside) {
    // If canvas buffer hasn't been sized yet, skip drawing now. Points are
    // still stored in `points` and will be redrawn after resizeScatter runs.
    if (!W || !H) return;

    const px = Math.round(x * W);
    const py = Math.round(y * H);
    sctx.beginPath();
    sctx.fillStyle = inside ? 'rgba(40,167,69,0.95)' : 'rgba(220,53,69,0.95)';
    // draw a slightly larger circular point scaled to canvas size
    const size = Math.max(4, Math.floor(Math.min(W, H) / 60));
    sctx.arc(px, py, size / 2, 0, Math.PI * 2);
    sctx.fill();
  }

  socket.on('connect', () => {
    console.log('connected to /pi socket');
    setRunning(true);
  });

  socket.on('point', (data) => {
    // draw point
    points.push({ x: data.x, y: data.y, inside: data.inside });
    plotPoint(data.x, data.y, data.inside);

    // update stats
    totalEl.textContent = data.total;
    insideEl.textContent = data.inside ? (parseInt(insideEl.textContent || '0') + 1) : insideEl.textContent;
    piEl.textContent = data.pi.toFixed(6);
    errEl.textContent = Math.abs(Math.PI - data.pi).toExponential(3);

    // update chart
    labels.push(data.total);
    estimates.push(data.pi);
    pis.push(Math.PI);

    // limit length
    const MAX = 800;
    if (labels.length > MAX) {
      labels.shift(); estimates.shift(); pis.shift();
    }

    chart.update('none');
  });

  socket.on('disconnect', () => {
    console.log('disconnected from /pi socket');
    setRunning(false);
  });

})();
