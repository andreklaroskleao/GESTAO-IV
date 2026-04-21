export function createReceivablesAlertsModule(ctx) {
  const { state } = ctx;

  function parseDate(dateString) {
    if (!dateString) return null;
    const date = new Date(`${dateString}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function startOfToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  function diffDays(from, to) {
    return Math.round((to.getTime() - from.getTime()) / 86400000);
  }

  function getReceivablesNotifications() {
    const today = startOfToday();

    return (state.accountsReceivable || [])
      .filter((item) => Number(item.openAmount || 0) > 0 && item.dueDate)
      .map((item) => {
        const due = parseDate(item.dueDate);
        if (!due) return null;

        const days = diffDays(today, due);

        let level = '';
        let title = '';

        if (days < 0) {
          level = 'danger';
          title = `Conta vencida há ${Math.abs(days)} dia(s)`;
        } else if (days === 0) {
          level = 'warning';
          title = 'Conta vence hoje';
        } else if (days <= 3) {
          level = 'info';
          title = `Conta vence em ${days} dia(s)`;
        } else {
          return null;
        }

        return {
          id: item.id,
          level,
          title,
          clientName: item.clientName || 'Cliente',
          dueDate: item.dueDate,
          amount: Number(item.openAmount || 0),
          description: item.description || ''
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }

  function getNotificationSummary() {
    const rows = getReceivablesNotifications();

    return {
      total: rows.length,
      overdue: rows.filter((item) => item.level === 'danger').length,
      today: rows.filter((item) => item.title === 'Conta vence hoje').length,
      upcoming: rows.filter((item) => item.level === 'info').length,
      items: rows
    };
  }

  return {
    getReceivablesNotifications,
    getNotificationSummary
  };
}