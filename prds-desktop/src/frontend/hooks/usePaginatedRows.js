import { useMemo, useState } from "react";

export const DEFAULT_PAGE_SIZE = 10;

export function usePaginatedRows(rows = [], pageSize = DEFAULT_PAGE_SIZE) {
  const [currentPage, setCurrentPage] = useState(1);
  const [prevRows, setPrevRows] = useState(rows);

  if (rows !== prevRows) {
    setPrevRows(rows);
    setCurrentPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedRows = useMemo(() => {
    const startIndex = (safePage - 1) * pageSize;

    return rows.slice(startIndex, startIndex + pageSize);
  }, [safePage, pageSize, rows]);

  return {
    currentPage: safePage,
    paginatedRows,
    pageSize,
    setCurrentPage,
    totalCount: rows.length,
    totalPages,
  };
}
