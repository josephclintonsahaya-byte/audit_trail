type PaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const handlePrevPage = () => {
    if (page > 1) {
      onPageChange(page - 1);
    }
  };

  const handleNextPage = () => {
    if (page < totalPages) {
      onPageChange(page + 1);
    }
  };

  return (
    <div className="pagination">
      <button className="button button--ghost" onClick={handlePrevPage} disabled={page === 1} aria-label="Previous page">
        Previous
      </button>
      <span className="pagination__info">Page {page} of {totalPages}</span>
      <button className="button button--ghost" onClick={handleNextPage} disabled={page === totalPages} aria-label="Next page">
        Next
      </button>
    </div>
  );
}

export default Pagination;
