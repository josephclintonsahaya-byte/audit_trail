type ErrorStateProps = {
  message: string;
  title?: string;
  onRetry?: () => void;
};

function ErrorState({ message, title = 'Unable to load data', onRetry }: ErrorStateProps) {
  return (
    <div className="state-panel state-panel--error" role="alert">
      <h3>{title}</h3>
      <p>{message}</p>
      {onRetry ? <button type="button" className="button button--ghost" onClick={onRetry}>Retry</button> : null}
    </div>
  );
}

export default ErrorState;
