VIEWS.overview = async function (main) {
  const d = await api('/dashboard/overview');
  main.innerHTML = `
    <div class="topline">
      <div><h1>Good to see you, ${esc(STATE.user.name.split(' ')[0])}</h1><p>Here's what's happening at the clinic today.</p></div>
    </div>
    <div class="stat-grid">
      <div class="stat-card"><div class="num">${d.todaysAppointments}</div><div class="lbl">Today's appointments</div></div>
      <div class="stat-card"><div class="num">${d.upcomingAppointments}</div><div class="lbl">Upcoming appointments</div></div>
      <div class="stat-card"><div class="num">${d.newPatientsToday}</div><div class="lbl">New patients today</div></div>
      <div class="stat-card"><div class="num">${d.newLeads}</div><div class="lbl">New leads</div></div>
      <div class="stat-card"><div class="num">${fmtMoney(d.todaysRevenue)}</div><div class="lbl">Today's revenue</div></div>
      <div class="stat-card"><div class="num">${d.pendingBookings}</div><div class="lbl">Pending bookings</div></div>
      <div class="stat-card"><div class="num">${d.completedTreatments}</div><div class="lbl">Treatments this month</div></div>
      <div class="stat-card"><div class="num">${fmtMoney(d.outstanding)}</div><div class="lbl">Outstanding balance</div></div>
      <div class="stat-card"><div class="num">${d.totalPatients}</div><div class="lbl">Total patients</div></div>
      <div class="stat-card"><div class="num">${d.unreadMessages}</div><div class="lbl">Unread website messages</div></div>
    </div>

    <div class="panel">
      <div class="panel-head"><h2 class="mb-0">Today's schedule</h2><a href="#" data-goto="appointments" class="btn btn-outline btn-sm">Open calendar</a></div>
      <table>
        <thead><tr><th>Time</th><th>Patient</th><th>Dentist</th><th>Service</th><th>Status</th></tr></thead>
        <tbody>
          ${d.todaySchedule.length ? d.todaySchedule.map(a => `
            <tr><td>${a.time}</td><td>${esc(a.patient_name || '—')}</td><td>${esc(a.dentist_name || 'Unassigned')}</td>
            <td>${esc(a.service_name || '—')}</td><td>${pill(a.status)}</td></tr>`).join('')
      : '<tr class="empty-row"><td colspan="5">No appointments scheduled for today.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
  main.querySelector('[data-goto]')?.addEventListener('click', (e) => { e.preventDefault(); go(e.target.dataset.goto); });
};
