"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const PAGE_SIZE_OPTIONS = [5, 10, 15, 20] as const;
export type ListPageSize = (typeof PAGE_SIZE_OPTIONS)[number];

type ListPaginationProps = {
  totalItems: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: ListPageSize) => void;
  loading?: boolean;
  showPageNumbers?: boolean;
};

export function ListPagination({
  totalItems,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  loading = false,
  showPageNumbers = true,
}: ListPaginationProps) {
  if (totalItems <= 5) return null;

  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.max(1, Math.min(page, pageCount));
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);
  const firstVisiblePage = Math.max(
    1,
    Math.min(currentPage - 2, pageCount - 4),
  );
  const visiblePages = Array.from(
    { length: Math.min(5, pageCount) },
    (_, index) => firstVisiblePage + index,
  );

  return (
    <nav className="list-pagination" aria-label="Pagination de la liste">
      <label className="list-pagination__size">
        <span>Lignes par page</span>
        <select
          value={pageSize}
          disabled={loading}
          onChange={(event) =>
            onPageSizeChange(Number(event.target.value) as ListPageSize)
          }
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      <span className="list-pagination__range" aria-live="polite">
        {start}–{end} sur {totalItems}
      </span>
      <div className="list-pagination__pages">
        <button
          type="button"
          className="list-pagination__arrow"
          aria-label="Page précédente"
          disabled={currentPage <= 1 || loading}
          onClick={() => onPageChange(currentPage - 1)}
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        {showPageNumbers ? visiblePages.map((visiblePage) => (
          <button
            type="button"
            key={visiblePage}
            className={`list-pagination__number${visiblePage === currentPage ? " is-active" : ""}`}
            aria-label={`Page ${visiblePage}`}
            aria-current={visiblePage === currentPage ? "page" : undefined}
            disabled={loading}
            onClick={() => onPageChange(visiblePage)}
          >
            {visiblePage}
          </button>
        )) : null}
        <button
          type="button"
          className="list-pagination__arrow"
          aria-label="Page suivante"
          disabled={currentPage >= pageCount || loading}
          onClick={() => onPageChange(currentPage + 1)}
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}

export function useListPagination<T>(
  items: T[],
  initialPageSize: ListPageSize = 10,
  showPageNumbers = true,
) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<ListPageSize>(initialPageSize);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, pageCount);

  return {
    pageItems: items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    resetPage: () => setPage(1),
    pagination: (
      <ListPagination
        totalItems={items.length}
        page={currentPage}
        pageSize={pageSize}
        onPageChange={setPage}
        showPageNumbers={showPageNumbers}
        onPageSizeChange={(nextSize) => {
          setPageSize(nextSize);
          setPage(1);
        }}
      />
    ),
  };
}
