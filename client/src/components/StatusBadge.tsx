type StatusBadgeProps = {
  status: string;
};

const statusMap: Record<string, { className: string; label: string }> = {
  CREATED: { className: 'status--info', label: 'Created' },
  DISPATCHED: { className: 'status--info', label: 'Dispatched' },
  IN_TRANSIT: { className: 'status--info', label: 'In transit' },
  DELIVERED: { className: 'status--success', label: 'Delivered' },
  DELAYED: { className: 'status--warning', label: 'Delayed' },
  FAILED: { className: 'status--danger', label: 'Failed' },
  CANCELLED: { className: 'status--muted', label: 'Cancelled' },
  active: { className: 'status--success', label: 'Active' },
  inactive: { className: 'status--muted', label: 'Inactive' },
};

function StatusBadge({ status }: StatusBadgeProps) {
  const presentation = statusMap[status] ?? {
    className: 'status--neutral',
    label: status.replaceAll('_', ' '),
  };
  return <span className={`status-badge ${presentation.className}`}>{presentation.label}</span>;
}

export default StatusBadge;
