type StatCardProps = {
  title: string;
  value: string | number;
  detail?: string;
  tone?: 'primary' | 'success' | 'warning' | 'neutral';
};

function StatCard({ title, value, detail, tone = 'neutral' }: StatCardProps) {
  return (
    <article className={`stat-card stat-card--${tone}`}>
      <p className="eyebrow">{title}</p>
      <h3>{value}</h3>
      {detail ? <span>{detail}</span> : null}
    </article>
  );
}

export default StatCard;
