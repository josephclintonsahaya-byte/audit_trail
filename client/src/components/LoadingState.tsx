type LoadingStateProps = {
  message?: string;
};

function LoadingState({ message = 'Loading data...' }: LoadingStateProps) {
  return (
    <div className="state-panel state-panel--loading" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}

export default LoadingState;
