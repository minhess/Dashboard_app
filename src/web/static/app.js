// Client-side JS: fetch items, submit form, and listen for live updates via Socket.IO
(function () {
  const itemsList = document.getElementById('items-list');
  const form = document.getElementById('item-form');

  function renderItem(item) {
    const li = document.createElement('li');
    li.textContent = `${item.id}: ${item.name} — ${item.value ?? ''}`;
    return li;
  }

  async function loadItems() {
    try {
      const res = await fetch('/api/items');
      const data = await res.json();
      itemsList.innerHTML = '';
      data.forEach(i => itemsList.appendChild(renderItem(i)));
    } catch (err) {
      console.error('failed to load items', err);
    }
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const formData = new FormData(form);
    const payload = {
      name: formData.get('name'),
      value: formData.get('value') ? Number(formData.get('value')) : null,
    };
    try {
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('failed to create');
      form.reset();
      // the server emits new_item via websocket so UI will update
    } catch (err) {
      console.error(err);
      alert('Failed to create item');
    }
  });

  // connect to socket.io
  const socket = io();
  socket.on('connect', () => console.log('socket connected'));
  socket.on('new_item', (item) => {
    itemsList.appendChild(renderItem(item));
  });
  socket.on('new_data', (records) => {
    // update chart with new records
    try {
      console.log('new data', records);
      updateChart(records);
      updateStats(records);
      // optionally update the metrics table rows
      const tbody = document.querySelector('table tbody');
      if (tbody) {
        tbody.innerHTML = '';
        records.forEach(r => {
          const tr = document.createElement('tr');
          tr.innerHTML = `<td>${r.metric}</td><td>${r.value}</td>`;
          tbody.appendChild(tr);
        });
      }
    } catch (e) {
      console.warn('failed to apply new_data', e);
    }
  });

  // initial load
  loadItems();

  // --- Chart.js setup ---
  const chartCanvas = document.getElementById('metrics-chart');
  let metricsChart = null;

  function createChart(labels, values) {
    const ctx = chartCanvas.getContext('2d');
    return new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Value',
          backgroundColor: 'rgba(54,162,235,0.6)',
          borderColor: 'rgba(54,162,235,1)',
          borderWidth: 1,
          data: values
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true }
        }
      }
    });
  }

  function updateChart(records) {
    const labels = records.map(r => r.metric);
    const values = records.map(r => r.value);
    if (!metricsChart) {
      metricsChart = createChart(labels, values);
    } else {
      metricsChart.data.labels = labels;
      metricsChart.data.datasets[0].data = values;
      metricsChart.update();
    }
  }

  // load initial chart data from /api/data
  (async function loadInitialChart() {
    try {
      const res = await fetch('/api/data');
      const data = await res.json();
      updateChart(data);
      updateStats(data);
    } catch (e) {
      console.warn('failed to load initial chart data', e);
    }
  })();

  function updateStats(records) {
    if (!records || !records.length) return;
    const values = records.map(r => Number(r.value) || 0);
    const count = values.length;
    const mean = (values.reduce((a,b) => a+b, 0) / count) || 0;
    const max = Math.max(...values);
    const min = Math.min(...values);
    const setText = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = typeof v === 'number' ? v.toFixed(2) : v;
    };
    setText('stat-count', count);
    setText('stat-mean', mean);
    setText('stat-max', max);
    setText('stat-min', min);
  }
})();
